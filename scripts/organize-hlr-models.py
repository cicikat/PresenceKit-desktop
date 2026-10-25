"""Organize a local model library by the five characters; source assets and client paths are not moved."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
from hlr_characters import CHARACTERS, NAMES, classify_model, character_catalog


def tree_hashes(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob('*') if p.is_file()}


def organize(library, perform=False):
    library = library.resolve()
    result, plan = [], []
    # Include already grouped directories so re-verification is safe and repeatable.
    models = [p for p in library.iterdir() if p.is_dir() and p.name not in NAMES.values()]
    for label in NAMES.values():
        parent = library / label
        if parent.is_dir():
            models.extend(p for p in parent.iterdir() if p.is_dir())
    for origin in sorted(models):
        identity = origin.name
        classification = classify_model(identity)
        if not classification['primaryCharacter']:
            result.append(dict(id=identity, status='needs_review', path=origin.relative_to(library).as_posix(),
                               classification=classification))
            continue
        parent = library / NAMES[classification['primaryCharacter']]
        target = parent / identity
        # Check resolved absolute paths before any recursive directory move on Windows.
        if (not origin.resolve().is_relative_to(library) or origin.is_symlink()
                or parent.resolve().parent != library or target.resolve().parent != parent.resolve()):
            raise ValueError('Unsafe library move target')
        if origin != target and target.exists():
            raise ValueError('Classification target already exists; refusing merge: ' + str(target))
        hashes = tree_hashes(origin)
        manifest_path = origin / 'source-manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
        result.append(dict(id=identity, status='available', path=target.relative_to(library).as_posix(),
                           classification=classification, fileCount=len(hashes),
                           variant=manifest.get('variant', 'not documented'),
                           fileTreeSha256=hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()))
        plan.append((origin, target, hashes))
    if perform:
        for identity, _, _ in CHARACTERS:
            (library / NAMES[identity]).mkdir(exist_ok=True)
        for origin, target, hashes in plan:
            if origin != target:
                origin.rename(target)
            if tree_hashes(target) != hashes:
                raise ValueError('Content changed during character organization')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--library', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='Fresh classification catalog directory')
    parser.add_argument('--organize-library', action='store_true', help='Move complete model folders inside the named library after path/hash validation')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        raise ValueError('Classification output exists; refusing overwrite')
    report_path = args.snapshot / 'models.json'
    report = json.loads(report_path.read_text(encoding='utf-8'))
    catalog = character_catalog(report['models'])
    catalog['sourceSnapshotSha256'] = hashlib.sha256(report_path.read_bytes()).hexdigest()
    catalog['availableModels'] = organize(args.library, args.organize_library)
    for group in catalog['characters']:
        group['available'] = [m for m in catalog['availableModels'] if group['id'] in m['classification']['characterIds']]
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.hlr-catalog-', dir=output.parent) as temporary:
        staged = Path(temporary) / 'catalog'
        staged.mkdir()
        (staged / 'character-catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
        lines = ['# 五人物模型分类', '', '顺序：叶瑄、司岚、路辰、艾因、罗夏。', '',
                 '双人物素材在两份清单引用同一个目录；公共/无法确认者保留待核对，不推测归属。', '']
        for group in catalog['characters']:
            lines += ['## ' + group['name'], '', f"配置 {group['count']} 份；已有成品 {len(group['available'])} 个。", '']
            lines += [f"- `{m['id']}`：`{m['path']}`（{m['variant']}）" for m in group['available']]
            lines += ['']
        lines += ['## 待核对/公共素材', '', ', '.join(catalog['needsReview']) or '无', '']
        (staged / 'README.md').write_text('\n'.join(lines), encoding='utf-8')
        staged.rename(output)
    print(json.dumps({g['name']: dict(configs=g['count'], available=len(g['available'])) for g in catalog['characters']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
