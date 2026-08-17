import { describe, expect, it } from 'vitest';
import { createRuntimeDiagnostics } from './runtimeDiagnostics';

describe('runtime diagnostics', () => {
  it('stays inert until enabled and aggregates command/frame metrics', async () => {
    let now = 0;
    const diagnostics = createRuntimeDiagnostics(() => now);
    diagnostics.recordFrame(10);
    expect(diagnostics.snapshot().frameCount).toBe(0);
    diagnostics.setEnabled(true);
    diagnostics.recordFrame(10);
    diagnostics.recordFrame(30);
    diagnostics.recordLongTask(60);
    await diagnostics.measureCommand('window.show', async () => { now += 4; });
    const snapshot = diagnostics.snapshot();
    expect(snapshot.frameAverageMs).toBe(20);
    expect(snapshot.frameP95Ms).toBe(30);
    expect(snapshot.longTaskCount).toBe(1);
    expect(snapshot.commands['window.show'].count).toBe(1);
  });
});
