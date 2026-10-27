"""Build explicitly reviewed HLR variants, preserving unresolved slots as documented omissions."""
import argparse
import copy
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from hlr_characters import character_catalog

spec = importlib.util.spec_from_file_location('hlr_import', Path(__file__).with_name('import-hlr-live2d.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


def bind_slots(destination, manifest, config, item, proof, bindings, rows, source):
    """Explicit original atlas binding; verify source, MOC evidence and exact drawable IDs."""
    for binding in bindings:
        slot = binding['slot']
        if slot not in item['repeatedTextureSlots']:
            raise ValueError('Binding does not address a reviewed repeated slot')
        actual_ids = sorted(d['id'] for d in proof['drawables'] if d['texture'] == slot)
        if sorted(binding['drawables']) != actual_ids or not actual_ids:
            raise ValueError('Binding drawable evidence differs from MOC')
        matches = [row for row in rows if row.get('original_name') == binding['resource']]
        if len(matches) != 1:
            raise ValueError('Binding source must resolve exactly once: ' + binding['resource'])
        row = matches[0]
        raw = importer.safe_file(source, row['file']).read_bytes()
        data = importer.unwrap_resource_data(raw)
        relative = '_restored/slot_' + str(slot).zfill(2) + '.png'
        manifest['assets'] = [entry for entry in manifest['assets'] if entry['file'] != relative]
        target = importer.safe_file(destination, relative)
        target.parent.mkdir(exist_ok=True)
        if data.startswith(b'\x89PNG'):
            target.write_bytes(data)
        else:
            importer.decode_texture(data).save(target)
        old = config['FileReferences']['Textures'][slot]
        config['FileReferences']['Textures'][slot] = relative
        manifest['omittedTextureSlots'] = [entry for entry in manifest['omittedTextureSlots'] if entry['slot'] != slot]
        if old.startswith('_omitted/') and old not in config['FileReferences']['Textures']:
            importer.safe_file(destination, old).unlink()
        manifest['assets'].append(dict(file=relative, source=row['source'], pack=row.get('pack'), offset=row.get('offset'),
            sourceFile=row['file'], origin=row.get('origin'), sourceIdentity=row.get('identity'),
            sourceSha256=hashlib.sha256(raw).hexdigest(), outputSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
            resourceName=row['original_name'], nameEvidence=row.get('name_evidence'),
            operation='Reviewed original atlas binding; validated Messiah decoding when required',
            slot=slot, drawableIds=actual_ids, bindingEvidence=binding['evidence']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--slots', type=Path, required=True, help='Real Core slots.json for exactly these source MOCs')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--reviewed-models', nargs='+', required=True)
    parser.add_argument('--bindings', type=Path, help='Explicit original atlas bindings, keyed by source model ID with fingerprint and exact drawable IDs')
    parser.add_argument('--variant-suffix', default='_base', help='New stable model ID suffix; keep older installed variants intact')
    args = parser.parse_args()
    if not re.fullmatch(r'_[a-zA-Z0-9_-]+', args.variant_suffix):
        raise ValueError('Variant suffix must be a safe underscore-prefixed ID')
    if args.output.exists():
        raise ValueError('Output exists; choose a fresh snapshot')
    args.output.mkdir(parents=True)
    original = json.loads((args.snapshot / 'models.json').read_text(encoding='utf-8'))
    models = {m['id']: m for m in original['models']}
    evidence = json.loads(args.slots.read_text(encoding='utf-8'))
    if evidence['schema'] != 'hlr-slots-v1':
        raise ValueError('Unsupported slot evidence')
    slots = {m['id']: m for m in evidence['models']}
    bindings = json.loads(args.bindings.read_text(encoding='utf-8')) if args.bindings else dict(schema='hlr-slot-bindings-v1', models={})
    if bindings['schema'] != 'hlr-slot-bindings-v1':
        raise ValueError('Unsupported atlas binding schema')
    rows, _ = importer.load_source_rows(args.source)
    selected = []
    for identity in dict.fromkeys(args.reviewed_models):
        item = copy.deepcopy(models[identity])
        proof = slots[identity]
        if item['missingCount'] or item['fingerprint'] != proof['fingerprint']:
            raise ValueError('Unresolved dependencies or stale slot evidence: ' + identity)
        config_row = next(row for row in rows if row['source'] == item['configSource'])
        config_bytes = importer.safe_file(args.source, item['configFile']).read_bytes()
        if hashlib.sha256(config_bytes).hexdigest() != item['configSha256']:
            raise ValueError('Source config changed since the parent audit')
        for dependency in item['dependencies']:
            if dependency['status'] != 'resolved' or hashlib.sha256(importer.safe_file(args.source, dependency['file']).read_bytes()).hexdigest() != dependency['sha256']:
                raise ValueError('Source dependency changed since the parent audit')
        config = json.loads(importer.unwrap_resource_data(config_bytes))
        moc = next(d for d in item['dependencies'] if d['reference'] == config['FileReferences']['Moc'])
        if hashlib.sha256(importer.unwrap_resource_data(importer.safe_file(args.source, moc['file']).read_bytes())).hexdigest() != proof['mocSha256']:
            raise ValueError('MOC no longer matches geometry evidence')
        if proof['textureReferences'] != config['FileReferences']['Textures']:
            raise ValueError('Texture references no longer match slot evidence')
        repeated = set(item['repeatedTextureSlots'])
        if not repeated or any(d['texture'] >= len(proof['textureReferences']) for d in proof['drawables']):
            raise ValueError('Unexpected texture slot shape')
        primary = [d for d in proof['drawables'] if d['texture'] not in repeated]
        if not primary or not any(d['opacity'] > 0 for d in primary):
            raise ValueError('No visible primary-skin geometry')
        item['sourceModelId'] = identity
        item['sourceFingerprint'] = item['fingerprint']
        item['id'] = identity + args.variant_suffix
        item['runtime'] = 'runtime/' + item['id']
        destination = importer.safe_file(args.output, item['runtime'])
        result = importer.convert(args.source, destination, item['model'], base_only=True, source_rows=rows, config_row=config_row)
        manifest_path = destination / 'source-manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        runtime_config_path = destination / (item['model'] + '.model3.json')
        runtime_config = json.loads(runtime_config_path.read_text(encoding='utf-8'))
        binding = bindings['models'].get(identity)
        if binding:
            if binding['fingerprint'] != item['fingerprint']:
                raise ValueError('Atlas bindings belong to a different source version')
            bind_slots(destination, manifest, runtime_config, item, proof, binding['slots'], rows, args.source)
            runtime_config_path.write_text(json.dumps(runtime_config, ensure_ascii=False, indent=2), encoding='utf-8')
            manifest['runtimeConfigSha256'] = hashlib.sha256(runtime_config_path.read_bytes()).hexdigest()
        manifest['slotReview'] = dict(schema=evidence['schema'], evidenceSha256=hashlib.sha256(args.slots.read_bytes()).hexdigest(),
            model=identity, mocSha256=proof['mocSha256'], originalAuditStatus=item['status'],
            primaryDrawableCount=len(primary), omittedDrawableCount=sum(d['texture'] in repeated for d in proof['drawables']),
            boundary='Primary skin candidate only. Repeated slots include optional game overlays and may include alternate costumes; every screenshot must be reviewed. No full-accessory claim.')
        item['fingerprint'] = hashlib.sha256(json.dumps([item['sourceFingerprint'],
            sorted((asset.get('slot'), asset['resourceName'], asset['sourceSha256']) for asset in manifest['assets'] if 'slot' in asset),
            sorted(entry['slot'] for entry in manifest['omittedTextureSlots'])], sort_keys=True).encode()).hexdigest()
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        item.update(status='candidate_runtime', conversion=result,
                    variant='base character only; accessory and alternate variants remain partial')
        selected.append(item)
        print('CANDIDATE', item['id'], 'primary', len(primary), 'omitted slots', len(manifest['omittedTextureSlots']), flush=True)
    report = dict(schema=original['schema'], sourceLabel=original['sourceLabel'], models=selected,
                  parentSnapshotSha256=hashlib.sha256((args.snapshot / 'models.json').read_bytes()).hexdigest(),
                  boundary='Explicit source variants; not a replacement for the complete all-model baseline')
    for name, value in [('models.json', report), ('character-catalog.json', character_catalog(selected))]:
        (args.output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
