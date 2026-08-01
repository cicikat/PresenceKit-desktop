import { describe, expect, it, vi } from 'vitest';
import { ToolStatusOverlayController, type ToolStatusPayload } from './toolStatusOverlay';

const status = (overrides: Partial<ToolStatusPayload> = {}): ToolStatusPayload => ({
  status_id: 'tool-1', kind: 'queued', label: '查询设备状态', index: 1, total: 1, attempt: 1, ttl_ms: 20_000,
  ...overrides,
});

describe('ToolStatusOverlayController', () => {
  it('shows queued work without using persistent state', () => {
    let now = 1_000;
    const controller = new ToolStatusOverlayController(() => now);
    controller.receive(status());
    expect(controller.get()).toMatchObject({ kind: 'queued', label: '查询设备状态' });
  });

  it('updates waiting in place for the same status', () => {
    let now = 1_000;
    const controller = new ToolStatusOverlayController(() => now);
    controller.receive(status());
    now += 50;
    controller.receive(status({ kind: 'waiting', attempt: 2 }));
    expect(controller.get()).toMatchObject({ status_id: 'tool-1', kind: 'waiting', attempt: 2 });
  });

  it('keeps the first tool visible for one second before showing the next one', () => {
    vi.useFakeTimers();
    let now = 1_000;
    vi.setSystemTime(now);
    const controller = new ToolStatusOverlayController(() => now);
    controller.receive(status());
    controller.receive(status({ status_id: 'tool-2', label: '发送设备脉冲', index: 2, total: 2 }));
    expect(controller.get()?.status_id).toBe('tool-1');

    now += 999;
    vi.setSystemTime(now);
    vi.advanceTimersByTime(999);
    expect(controller.get()?.status_id).toBe('tool-1');

    now += 1;
    vi.setSystemTime(now);
    vi.advanceTimersByTime(1);
    expect(controller.get()?.status_id).toBe('tool-1');

    controller.receive(status({ kind: 'finished' }));
    expect(controller.get()?.status_id).toBe('tool-2');
    controller.dispose();
    vi.useRealTimers();
  });

  it('restores NOW after a quick finished status only after the minimum visibility', () => {
    vi.useFakeTimers();
    let now = 1_000;
    vi.setSystemTime(now);
    const controller = new ToolStatusOverlayController(() => now);
    controller.receive(status());
    controller.receive(status({ kind: 'finished' }));
    expect(controller.get()?.kind).toBe('queued');

    now += 1_000;
    vi.setSystemTime(now);
    vi.advanceTimersByTime(1_000);
    expect(controller.get()).toBeNull();
    controller.dispose();
    vi.useRealTimers();
  });

  it('drops expired work and keeps outcome_unknown distinct from failure', () => {
    vi.useFakeTimers();
    let now = 1_000;
    vi.setSystemTime(now);
    const controller = new ToolStatusOverlayController(() => now);
    controller.receive(status({ ttl_ms: 50 }));
    now += 50;
    vi.setSystemTime(now);
    vi.advanceTimersByTime(50);
    expect(controller.get()).toBeNull();

    controller.receive(status({ kind: 'outcome_unknown' }));
    expect(controller.get()).toBeNull();
    controller.receive(status({ status_id: 'tool-2' }));
    controller.receive(status({ status_id: 'tool-2', kind: 'outcome_unknown' }));
    now += 1_000;
    vi.setSystemTime(now);
    vi.advanceTimersByTime(1_000);
    expect(controller.get()?.kind).toBe('outcome_unknown');
    controller.dispose();
    vi.useRealTimers();
  });
});
