"""Install only explicitly visually reviewed, hash-matched browser candidates; never replaces different files."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from hlr_characters import classify_model, NAMES


def tree_hashes(root):
    return {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in root.rglob('*') if path.is_file()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--validation', type=Path, required=True, help='Browser evidence directory')
    parser.add_argument('--library', type=Path, required=True)
    parser.add_argument('--client-models', type=Path, default=Path('public/live2d/models'))
    parser.add_argument('--reviewed-models', nargs='+', required=True, help='Exact IDs whose screenshots the agent/user has opened and reviewed')
    args = parser.parse_args()
    snapshot = args.snapshot.resolve()
    audit = json.loads((snapshot / 'models.json').read_text(encoding='utf-8'))
    evidence = json.loads((args.validation / 'validation.json').read_text(encoding='utf-8'))
    proofs = {m['id']: m for m in evidence['models'] if m['status'] == 'browser_pass'}
    models = {m['id']: m for m in audit['models']}
    plan, items = [], []
    for identity in dict.fromkeys(args.reviewed_models):
        if Path(identity).name != identity or any(c in identity for c in '/\\:'):
            raise ValueError('Invalid model ID')
        model, proof = models[identity], proofs[identity]
        classification = model.get('classification') or classify_model(model.get('model', identity))
        if not classification['primaryCharacter']:
            raise ValueError('Character classification needs review before installation: ' + identity)
        character_folder = NAMES[classification['primaryCharacter']]
        if model['status'] != 'candidate_runtime' or model['fingerprint'] != proof['fingerprint']:
            raise ValueError('Candidate/browser identity mismatch')
        runtime = (snapshot / model['runtime']).resolve()
        if not runtime.is_relative_to(snapshot):
            raise ValueError('Runtime escapes snapshot')
        manifest = json.loads((runtime / 'source-manifest.json').read_text(encoding='utf-8'))
        hashes = tree_hashes(runtime)
        if hashes[model['model'] + '.model3.json'] != proof['runtimeConfigSha256']:
            raise ValueError('Browser config hash no longer matches candidate')
        for asset in manifest['assets']:
            if hashes.get(asset['file']) != asset['outputSha256']:
                raise ValueError('Source manifest mismatch: ' + asset['file'])
        library_root = args.library.resolve() / character_folder
        if library_root.resolve().parent != args.library.resolve():
            raise ValueError('Character directory escapes library')
        for root, name in [(library_root, identity), (args.client_models.resolve(), 'hlr_' + identity)]:
            target = root / name
            if target.resolve().parent != root:
                raise ValueError('Install target escapes named parent')
            if target.exists() and tree_hashes(target) != hashes:
                raise ValueError('Existing different model is preserved: ' + str(target))
            plan.append((runtime, target, hashes))
        items.append(dict(id=identity, fingerprint=model['fingerprint'], fileCount=len(hashes),
                          clientDir='hlr_' + identity, libraryDir=character_folder + '/' + identity,
                          classification=classification,
                          visualReview='explicitly selected after opening evidence images'))
    for runtime, target, hashes in plan:
        if not target.exists():
            target.mkdir(parents=True)
            # Windows Vite/antivirus watchers can hold directory rename handles. Publish model3 last.
            for relative in sorted(hashes, key=lambda name: name.endswith('.model3.json')):
                destination = target / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(runtime / relative, destination)
        if tree_hashes(target) != hashes:
            raise ValueError('Installed copy failed content verification')
    result = dict(schema='hlr-install-v1', models=items,
                  boundary='Real browser and visual review; real Windows Tauri/TTS/GPU remains observe')
    (snapshot / 'installed-models.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print('INSTALLED', len(items), 'models; existing different files are never overwritten', flush=True)


if __name__ == '__main__':
    main()
