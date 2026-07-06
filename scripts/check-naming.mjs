#!/usr/bin/env node
/**
 * cc-tasks/15 §G guard: fail if a literal character name/id sneaks back into src/.
 * Character display names must come from shared/activeCharacter.ts (getActiveCharacterName),
 * not literal strings — see cc-tasks/15-...md §G and docs/known-issues.md.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const PATTERN = /叶瑄|yexuan/i;
const SCAN_EXTS = new Set(['.ts', '.tsx', '.css']);

// Deliberate, temporary exceptions. The backend double-sends `char_tension` and its
// deprecated alias `yexuan_tension` during the Brief 25 §3 P2 migration window (see
// docs/known-issues.md) — the client must reference the old field name to read it.
// Remove these entries once the backend stops sending the alias.
const WHITELIST = [
  { file: 'shared/api/dream-types.ts', match: 'yexuan_tension' },
  { file: 'windows/dream/components/DreamSidebar.tsx', match: 'yexuan_tension' },
  { file: 'windows/dream/components/DreamControlBar.tsx', match: 'yexuan_tension' },
];

function isWhitelisted(relPath, line) {
  const normalized = relPath.replace(/\\/g, '/');
  return WHITELIST.some(w => normalized === w.file && line.includes(w.match));
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXTS.has(extname(name))) out.push(full);
  }
  return out;
}

const failures = [];
for (const file of walk(ROOT, [])) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (PATTERN.test(line) && !isWhitelisted(rel, line)) {
      failures.push(`${rel}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (failures.length > 0) {
  console.error('check:naming failed — hardcoded character name/id found in src/:\n');
  for (const f of failures) console.error('  ' + f);
  console.error(`\n${failures.length} violation(s). Use getActiveCharacterName() from shared/activeCharacter.ts instead of a literal name.`);
  process.exit(1);
} else {
  console.log('check:naming OK — no hardcoded 叶瑄/yexuan in src/');
}
