"""Production playback/stage regression. Tauri transport and TTS bytes are fixture data."""
import argparse
import base64
import io
import json
import math
from pathlib import Path
import shutil
import struct
import wave
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--base-url', default='http://localhost:1420')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
fixture = root / '.tmp'
fixture.mkdir(exist_ok=True)
shutil.copyfile(root / 'scripts/fixtures/live2d-playback.tsx', fixture / 'live2d-playback.tsx')
(fixture / 'live2d-playback.html').write_text('<div id="root"></div><script type="module" src="./live2d-playback.tsx"></script>', encoding='utf-8')
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
buffer = io.BytesIO()
with wave.open(buffer, 'wb') as wav:
    wav.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
    wav.writeframes(b''.join(struct.pack('<h', int(12000 * math.sin(2 * math.pi * 220 * i / 16000))
                               if 0.5 < i / 16000 < 1.8 else 0) for i in range(40000)))
audio_b64 = base64.b64encode(buffer.getvalue()).decode('ascii')
mock = '''(() => {
 const callbacks=new Map(),listeners=new Map();let next=0;
 window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:(_event,id)=>listeners.delete(id)};
 window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'fixture'}},transformCallback:fn=>{callbacks.set(++next,fn);return next},invoke:async(cmd,args)=>{
 if(cmd==='load_ui_prefs')return '{}';if(cmd==='save_ui_prefs')return null;
 if(cmd==='list_live2d_models')return [{dirName:'hlr_yexuan_mingyun_base',modelJson:'yexuan_mingyun.model3.json',mocVersion:1}];
 if(cmd==='synthesize_desktop_voice')return {audio_b64:window.testAudio,mime:'audio/wav'};
 if(cmd==='plugin:event|listen'){listeners.set(++next,args);return next}
 if(cmd==='plugin:event|unlisten'){listeners.delete(args.eventId);return}
 if(cmd==='plugin:event|emit'||cmd==='plugin:event|emit_to'){for(const [id,entry] of listeners)if(entry.event===args.event)callbacks.get(entry.handler)?.({id,event:args.event,payload:args.payload});return}
 throw new Error('Unexpected Tauri: '+cmd);
 }};
 const NativeAudio=window.Audio;window.audioElements=[];
 window.Audio=class extends NativeAudio{constructor(...args){super(...args);window.audioElements.push(this)}};
 const NativeContext=window.AudioContext;window.audioContexts=[];
 window.AudioContext=class extends NativeContext{constructor(...args){super(...args);window.audioContexts.push(this)}};
})();'''
reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    for surface, analysis in [('pet', True), ('room', True), ('pet', False), ('room', False)]:
        page = browser.new_page(viewport={'width': 1000, 'height': 1000})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.add_init_script('window.fixtureSurface=' + json.dumps(surface) + ';window.testAudio=' + json.dumps(audio_b64) + ';' + mock)
        if not analysis:
            page.add_init_script("window.AudioContext=class{constructor(){throw new Error('fixture: analysis unavailable')}}")
        try:
            page.goto(args.base_url + '/.tmp/live2d-playback.html', wait_until='networkidle')
            page.wait_for_function('window.controls?.() && window.playbackAudit.mouths.length>20', timeout=45000)
            page.evaluate('window.playbackAudit.mouths=[];window.setMic(1)')
            page.wait_for_timeout(250)
            assert page.evaluate('Math.max(...window.playbackAudit.mouths)') < 0.001, 'microphone drove mouth'
            page.get_by_role('button', name='播放语音', exact=True).click()
            page.wait_for_function('window.audioElements[0]?.currentTime>0.2')
            if analysis:
                assert page.evaluate('window.playbackAudit.levels.some(x=>x.available&&x.volume===0)'), 'no measured silence'
            page.wait_for_function('window.audioElements[0].currentTime>0.8')
            mouth = page.evaluate('Math.max(...window.playbackAudit.mouths.slice(-20))')
            assert mouth > 0.12, (surface, analysis, mouth)
            assert page.evaluate("window.playbackAudit.motions.includes('motions/talk01.motion3.json')"), 'speaking action absent'
            if analysis:
                assert page.evaluate('window.playbackAudit.levels.some(x=>x.available&&x.volume>0.2)')
            page.screenshot(path=str(out / f'{surface}-{analysis}-speaking.png'))
            page.wait_for_function('window.audioElements[0].ended')
            page.wait_for_function('window.playbackAudit.mouths.at(-1)<0.01', timeout=2500)
            assert page.evaluate("window.playbackAudit.motions.at(-1)==='motions/idle_loop.motion3.json'"), 'idle not restored'
            # Replay reuses the same media source. Pause clears output and returns to idle.
            page.get_by_role('button', name='播放语音', exact=True).click()
            page.wait_for_function('window.audioElements[0].currentTime>0.8&&!window.audioElements[0].paused')
            page.get_by_role('button', name='暂停语音', exact=True).click()
            page.wait_for_function('window.playbackAudit.mouths.at(-1)<0.01', timeout=2500)
            if analysis:
                assert page.evaluate('window.audioContexts.length') == 1
            page.get_by_role('button', name='播放语音', exact=True).click()
            page.wait_for_function('!window.audioElements[0].paused')
            page.evaluate('window.setPlaybackVisible(false)')
            page.wait_for_timeout(450)
            assert page.evaluate('window.audioElements[0].paused')
            if analysis:
                assert page.evaluate("window.audioContexts[0].state==='closed'")
            assert not errors, errors
            reports.append(dict(surface=surface, analysis=analysis, mouth=mouth, microphoneIgnored=True,
                                replay=True, pause=True, endIdle=True, unmount=True, errors=errors))
            print('PASS', json.dumps(reports[-1]), flush=True)
        except Exception:
            page.screenshot(path=str(out / f'{surface}-{analysis}-failed.png'))
            print('AUDIT', json.dumps(page.evaluate('({mouths:window.playbackAudit.mouths.slice(-10),motions:window.playbackAudit.motions,levels:window.playbackAudit.levels.slice(-3)})'), ensure_ascii=True))
            raise
        finally:
            page.close()
    browser.close()
(out / 'playback-report.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
