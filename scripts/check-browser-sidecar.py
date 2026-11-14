"""Exercise the packaged Windows worker with synthetic pages, never private files.

Run after build-browser-sidecar.ps1. Fail if the artifact or real Chromium is absent.
Only metadata/hashes are printed; screenshots stay in memory.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import queue
import subprocess
import threading


def main():
    executable = Path(__file__).resolve().parents[1] / "browser-sidecar/runtime/workbench/workbench.exe"
    env = {key: value for key, value in os.environ.items() if "proxy" not in key.lower()}
    env["PLAYWRIGHT_BROWSERS_PATH"] = "0"
    child = subprocess.Popen([str(executable)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, env=env, text=True, encoding="utf-8")
    replies = queue.Queue()

    def read():
        for line in child.stdout:
            replies.put(line)
        replies.put(None)

    threading.Thread(target=read, daemon=True).start()
    seq = 0

    def raw(packet):
        child.stdin.write(json.dumps(packet) + "\n")
        child.stdin.flush()
        response = replies.get(timeout=25)
        assert response is not None, "worker exited: " + child.stderr.read(2000)
        return json.loads(response)

    def step(op, **args):
        nonlocal seq
        seq += 1
        response = raw({"task_id": "synthetic-task", "seq": seq, "op": op, **args})
        assert response["ok"], (op, response)
        return response["body"]

    html = """<!doctype html><title>Synthetic preview</title><style>
    body { margin:0; background:white; } canvas {display:block;} .tall {height:1600px;}
    </style><button onclick="document.querySelector('output').textContent='Clicked'">Toggle</button>
    <input aria-label="Name"><select aria-label="Choice"><option>A</option><option>B</option></select>
    <output>Waiting</output><canvas width="300" height="200"></canvas><div class="tall">Tail</div>
    <img src="missing.svg"><iframe src="http://192.0.2.1/private"></iframe>
    <script src="http://192.0.2.1/forbidden.js"></script><script>
    const ctx=document.querySelector('canvas').getContext('2d');
    ctx.fillStyle='#f0254f';ctx.fillRect(0,0,150,200);
    ctx.fillStyle='#205fe5';ctx.fillRect(150,0,150,200);
    console.error('token=synthetic-secret');setTimeout(()=>{throw Error('synthetic-pageerror')},20);
    </script>"""
    try:
        assert raw([])["ok"] is False
        assert step("start", files={"fixture.html": html}, path="fixture.html")["loaded"] is True
        view = step("snapshot")
        assert view["viewport"] == {"width": 1440, "height": 900}
        assert view["dimensions"]["canvasCount"] == 1
        refs = {item["tag"]: item["ref"] for item in view["elements"]}
        step("fill", ref=refs["input"], snapshot_seq=view["snapshot_seq"], value="Synthetic")
        stale = raw({"task_id": "synthetic-task", "seq": seq + 1, "op": "click",
                     "ref": refs["button"], "snapshot_seq": view["snapshot_seq"]})
        assert stale["ok"] is False and stale["error"] == "stale_element_ref"
        view = step("snapshot")
        button = next(item for item in view["elements"] if item["tag"] == "button")
        step("click", ref=button["ref"], snapshot_seq=view["snapshot_seq"])
        assert "Clicked" in step("snapshot")["text"]
        for mode in ("viewport", "full_page"):
            image = step("screenshot", mode=mode)
            data = b"".join(base64.b64decode(step("screenshot_part", sha256=image["screenshot_sha256"], index=i)["data"], validate=True)
                            for i in range(image["chunks"]))
            assert data[:2] == b"\xff\xd8"
            assert hashlib.sha256(data).hexdigest() == image["screenshot_sha256"]
            assert len(data) == image["bytes"]
            print(json.dumps({"capture": mode, "sha256": image["screenshot_sha256"], "bytes": len(data)}))
        messages = step("console")["messages"]
        kinds = {message["kind"] for message in messages}
        assert {"console_error", "pageerror", "resource_404", "blocked_request"} <= kinds, kinds
        assert "synthetic-secret" not in json.dumps(messages)
        step("resize", viewport="mobile")
        assert step("snapshot")["viewport"] == {"width": 390, "height": 844}
        step("scroll", delta=600)
        replacement = html.replace("Waiting", "Saved revision")
        assert step("reload", files={"fixture.html": replacement}, path="fixture.html")["loaded"] is True
        assert "Saved revision" in step("snapshot")["text"]
        # A Vite-style React/TSX source tree is compiled by the fixed compiler, never its package scripts.
        project = {
            "index.html": '<!doctype html><div id="root"></div><script type="module" src="/src/main.tsx"></script>',
            "src/main.tsx": 'import React from "react";import {createRoot} from "react-dom/client";'
                            'import App from "./App";import "./style.css";createRoot(document.getElementById("root")).render(<App/>);',
            "src/App.tsx": 'import {useState} from "react";export default function App(){const [n,setN]=useState<number>(0);'
                           'return <button onClick={()=>setN(n+1)}>React count {n}</button>}',
            "src/style.css": 'button{background:rgb(20,80,180);color:white}',
            "package.json": '{"scripts":{"dev":"never-execute-this-command"}}',
        }
        step("reload", files=project, path="index.html")
        view = step("snapshot")
        assert "React count 0" in view["text"], (view, step("console"))
        button = next(item for item in view["elements"] if item["tag"] == "button")
        step("click", ref=button["ref"], snapshot_seq=view["snapshot_seq"])
        assert "React count 1" in step("snapshot")["text"]
        image = step("screenshot")
        print(json.dumps({"capture": "vite-react-tsx", "sha256": image["screenshot_sha256"], "bytes": image["bytes"]}))
        scene = '<!doctype html><script type="module">import * as THREE from "three";'
        scene += 'const r=new THREE.WebGLRenderer();r.setSize(300,200);document.body.append(r.domElement);'
        scene += 'const s=new THREE.Scene();s.background=new THREE.Color(0x254f98);'
        scene += 'r.render(s,new THREE.PerspectiveCamera());document.body.dataset.rendered="yes";'
        scene += 'document.body.append("Three rendered; WebRTC="+typeof RTCPeerConnection);</script>'
        step("reload", files={"scene.html": scene}, path="scene.html")
        view = step("snapshot")
        assert "Three rendered; WebRTC=undefined" in view["text"], (view, step("console"))
        assert view["dimensions"]["canvasCount"] == 1
        image = step("screenshot")
        print(json.dumps({"capture": "three-webgl", "sha256": image["screenshot_sha256"], "bytes": image["bytes"]}))
        step("close")
        assert child.wait(timeout=5) == 0
        print("PASS: packaged Chromium persistent interaction, captures, errors, redaction, reload and close")
    finally:
        child.stdin.close()
        if child.poll() is None:
            child.kill()
        child.wait(timeout=5)


if __name__ == "__main__":
    main()
