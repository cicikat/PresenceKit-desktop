"""One browser validation protocol for every complete HLR candidate; no backend or real preferences."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('hlr_import', Path(__file__).with_name('import-hlr-live2d.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--snapshot', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True, help='Fresh evidence directory')
parser.add_argument('--base-url', default='http://localhost:1420')
parser.add_argument('--models', nargs='*', help='Optional exact model IDs for a focused rerun')
parser.add_argument('--background', default='#cbd0d7', help='Plain inspection backdrop; light default exposes missing dark clothing')
parser.add_argument('--prepare-only', action='store_true', help='Prepare immutable fixtures before concurrent browser runs')
args = parser.parse_args()
snapshot, out = args.snapshot.resolve(), args.output.resolve()
if out.exists():
    raise ValueError('Evidence directory already exists; use a new directory')
if not args.prepare_only:
    out.mkdir(parents=True)
report = json.loads((snapshot / 'models.json').read_text(encoding='utf-8'))
repo = Path(__file__).resolve().parent.parent
fixture = repo / '.tmp'
fixture.mkdir(exist_ok=True)
fixture_name = 'hlr-' + hashlib.sha256((str(snapshot)+'|'+str(out)).encode()).hexdigest()[:10]
fixture_bytes = (repo / 'scripts/fixtures/live2d-import.tsx').read_bytes()
fixture_tsx = fixture / (fixture_name + '.tsx')
if not fixture_tsx.exists() or fixture_tsx.read_bytes() != fixture_bytes:
    fixture_tsx.write_bytes(fixture_bytes)
fixture_html = fixture / (fixture_name + '.html')
fixture_text = '<div id="root"></div><script type="module" src="./'+fixture_name+'.tsx"></script>'
if not fixture_html.exists() or fixture_html.read_text(encoding='utf-8') != fixture_text:
    fixture_html.write_text(fixture_text, encoding='utf-8')
if args.prepare_only:
    print('PREPARED', fixture_name)
    raise SystemExit(0)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for item in report['models']:
        if item['status'] != 'candidate_runtime' or (args.models and item['id'] not in args.models):
            continue
        runtime = importer.safe_file(snapshot, item['runtime'])
        manifest = json.loads((runtime / 'source-manifest.json').read_text(encoding='utf-8'))
        model_json = item['model'] + '.model3.json'
        if hashlib.sha256((runtime / model_json).read_bytes()).hexdigest() != manifest['runtimeConfigSha256']:
            raise ValueError('Runtime config changed after conversion')
        for asset in manifest['assets']:
            if hashlib.sha256(importer.safe_file(runtime, asset['file']).read_bytes()).hexdigest() != asset['outputSha256']:
                raise ValueError('Runtime asset changed after conversion: ' + asset['file'])
        directory = 'hlr_' + item['id']
        page = browser.new_page(viewport={'width': 1000, 'height': 900}, device_scale_factor=1.5)
        errors, failed = [], []
        page.on('pageerror', lambda error: errors.append(error.stack or str(error)))
        page.on('requestfailed', lambda request: failed.append(request.url))

        def serve(route):
            path = unquote(urlparse(route.request.url).path)
            prefix = '/live2d/models/' + directory + '/'
            if not path.startswith(prefix):
                route.continue_()
                return
            file = importer.safe_file(runtime, path[len(prefix):])
            if not file.is_file():
                route.fulfill(status=404, body='Missing local fixture asset')
            else:
                route.fulfill(path=str(file))

        page.route('**/live2d/models/**', serve)
        page.add_init_script('window.fixtureModelDir=' + json.dumps(directory) + ';window.fixtureJson=' + json.dumps(model_json) + ''';
        window.__TAURI_INTERNALS__={invoke:async(cmd)=>{
        if(cmd==='list_live2d_models')return [{dirName:window.fixtureModelDir,modelJson:window.fixtureJson}];
        if(cmd==='load_ui_prefs')return '{}';if(cmd==='save_ui_prefs')return null;
        throw new Error('Unexpected Tauri: '+cmd);
        },transformCallback:()=>0,metadata:{currentWindow:{label:'fixture'}}};''')
        result = dict(id=item['id'], fingerprint=item['fingerprint'], sourceConfigSha256=item['configSha256'],
                      runtimeConfigSha256=manifest['runtimeConfigSha256'], status='failed')
        try:
            page.goto(args.base_url + '/.tmp/'+fixture_name+'.html', wait_until='networkidle')
            page.wait_for_function('window.controls?.()&&window.audit.frames>20', timeout=45000)
            page.evaluate('''async color=>{const settings=await import('/src/shared/live2d/live2dSettings.ts');
                settings.patchLive2DSettings({bgKind:'color',bgColor:color});}''', args.background)
            page.evaluate('window.attachCompare()')
            result['parameters'] = page.evaluate("Array.from(window.auditModel.internalModel.coreModel.getModel().parameters.ids)")
            result['drawables'] = page.evaluate('window.auditModel.internalModel.coreModel.getModel().drawables.count')
            assert result['drawables'] > 0
            page.wait_for_timeout(400)
            page.screenshot(path=str(out / (item['id'] + '-initial.png')))
            expressions = page.evaluate('window.controls().expressions')
            motions = page.evaluate('window.controls().motions')
            accessory_previews = []
            for name in expressions:
                assert page.evaluate('''async name=>{
                    const m=window.auditModel.internalModel.motionManager.expressionManager;
                    const i=m.definitions.findIndex(x=>x.Name===name);
                    return i>=0&&!!await m.loadExpression(i);
                }''', name), 'expression could not load: ' + name
                page.evaluate('(name)=>window.controls().playExpression(name)', name)
                page.wait_for_function('''name=>{const m=window.auditModel.internalModel.motionManager.expressionManager;
                    return m.currentExpression===m.expressions[m.definitions.findIndex(x=>x.Name===name)];}''', arg=name, timeout=5000)
                if name.startswith('装配_'):
                    page.wait_for_timeout(250)
                    preview = item['id'] + '-accessory-' + str(len(accessory_previews)).zfill(2) + '.png'
                    page.screenshot(path=str(out / preview))
                    parts = page.evaluate('''()=>{const p=window.auditModel.internalModel.coreModel.getModel().parts;
                        return Object.fromEntries(Array.from(p.ids,(id,i)=>[id,p.opacities[i]]));}''')
                    visibility = json.loads((runtime / model_json).read_text(encoding='utf-8')).get('EmeraldProfile', {}).get('drawableVisibility')
                    mask_check = None
                    if visibility and name in visibility['byExpression']:
                        mask_check = page.evaluate('''hidden=>{const core=window.auditModel.internalModel.coreModel;
                            const d=core.getModel().drawables;const masked=new Set(hidden);
                            return Array.from(d.ids,(id,i)=>({id,native:d.opacities[i],render:core.getDrawableOpacity(i),hidden:masked.has(id)}));
                        }''', visibility['byExpression'][name])
                        assert all(abs(d['render']-(0 if d['hidden'] else d['native'])) < .00001 for d in mask_check), 'render mask differs from exact reviewed IDs'
                    accessory_previews.append(dict(name=name,file=preview,partOpacities=parts,
                        renderMaskVerified=mask_check is not None,
                        overlayDrawables=[d for d in (mask_check or []) if d['id'].lower().startswith(('glass','xiaoqieyanzhao'))]))
            neutral_accessory = next((name for name in expressions if name.startswith('装配_无配饰')), None)
            if neutral_accessory:
                page.evaluate('(name)=>window.controls().playExpression(name)', neutral_accessory)
                page.wait_for_timeout(350)
            page.evaluate('window.controls().playExpression(null)')
            for file in motions:
                count = page.evaluate('window.audit.starts.length')
                page.evaluate('(file)=>window.controls().playMotion(file)', file)
                page.wait_for_function('x=>window.audit.starts.slice(x.count).some(m=>m.file===x.file)',
                                       arg=dict(count=count, file=file), timeout=5000)
                page.wait_for_timeout(100)
            page.evaluate('window.controls().stop()')
            page.wait_for_timeout(300)
            result.update(expressions=len(expressions), originalExpressions=sum(not n.startswith('装配_') for n in expressions),
                          accessoryPreviews=accessory_previews, motions=len(motions), actions=page.evaluate('window.controls().actions'))
            if 'ParamMouthOpenY' in result['parameters']:
                page.evaluate('window.talking=true;window.volume=0.8')
                page.wait_for_timeout(400)
                result['mouth'] = page.evaluate('window.lastDrawMouth')
                assert result['mouth'] > 0.4
                page.evaluate('window.talking=false;window.volume=0')
            else:
                result['mouth'] = 'unavailable_in_source_model'
            page.screenshot(path=str(out / (item['id'] + '-preview.png')))
            page.evaluate('window.remount()')
            page.wait_for_function('window.controls()===null')
            frames = page.evaluate('window.audit.frames')
            page.evaluate('window.remount()')
            page.wait_for_function('frames=>window.controls()!==null&&window.audit.frames>frames+5', arg=frames)
            assert not errors and not failed, (errors, failed)
            result.update(status='browser_pass', unmountReload=True, errors=errors, failedRequests=failed)
        except Exception as error:
            result.update(error=str(error), errors=errors, failedRequests=failed)
            try:
                page.screenshot(path=str(out / (item['id'] + '-failed.png')), timeout=5000)
            except Exception as screenshot_error:
                result['screenshotError'] = str(screenshot_error)
        finally:
            results.append(result)
            (out / 'validation.json').write_text(json.dumps(dict(schema='hlr-browser-v1', models=results,
                boundary='Real Core/Pixi/React. Tauri transport is mocked; visual review and real Windows acceptance remain separate.'),
                ensure_ascii=False, indent=2), encoding='utf-8')
            print(result['status'], item['id'], result.get('error', ''), flush=True)
            page.close()
    browser.close()
if not results or any(r['status'] != 'browser_pass' for r in results):
    raise SystemExit(1)
