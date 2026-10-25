"""Asset-name classification only; preserve model IDs and never guess unknown/shared actors."""
import re

CLASSIFICATION_SCHEMA = 'hlr-characters-v1'
CHARACTERS = [
    ('yexuan', '叶瑄', 'yx'),
    ('silan', '司岚', 'sl'),
    ('luchen', '路辰', 'lc'),
    ('aiyin', '艾因', 'ay'),
    ('luoxia', '罗夏', 'lx'),
]
NAMES = {identity: name for identity, name, _ in CHARACTERS}
CODES = {code: identity for identity, _, code in CHARACTERS}


def classify_model(model):
    original = model
    name = model.lower().removeprefix('hlr_').split('--')[0].replace(' ', '')
    hits, evidence = [], []
    for identity, _, _ in CHARACTERS:
        for match in re.finditer(identity, name):
            position, suffix = match.start(), name[match.end():]
            prefix = name[:position]
            prefixed_card = name.startswith('card_dynamic_') and prefix.removeprefix('card_dynamic_') in ('rmx', 'gzj', 'llqz')
            if (position == 0 or name[position - 1] == '_' or prefixed_card) and (
                    not suffix or suffix[0] == '_' or suffix[0].isdigit() or suffix.startswith('sr')):
                hits.append((position, identity))
                evidence.append('full-name:' + identity)
    if not hits:
        for match in re.finditer(r'(?:^|_)(yx|sl|lc|ay|lx)(?=_|[0-9]|$)', name):
            hits.append((match.start(), CODES[match.group(1)]))
            evidence.append('asset-token:' + match.group(1))
    if not hits and name.startswith('card_dynamic_'):
        stem = name.removeprefix('card_dynamic_').removesuffix('_zoom')
        # Suffix chains preserve both actors: lcsl and 25cjlclx are dual-character cards.
        cursor = len(stem)
        while cursor >= 2 and stem[cursor - 2:cursor] in CODES:
            code = stem[cursor - 2:cursor]
            hits.append((cursor - 2, CODES[code]))
            evidence.append('card-suffix:' + code)
            cursor -= 2
        if not hits:
            birthday = re.match(r'(yx|sl|lc|ay|lx)sr[0-9]+$', stem)
            if birthday:
                hits.append((0, CODES[birthday.group(1)]))
                evidence.append('card-birthday-prefix:' + birthday.group(1))
    identities = list(dict.fromkeys(identity for _, identity in sorted(hits)))
    return dict(schema=CLASSIFICATION_SCHEMA, sourceModel=original,
                characterIds=identities, characterNames=[NAMES[i] for i in identities],
                primaryCharacter=identities[0] if identities else None,
                evidence=evidence, status='classified' if identities else 'needs_review')


def character_catalog(models):
    groups = [dict(id=identity, name=name, models=[]) for identity, name, _ in CHARACTERS]
    by_id = {group['id']: group for group in groups}
    unresolved = []
    for model in models:
        classification = model.get('classification') or classify_model(model.get('model', model['id']))
        if not classification['characterIds']:
            unresolved.append(model['id'])
        for identity in classification['characterIds']:
            by_id[identity]['models'].append(model['id'])
    for group in groups:
        group['models'].sort()
        group['count'] = len(group['models'])
    return dict(schema=CLASSIFICATION_SCHEMA, characters=groups, needsReview=sorted(unresolved))
