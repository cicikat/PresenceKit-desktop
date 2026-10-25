"""Read-only source audit, strict model conversion and repeatable content-based version comparison."""
import argparse
from collections import Counter, defaultdict
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
from hlr_characters import CHARACTERS, classify_model, character_catalog

spec = importlib.util.spec_from_file_location('hlr_import', Path(__file__).with_name('import-hlr-live2d.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
SCHEMA = 'hlr-recovery-v1'


def content_fingerprint(config_sha, dependencies):
    # Source UUID/pack/offset can change in a new APK without changing model content.
    content = [config_sha, sorted((d['reference'], d['status'], d.get('sha256')) for d in dependencies)]
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()


def compare_models(previous, current):
    if previous.get('schema') != SCHEMA or current.get('schema') != SCHEMA:
        raise ValueError('Incompatible audit schema; regenerate both snapshots with the same tool')
    # Config asset names remain stable even when two variants reuse one internal MOC filename.
    before, after = ({m.get('configName') or m['id']: m for m in report['models']} for report in [previous, current])
    common = before.keys() & after.keys()
    changed = sorted(k for k in common if before[k]['fingerprint'] != after[k]['fingerprint'])
    result = dict(added=sorted(after[k]['id'] for k in after.keys() - before.keys()),
                removed=sorted(before[k]['id'] for k in before.keys() - after.keys()),
                changed=sorted(after[k]['id'] for k in changed), unchanged=sorted(after[k]['id'] for k in common - set(changed)),
                newlyResolvable=sorted(after[k]['id'] for k in common if before[k]['missingCount'] and not after[k]['missingCount']),
                regressed=sorted(after[k]['id'] for k in common if not before[k]['missingCount'] and after[k]['missingCount']))
    by_id = {m['id']: m for m in [*previous['models'], *current['models']]}
    result['byCharacter'] = [dict(id=identity, name=name, **{
        kind: [key for key in values if identity in (by_id[key].get('classification')
              or classify_model(by_id[key].get('model', key)))['characterIds']]
        for kind, values in result.items()}) for identity, name, _ in CHARACTERS]
    return result


def audit(source):
    rows, records = importer.load_source_rows(source)
    by_name, record_names = defaultdict(list), defaultdict(list)
    for row in rows:
        if row.get('original_name'):
            by_name[row['original_name']].append(row)
    for identity, record in records.items():
        record_names[record['name']].append(identity)
    hashes = {}

    def digest(row):
        if row['file'] not in hashes:
            path = importer.safe_file(source, row['file'])
            data = path.read_bytes()
            if len(data) != row['size']:
                raise ValueError('Extracted size differs from index: ' + row['file'])
            hashes[row['file']] = hashlib.sha256(data).hexdigest()
        return hashes[row['file']]

    models = []
    for number, row in enumerate(r for r in rows if r['file'].endswith('.model3.json') or r.get('original_name', '').endswith('.model3.json')):
        if number % 50 == 0:
            print('AUDIT', number, 'configs;', len(hashes), 'unique dependency files hashed', flush=True)
        config_sha = digest(row)
        config = json.loads(importer.unwrap_resource_data(importer.safe_file(source, row['file']).read_bytes()))
        refs = config['FileReferences']
        model = importer.model_id_from_config(row, config)
        dependencies = [refs['Moc'], *refs.get('Textures', [])]
        dependencies += [refs[k] for k in ['Physics', 'Pose', 'DisplayInfo', 'UserData'] if refs.get(k)]
        dependencies += [e['File'] for e in refs.get('Expressions', [])]
        dependencies += [e['File'] for group in refs.get('Motions', {}).values() for e in group]
        dependencies += [e['Sound'] for group in refs.get('Motions', {}).values() for e in group if e.get('Sound')]
        resolved = []
        for ref in sorted(set(dependencies)):
            importer.safe_file(source, ref)  # Reject unsafe runtime references before conversion.
            name = model + '_' + ref.replace('/', '_')
            candidates = by_name.get(name, [])
            item = dict(reference=ref, expectedName=name, expectedUuids=record_names.get(name, []))
            if len(candidates) != 1:
                item.update(status='missing_local_resource' if not candidates else 'ambiguous_source',
                            candidates=[r['source'] for r in candidates])
            else:
                candidate = candidates[0]
                item.update(status='resolved', source=candidate['source'], file=candidate['file'],
                            sha256=digest(candidate), bytes=candidate['size'], nameEvidence=candidate.get('name_evidence'))
            resolved.append(item)
        repeated = [i for i, ref in enumerate(refs['Textures']) if ref in refs['Textures'][:i]]
        missing = sum(d['status'] != 'resolved' for d in resolved)
        status = ('blocked_missing_dependencies' if missing else 'blocked_game_material' if config.get('drawableSettings')
                  else 'blocked_accessory_slots' if repeated else 'ready_for_conversion')
        models.append(dict(id=model, model=model, classification=classify_model(model), configSource=row['source'], configFile=row['file'],
                           configSha256=config_sha, configName=row.get('original_name'), status=status,
                           missingCount=missing, repeatedTextureSlots=repeated, textureReferences=refs['Textures'],
                           drawableSettings=config.get('drawableSettings'), dependencies=resolved,
                           fingerprint=content_fingerprint(config_sha, resolved)))
    counts = Counter(m['id'] for m in models)
    for model in models:
        if counts[model['id']] > 1:
            model['id'] += '--' + model['configSha256'][:8]
            model['status'] = 'blocked_ambiguous_config'
    if len({m['id'] for m in models}) != len(models):
        raise ValueError('Duplicate config identity; refusing to overwrite model audit')
    return dict(schema=SCHEMA, sourceLabel=source.name,
                indexSha256=hashlib.sha256((source / '资源索引.json').read_bytes()).hexdigest(),
                resourceRecords=len(records), sourceEntries=len(rows), verifiedSourceFiles=len(hashes),
                models=sorted(models, key=lambda m: m['id'])), rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='Fresh snapshot directory; never replaces an earlier snapshot')
    parser.add_argument('--baseline', type=Path, help='Earlier models.json for a content-based delta')
    parser.add_argument('--convert-ready', action='store_true', help='Convert only unambiguous complete references without unresolved slots')
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    if output.exists():
        raise ValueError('Snapshot destination exists; refusing to replace it')
    output.parent.mkdir(parents=True, exist_ok=True)
    report, rows = audit(source)
    delta = compare_models(json.loads(args.baseline.read_text(encoding='utf-8')), report) if args.baseline else None
    with tempfile.TemporaryDirectory(prefix='.hlr-recovery-', dir=output.parent) as temporary:
        staging = Path(temporary) / 'snapshot'
        staging.mkdir()
        if args.convert_ready:
            for model in report['models']:
                if model['status'] != 'ready_for_conversion':
                    continue
                destination = importer.safe_file(staging, 'runtime/' + model['id'])
                try:
                    config_row = next(row for row in rows if row['source'] == model['configSource'])
                    result = importer.convert(source, destination, model['model'], source_rows=rows, config_row=config_row)
                    model.update(status='candidate_runtime', runtime='runtime/' + model['id'], conversion=result)
                    print('CONVERTED', model['id'], flush=True)
                except Exception as error:
                    # convert() checks dependencies before writes; each failed staging dir is removed with the transaction.
                    model.update(status='blocked_conversion', conversionError=str(error))
                    if destination.exists():
                        import shutil
                        if not destination.resolve().is_relative_to(staging.resolve()):
                            raise ValueError('Failed runtime escaped staging directory')
                        shutil.rmtree(destination)
        summary = dict(schema=SCHEMA, models=len(report['models']),
                       statuses=dict(Counter(m['status'] for m in report['models'])),
                       note='candidate_runtime is not visual acceptance; missing_local_resource is not proof of upstream deletion')
        catalog = character_catalog(report['models'])
        summary['byCharacter'] = {group['name']: group['count'] for group in catalog['characters']}
        summary['classificationNeedsReview'] = len(catalog['needsReview'])
        for name, data in [('models.json', report), ('summary.json', summary), ('model-diff.json', delta), ('character-catalog.json', catalog)]:
            if data is not None:
                (staging / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        staging.rename(output)
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
