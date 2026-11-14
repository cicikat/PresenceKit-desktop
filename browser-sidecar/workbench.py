"""Private JSON-lines Playwright worker. No filesystem, shell or external URL API.

The native executor supplies a bounded snapshot of files read through its existing
grant implementation. Each process owns one task and an ephemeral browser context.
"""
from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
import queue
import re
import sys
import subprocess
import threading
import time
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

LIMIT = 384 * 1024
CHUNK = 40000
VIEWPORTS = {"desktop": {"width": 1440, "height": 900}, "mobile": {"width": 390, "height": 844}}
RUNTIME = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent)) / "preview-runtime"
VENDORS = {"react": "react.js", "react/jsx-runtime": "react-jsx-runtime.js",
           "react-dom/client": "react-dom-client.js", "three": "three.js"}


class Workbench:
    def __init__(self):
        self.runtime = self.browser = self.context = self.page = None
        self.task = None
        self.files = {}
        self.messages = []
        self.capture = None
        self.refs = {}
        self.snapshot_seq = 0
        self.started = time.monotonic()
        # This origin is intercepted completely; no listening socket or DNS lookup.
        self.origin = "http://127.0.0.1:18743"

    def note(self, kind, value):
        # Strip URLs, query strings, credentials and long application payloads.
        text = re.sub(r"(?:https?|file|wss?)://\S+", "[url]", str(value))
        text = re.sub(r"(?i)(token|password|authorization|cookie|secret)\s*[:=]\s*\S+", r"\1=[redacted]", text)
        self.messages.append({"kind": kind, "text": text[:240]})
        self.messages = self.messages[-30:]

    def console(self, message):
        if message.type != "error":
            return
        text = message.text
        self.note("console_error", text)
        if "Content Security Policy" in text or "content security policy" in text.lower():
            self.note("blocked_request", "preview content policy blocked a resource or navigation")

    def update(self, packet):
        files = packet.get("files")
        if not isinstance(files, dict) or not 1 <= len(files) <= 40:
            raise ValueError("invalid_manifest")
        if sum(len(v.encode("utf-8")) for v in files.values() if isinstance(v, str)) > 2 * 1024 * 1024:
            raise ValueError("preview_too_large")
        for key, content in files.items():
            if (not isinstance(content, str) or not key or key.startswith(("/", "@presence/")) or "\\" in key
                    or any(part in {"", ".", ".."} for part in key.split("/"))
                    or urlsplit(key).scheme or "?" in key or "#" in key):
                raise ValueError("invalid_manifest")
        self.files = files

    def module(self, content, extension):
        # Transform stdin only: no build, resolver, plugins, config, package scripts or source path.
        # esbuild cannot follow imports or read project files in this mode.
        result = subprocess.run([str(RUNTIME / "esbuild.exe"), "--loader=" + extension,
                                 "--format=esm", "--jsx=automatic", "--target=es2020"],
                                input=content, text=True, encoding="utf-8", capture_output=True, timeout=5,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode or len(result.stdout) > 1024 * 1024:
            self.note("compile_error", "preview source could not be transformed")
            raise ValueError("preview_compile_failed")
        return result.stdout

    def route(self, route):
        request = route.request
        parsed = urlsplit(request.url)
        if (f"{parsed.scheme}://{parsed.netloc}" != self.origin or request.method not in {"GET", "HEAD"}
                or parsed.query or parsed.username or parsed.password):
            self.note("blocked_request", request.method)
            return route.abort("blockedbyclient")
        path = unquote(parsed.path).lstrip("/")
        if path.startswith("@presence/"):
            name = path.removeprefix("@presence/")
            if name not in VENDORS.values():
                return route.fulfill(status=404, body="Not found")
            return route.fulfill(status=200, body=(RUNTIME / name).read_bytes(), content_type="text/javascript")
        if path not in self.files:
            # Standard Vite source imports often omit extensions. Resolve within the finite manifest only.
            path = next((name for suffix in (".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.js")
                         if (name := path + suffix) in self.files), path)
        if path not in self.files:
            self.note("resource_404", "missing preview resource")
            return route.fulfill(status=404, body="Not found")
        extension = path.rsplit(".", 1)[-1].lower()
        content = self.files[path]
        if extension in {"ts", "tsx", "jsx", "js", "mjs"}:
            try:
                content = self.module(content, extension if extension in {"ts", "tsx", "jsx"} else "js")
            except (ValueError, OSError, subprocess.TimeoutExpired):
                self.note("compile_error", "trusted preview compiler unavailable or failed")
                return route.fulfill(status=422, body="Preview compilation failed", content_type="text/javascript")
            extension = "js"
        elif extension == "css" and request.resource_type == "script":
            # Side-effect CSS imports generated by common Vite templates, without arbitrary module resolution.
            content = "const s=document.createElement('style');s.textContent=" + json.dumps(content) + ";document.head.append(s);"
            extension = "js"
        elif extension in {"html", "htm"}:
            imports = {name: self.origin + "/@presence/" + file for name, file in VENDORS.items()}
            content = re.sub(r"(<head(?:\s[^>]*)?>|<!doctype[^>]*>)",
                             lambda m: m[0] + '<script type="importmap">' + json.dumps({"imports": imports}) + '</script>',
                             content, count=1, flags=re.IGNORECASE) if re.search(r"<head|<!doctype", content, re.I) else (
                                 '<script type="importmap">' + json.dumps({"imports": imports}) + '</script>' + content)
        mime = {"html": "text/html", "htm": "text/html", "css": "text/css", "js": "text/javascript",
                "mjs": "text/javascript", "json": "application/json", "svg": "image/svg+xml"}.get(extension, "text/plain")
        route.fulfill(status=200, body=content, content_type=mime,
                      headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                               "Content-Security-Policy": "default-src 'self' data: blob:; connect-src 'none'; "
                               "script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; "
                               "form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"})

    def navigate(self, path):
        if not isinstance(path, str) or path not in self.files or not path.lower().endswith((".html", ".htm")):
            raise ValueError("path_denied")
        self.page.goto(self.origin + "/" + path, wait_until="load", timeout=10000)
        self.refs = {}
        self.capture = None
        return {"page": path, "loaded": True, "visual_checked": False}

    def stable(self):
        # Bounded rendering wait, including fonts and two frames. Animation need not end.
        self.page.evaluate("""async () => {
          await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 500))]);
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }""")
        self.page.wait_for_timeout(200)

    def snapshot(self, seq):
        self.refs = {}
        items = []
        candidates = self.page.locator("button,a,input,select,textarea,[role=button]")
        for index in range(min(candidates.count(), 60)):
            locator = candidates.nth(index)
            if not locator.is_visible():
                continue
            ref = f"e{seq}_{index}"
            self.refs[ref] = locator
            items.append({"ref": ref, "tag": locator.evaluate("e => e.tagName.toLowerCase()"),
                          "label": (locator.get_attribute("aria-label") or locator.inner_text() or
                                    locator.get_attribute("placeholder") or "")[:120],
                          "bounds": locator.bounding_box()})
        self.snapshot_seq = seq
        dimensions = self.page.evaluate("""() => ({width:innerWidth,height:innerHeight,
          scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
          canvasCount:document.querySelectorAll('canvas').length})""")
        return {"page": urlsplit(self.page.url).path, "viewport": self.page.viewport_size,
                "dimensions": dimensions, "text": self.page.locator("body").inner_text()[:7000],
                "aria": self.page.locator("body").aria_snapshot(timeout=3000)[:9000], "elements": items,
                "snapshot_seq": seq, "content_trust": "untrusted_page"}

    def execute(self, packet):
        task, seq, op = packet["task_id"], packet["seq"], packet["op"]
        if self.task and self.task != task:
            raise ValueError("task_binding_mismatch")
        if time.monotonic() - self.started > 600:
            raise ValueError("expired")
        if op == "start":
            if self.task:
                raise ValueError("session_already_started")
            self.task = task
            self.update(packet)
            self.runtime = sync_playwright().start()
            self.browser = self.runtime.chromium.launch(headless=True, args=["--no-proxy-server", "--disable-background-networking",
                "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--webrtc-ip-handling-policy=disable_non_proxied_udp",
                "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"])
            self.context = self.browser.new_context(viewport=VIEWPORTS["desktop"], service_workers="block",
                                                    accept_downloads=False)
            self.context.route("**/*", self.route)
            self.context.route_web_socket("**/*", lambda socket: socket.close())
            self.context.add_init_script("""for (const key of ['RTCPeerConnection','webkitRTCPeerConnection']) {
              Object.defineProperty(globalThis, key, {value:undefined,writable:false,configurable:false});
            }""")
            self.page = self.context.new_page()
            self.page.on("console", self.console)
            self.page.on("pageerror", lambda error: self.note("pageerror", error))
            self.page.on("requestfailed", lambda request: self.note("request_failed", request.failure))
            self.page.on("dialog", lambda dialog: dialog.dismiss())
            self.page.on("popup", lambda popup: popup.close())
            self.page.on("download", lambda download: download.cancel())
            self.page.on("framenavigated", lambda frame: self.note("unexpected_navigation", "outside preview")
                         if frame.url and not frame.url.startswith(self.origin + "/") and frame.url != "about:blank" else None)
            return self.navigate(packet["path"])
        if not self.page:
            raise ValueError("session_not_started")
        if op == "close":
            self.close()
            return {"closed": True}
        if op in {"open", "reload"}:
            if op == "reload":
                self.update(packet)
            return self.navigate(packet.get("path") or urlsplit(self.page.url).path.lstrip("/"))
        if op == "console":
            return {"messages": self.messages, "content_trust": "untrusted_page"}
        current = urlsplit(self.page.url)
        if (f"{current.scheme}://{current.netloc}" != self.origin
                or unquote(current.path).lstrip("/") not in self.files):
            raise ValueError("navigation_denied")
        if op == "snapshot":
            return self.snapshot(seq)
        if op == "screenshot":
            self.stable()
            mode = packet.get("mode", "viewport")
            if mode == "full_page":
                height = min(self.page.evaluate("document.documentElement.scrollHeight"), 4096)
                raw = self.page.screenshot(type="jpeg", quality=65, clip={"x": 0, "y": 0,
                                           "width": self.page.viewport_size["width"], "height": height},
                                           full_page=True, timeout=5000)
            elif mode == "element":
                locator = self.refs.get(packet.get("ref"))
                if locator is None:
                    raise ValueError("stale_element_ref")
                raw = locator.screenshot(type="jpeg", quality=65, timeout=5000)
            elif mode == "viewport":
                raw = self.page.screenshot(type="jpeg", quality=65, timeout=5000)
            else:
                raise ValueError("invalid_capture_mode")
            if not raw or len(raw) > LIMIT:
                raise ValueError("screenshot_too_large")
            digest = hashlib.sha256(raw).hexdigest()
            self.capture = {"raw": raw, "sha256": digest}
            # Dimensions from JPEG itself are validated again by the broker.
            return {"screenshot_sha256": digest, "bytes": len(raw), "chunks": (len(raw) + CHUNK - 1) // CHUNK,
                    "viewport": self.page.viewport_size, "captured_at": time.time(), "action_seq": seq,
                    "page_sha256": hashlib.sha256(self.page.url.encode()).hexdigest(), "mode": mode}
        if op == "screenshot_part":
            if not self.capture or packet.get("sha256") != self.capture["sha256"]:
                raise ValueError("stale_screenshot")
            index = packet.get("index")
            if type(index) is not int or not 0 <= index < (len(self.capture["raw"]) + CHUNK - 1) // CHUNK:
                raise ValueError("invalid_chunk")
            return {"index": index, "sha256": self.capture["sha256"],
                    "data": base64.b64encode(self.capture["raw"][index * CHUNK:(index + 1) * CHUNK]).decode("ascii")}
        if op in {"click", "fill", "select", "hover"}:
            if packet.get("snapshot_seq") != self.snapshot_seq:
                raise ValueError("stale_element_ref")
            locator = self.refs.get(packet.get("ref"))
            if locator is None:
                raise ValueError("stale_element_ref")
            if op == "click":
                locator.click(timeout=3000, no_wait_after=True)
            elif op == "hover":
                locator.hover(timeout=3000)
            elif op == "fill":
                value = packet.get("value", "")
                if not isinstance(value, str) or len(value) > 1000:
                    raise ValueError("invalid_value")
                locator.fill(value, timeout=3000)
            else:
                locator.select_option(packet.get("value", ""), timeout=3000)
            self.refs = {}
            self.capture = None
            return {"action_applied": True, "business_success": "unverified"}
        if op == "scroll":
            delta = packet.get("delta", 600)
            if type(delta) is not int or not -2000 <= delta <= 2000:
                raise ValueError("invalid_scroll")
            self.page.mouse.wheel(0, delta)
        elif op == "resize":
            viewport = packet.get("viewport")
            if viewport not in VIEWPORTS:
                raise ValueError("invalid_viewport")
            self.page.set_viewport_size(VIEWPORTS[viewport])
        else:
            raise ValueError("unsupported_operation")
        self.refs = {}
        self.capture = None
        return {"viewport": self.page.viewport_size, "action_applied": True}

    def close(self):
        if self.context:
            self.context.close()
        if self.browser:
            self.browser.close()
        if self.runtime:
            self.runtime.stop()
        self.context = self.browser = self.runtime = self.page = None
        self.files.clear()
        self.capture = None


def main():
    worker = Workbench()
    incoming = queue.Queue(maxsize=2)

    def read():
        for raw in sys.stdin:
            incoming.put(raw)
        incoming.put(None)

    threading.Thread(target=read, daemon=True).start()
    try:
        while time.monotonic() - worker.started <= 600:
            try:
                raw = incoming.get(timeout=.2)
            except queue.Empty:
                continue
            if raw is None or len(raw) > 3 * 1024 * 1024:
                break
            try:
                packet = {}
                decoded = json.loads(raw)
                if not isinstance(decoded, dict):
                    raise ValueError("invalid_packet")
                packet = decoded
                body = worker.execute(packet)
                reply = {"ok": True, "body": body}
            except ValueError as error:
                reply = {"ok": False, "error": str(error)[:80]}
            except Exception:
                reply = {"ok": False, "error": "browser_execution_failed"}
            print(json.dumps(reply, ensure_ascii=True), flush=True)
            if packet.get("op") == "close":
                break
    finally:
        worker.close()


if __name__ == "__main__":
    main()
