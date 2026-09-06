import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.(?:rs|ts|tsx)$/.test(entry.name) ? [child] : [];
  });
}

describe('retired browser task client surface', () => {
  it('does not retain a browser bridge, task endpoint, or bot user configuration', () => {
    const source = [resolve('src'), resolve('src-tauri/src')]
      .flatMap(sourceFiles)
      .map(path => readFileSync(path, 'utf8'))
      .join('\n');

    expect(existsSync(resolve('src/shared/api/agent-runtime.ts'))).toBe(false);
    expect(source).not.toContain('/agent-runtime-browser/');
    expect(source).not.toContain('agent_runtime_browser');
    expect(source).not.toContain('bot_user_id');
    expect(source).not.toContain('settings.agentRuntime');
  });
});
