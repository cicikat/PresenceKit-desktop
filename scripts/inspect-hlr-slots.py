"""Read original MOC geometry with real Cubism Core; no texture substitution or source modification."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('hlr_import', Path(__file__).with_name('import-hlr-live2d.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--models', nargs='+', required=True)
    parser.add_argument('--base-url', default='http://localhost:1420')
    parser.add_argument('--uv-triangles', action='store_true', help='Retain exact UV vertices/triangles for ambiguous atlas comparison')
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Evidence directory exists; choose a new directory')
    args.output.mkdir(parents=True)
    report = json.loads((args.snapshot / 'models.json').read_text(encoding='utf-8'))
    models = {m['id']: m for m in report['models']}
    repo = Path(__file__).resolve().parent.parent
    fixture = repo / '.tmp/hlr-slot-inspection.html'
    fixture_content = '<script type="module">import {ensureCubismCore} from "/src/shared/live2d/cubismCore.ts";await ensureCubismCore();window.probeReady=true;</script>'
    if not fixture.exists() or fixture.read_text(encoding='utf-8') != fixture_content:
        fixture.write_text(fixture_content, encoding='utf-8')
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(args.base_url + '/.tmp/hlr-slot-inspection.html')
        page.wait_for_function('window.probeReady===true')
        for identity in args.models:
            item = models[identity]
            config = json.loads(importer.unwrap_resource_data(importer.safe_file(args.source, item['configFile']).read_bytes()))
            ref = config['FileReferences']['Moc']
            dependency = next(d for d in item['dependencies'] if d['reference'] == ref)
            if dependency['status'] != 'resolved':
                raise ValueError('MOC dependency is not resolved')
            payload = importer.unwrap_resource_data(importer.safe_file(args.source, dependency['file']).read_bytes())
            page.route('**/__hlr_probe.moc3', lambda route: route.fulfill(body=payload, content_type='application/octet-stream'))
            core = page.evaluate('''async retainUvs=>{
                const C=window.Live2DCubismCore;
                const moc=C.Moc.fromArrayBuffer(await (await fetch('/__hlr_probe.moc3')).arrayBuffer());
                const model=C.Model.fromMoc(moc);model.update();
                const d=model.drawables,p=model.parts,params=model.parameters;
                const drawables=Array.from(d.ids,(id,i)=>{
                    const parent=d.parentPartIndices?.[i];
                    const chain=[];let j=parent;
                    while(j>=0&&j<p.count&&!chain.includes(p.ids[j])){chain.push(p.ids[j]);j=p.parentIndices?.[j];}
                    const uv=Array.from(d.vertexUvs[i]);
                    const x=uv.filter((_,k)=>k%2===0),y=uv.filter((_,k)=>k%2===1);
                    return {id,texture:d.textureIndices[i],opacity:d.opacities[i],part:parent,
                        ...(retainUvs?{uvVertices:uv,indices:Array.from(d.indices[i])}:{}),
                        partChain:chain,vertices:d.vertexCounts[i],uv:[Math.min(...x),Math.min(...y),Math.max(...x),Math.max(...y)]};
                });
                const result={version:C.Version.csmGetVersion(),drawables,
                    parts:Array.from(p.ids,(id,i)=>({id,opacity:p.opacities[i],parent:p.parentIndices?.[i]})),
                    parameters:Array.from(params.ids,(id,i)=>({id,value:params.values[i],default:params.defaultValues[i],min:params.minimumValues[i],max:params.maximumValues[i]}))};
                model.release();moc._release();return result;
            }''', args.uv_triangles)
            page.unroute('**/__hlr_probe.moc3')
            core.update(id=identity, model=item['model'], fingerprint=item['fingerprint'],
                        mocSha256=hashlib.sha256(payload).hexdigest(), textureReferences=config['FileReferences']['Textures'])
            results.append(core)
            (args.output / 'slots.json').write_text(json.dumps(dict(schema='hlr-slots-v1', models=results), ensure_ascii=False, indent=2), encoding='utf-8')
            print(identity, 'slots', sorted({d['texture'] for d in core['drawables']}), 'parts', len(core['parts']), flush=True)
        browser.close()


if __name__ == '__main__':
    main()
