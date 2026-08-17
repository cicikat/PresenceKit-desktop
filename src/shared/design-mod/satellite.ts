import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { NativeSurfacePackage, NativeSurfaceManifest } from './types';
import { createSnapshotBatch, createSnapshotGate, type SnapshotBudget } from './snapshotTransport';

export const DESIGN_SATELLITE_SNAPSHOT_EVENT = 'design-satellite-snapshot';
export const DESIGN_SATELLITE_ACK_EVENT = 'design-satellite-command-ack';

export interface DesignSatelliteBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  dpi: number;
}

export interface DesignSatelliteDescriptor {
  id: string;
  label: string;
  kind: string;
  pointer_mode: string;
  z_order: string;
  bounds: DesignSatelliteBounds;
  content_rect: DesignSatelliteBounds;
  ready: boolean;
  visible: boolean;
}

export interface DesignSatelliteSnapshot {
  schemaVersion: 1;
  sequence: number;
  generation: number;
  modId: string;
  surfaceId: string;
  surface: { bounds: DesignSatelliteBounds; contentRect: DesignSatelliteBounds };
  updatedAt: number;
  main: {
    bounds: DesignSatelliteBounds;
    visible: boolean;
    focused: boolean;
    maximized: boolean;
  };
  window: { visible: boolean; focused: boolean; covered: boolean; paused: boolean };
  pointer: { x: number; y: number; buttons: number; dragging: boolean; updatedAt: number };
  theme: Record<string, unknown>;
  state: unknown;
  chat: unknown;
  navigation: unknown;
  presenters: { status: unknown; flow: unknown };
  anchors: Record<string, { x: number; y: number; width: number; height: number; visible: boolean }>;
}

export interface DesignSatelliteCommand {
  generation: number;
  surfaceId: string;
  command: string;
  params: unknown;
  correlationId: string;
  label: string;
}

export interface DesignSatelliteCommandAck {
  generation: number;
  surfaceId: string;
  correlationId: string;
  ok: boolean;
  error?: string;
}

export interface DesignSatelliteDiagnostic {
  id: string;
  label: string;
  kind: string;
  bounds: DesignSatelliteBounds;
  contentRect: DesignSatelliteBounds;
  pointerMode: string;
  zOrder: string;
  ready: boolean;
  visible: boolean;
  fps: number;
  lastSnapshotSequence: number;
  lastCommandSequence: number;
  error?: string;
}

export interface DesignSatelliteHostApi {
  get(): readonly DesignSatelliteDiagnostic[];
  subscribe(listener: () => void): () => void;
  setVisible(visible: boolean): Promise<void>;
  updateBounds(bounds: Array<{ id: string; bounds: DesignSatelliteBounds }>): Promise<void>;
  destroy(): Promise<void>;
  getMetrics(): DesignSatelliteMetrics;
}

export interface DesignSatelliteTeardownAck {
  closed: number;
  generation: number | null;
}

export interface DesignSatelliteMetrics {
  sampled: number;
  sent: number;
  dropped: number;
  payloadBytes: number;
  lastSequence: number;
}

interface RawEventPayload extends Record<string, unknown> {
  generation?: number;
  surfaceId?: string;
  surface_id?: string;
  correlationId?: string;
  correlation_id?: string;
  label?: string;
}

function eventSurfaceId(payload: RawEventPayload): string {
  return String(payload.surfaceId ?? payload.surface_id ?? '');
}

function eventCorrelationId(payload: RawEventPayload): string {
  return String(payload.correlationId ?? payload.correlation_id ?? '');
}

function crop(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(-24).map(item => crop(item, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 80);
  return Object.fromEntries(entries.map(([key, item]) => [key, crop(item, depth + 1)]));
}

export function cropSatellitePresenterSnapshot(value: unknown): unknown {
  return crop(value);
}

export function isFreshSatelliteSnapshot(current: DesignSatelliteSnapshot | null, next: DesignSatelliteSnapshot, generation: number, surfaceId: string): boolean {
  return next.generation === generation && next.surfaceId === surfaceId && next.sequence > (current?.sequence ?? 0);
}

export class DesignSatelliteBridge {
  private readonly diagnostics = new Map<string, DesignSatelliteDiagnostic>();
  private readonly listeners = new Set<() => void>();
  private readonly readyLabels = new Map<string, string>();
  private readonly latestBySurface = new Map<string, DesignSatelliteSnapshot>();
  private readonly lastCommandSequence = new Map<string, number>();
  private sequence = 0;
  private frame: number | null = null;
  private lastFrameAt = 0;
  private fpsStartedAt = 0;
  private fpsFrames = 0;
  private publishing = false;
  private starting: Promise<void> | null = null;
  private started = false;
  private unlistenReady: UnlistenFn | null = null;
  private unlistenCommand: UnlistenFn | null = null;
  private destroyed = false;
  private destroyPromise: Promise<void> | null = null;
  private visible = false;
  private readonly gate;
  private readonly metrics: DesignSatelliteMetrics = { sampled: 0, sent: 0, dropped: 0, payloadBytes: 0, lastSequence: 0 };
  private lastDiagnosticNotifyAt = 0;

  readonly api: DesignSatelliteHostApi = {
    get: () => [...this.diagnostics.values()],
    subscribe: listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); },
    setVisible: visible => this.setVisible(visible),
    updateBounds: bounds => this.updateBounds(bounds),
    destroy: () => this.destroy(),
    getMetrics: () => ({ ...this.metrics }),
  };

  constructor(
    private readonly modId: string,
    private readonly generation: number,
    private readonly surfaces: readonly NativeSurfacePackage[],
    private readonly snapshotFactory: (surfaceId: string, sequence: number, descriptor?: DesignSatelliteDescriptor) => DesignSatelliteSnapshot | Promise<DesignSatelliteSnapshot>,
    private readonly dispatch: (command: DesignSatelliteCommand) => void | Promise<void>,
    initiallyVisible = false,
    budget: SnapshotBudget = { foregroundHz: 20, backgroundHz: 0 },
  ) { this.visible = initiallyVisible; this.gate = createSnapshotGate(budget); }

  async start(): Promise<void> {
    if (!this.surfaces.length || this.destroyed) return;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const ready = await listen<RawEventPayload>('design-satellite-ready', event => { void this.onReady(event.payload); });
      if (this.destroyed) { ready(); return; }
      this.unlistenReady = ready;
      const command = await listen<RawEventPayload>('design-satellite-command', event => { void this.onCommand(event.payload); });
      if (this.destroyed) { command(); return; }
      this.unlistenCommand = command;
      const descriptors = await invoke<DesignSatelliteDescriptor[]>('ensure_design_satellites', {
        modId: this.modId,
        generation: this.generation,
        surfaceSpecs: this.surfaces.map(({ entrySource: _entrySource, styleText: _styleText, ...surface }) => surface),
      });
      if (this.destroyed) {
        await invoke('destroy_design_satellites', { generation: this.generation }).catch(() => {});
        return;
      }
      this.replaceDiagnostics(descriptors);
      // Rust creates windows hidden. Always synchronize the native state once,
      // even when the JS visibility value did not change.
      await invoke('set_design_satellites_visible', { generation: this.generation, visible: this.visible });
      if (this.destroyed) return;
      this.started = true;
      this.diagnostics.forEach(diagnostic => { diagnostic.visible = this.visible; });
      await this.publish();
      if (this.visible) this.scheduleFrame();
      this.listeners.forEach(listener => listener());
    })();
    try { await this.starting; } finally { this.starting = null; }
  }

  private replaceDiagnostics(descriptors: DesignSatelliteDescriptor[]): void {
    this.diagnostics.clear();
    descriptors.forEach(descriptor => this.diagnostics.set(descriptor.id, {
      id: descriptor.id,
      label: descriptor.label,
      kind: descriptor.kind,
      bounds: descriptor.bounds,
      contentRect: descriptor.content_rect,
      pointerMode: descriptor.pointer_mode,
      zOrder: descriptor.z_order,
      ready: descriptor.ready,
      visible: descriptor.visible,
      fps: 0,
      lastSnapshotSequence: 0,
      lastCommandSequence: 0,
    }));
    this.listeners.forEach(listener => listener());
  }

  private async onReady(payload: RawEventPayload): Promise<void> {
    if (this.destroyed || Number(payload.generation) !== this.generation) return;
    const surfaceId = eventSurfaceId(payload);
    const label = String(payload.label ?? '');
    if (!this.diagnostics.has(surfaceId) || !label) return;
    this.readyLabels.set(surfaceId, label);
    const diagnostic = this.diagnostics.get(surfaceId);
    if (diagnostic) diagnostic.ready = true;
    this.listeners.forEach(listener => listener());
    const snapshot = this.latestBySurface.get(surfaceId) ?? await this.snapshotFactory(surfaceId, this.sequence, this.toDescriptor(surfaceId));
    if (this.destroyed) return;
    await emitTo(label, DESIGN_SATELLITE_SNAPSHOT_EVENT, snapshot);
  }

  private async onCommand(payload: RawEventPayload): Promise<void> {
    if (this.destroyed || Number(payload.generation) !== this.generation) return;
    const surfaceId = eventSurfaceId(payload);
    const diagnostic = this.diagnostics.get(surfaceId);
    if (!diagnostic || diagnostic.label !== payload.label) return;
    const command: DesignSatelliteCommand = {
      generation: this.generation,
      surfaceId,
      command: String(payload.command ?? ''),
      params: payload.params,
      correlationId: eventCorrelationId(payload),
      label: String(payload.label),
    };
    const sequence = (this.lastCommandSequence.get(surfaceId) ?? 0) + 1;
    this.lastCommandSequence.set(surfaceId, sequence);
    diagnostic.lastCommandSequence = sequence;
    try {
      await this.dispatch(command);
      await emitTo(command.label, DESIGN_SATELLITE_ACK_EVENT, { generation: this.generation, surfaceId, correlationId: command.correlationId, ok: true } satisfies DesignSatelliteCommandAck);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostic.error = message;
      await emitTo(command.label, DESIGN_SATELLITE_ACK_EVENT, { generation: this.generation, surfaceId, correlationId: command.correlationId, ok: false, error: message } satisfies DesignSatelliteCommandAck);
    }
    this.listeners.forEach(listener => listener());
  }

  private async publish(): Promise<void> {
    if (this.destroyed || this.publishing) return;
    if (this.started && (!this.visible || !this.gate.shouldPublish(performance.now(), true))) return;
    if (!this.started) this.gate.shouldPublish(performance.now(), true);
    this.publishing = true;
    const sequence = ++this.sequence;
    try {
      this.metrics.sampled += 1;
      const frames = await Promise.all(this.surfaces.map(surface => this.snapshotFactory(surface.id, sequence, this.toDescriptor(surface.id))));
      if (this.destroyed) return;
      const batch = createSnapshotBatch(sequence, frames);
      this.metrics.payloadBytes += batch.payloadBytes;
      this.metrics.lastSequence = sequence;
      this.metrics.dropped += Math.max(0, frames.length - batch.frames.length);
      await Promise.all(batch.frames.map(async snapshot => {
        if (snapshot.generation !== this.generation) return;
        this.latestBySurface.set(snapshot.surfaceId, snapshot);
        const label = this.readyLabels.get(snapshot.surfaceId);
        if (label) {
          await emitTo(label, DESIGN_SATELLITE_SNAPSHOT_EVENT, snapshot);
          this.metrics.sent += 1;
        }
        const diagnostic = this.diagnostics.get(snapshot.surfaceId);
        if (diagnostic) diagnostic.lastSnapshotSequence = sequence;
      }));
      this.fpsFrames += 1;
      const now = performance.now();
      if (!this.fpsStartedAt) this.fpsStartedAt = now;
      if (now - this.fpsStartedAt >= 1000) {
        const fps = Math.round(this.fpsFrames * 1000 / (now - this.fpsStartedAt));
        this.diagnostics.forEach(diagnostic => { diagnostic.fps = fps; });
        this.fpsStartedAt = now;
        this.fpsFrames = 0;
      }
      this.notifyDiagnostics();
    } finally {
      this.publishing = false;
    }
  }

  private notifyDiagnostics(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastDiagnosticNotifyAt < 1000) return;
    this.lastDiagnosticNotifyAt = now;
    this.listeners.forEach(listener => listener());
  }

  private scheduleFrame(): void {
    if (this.destroyed || !this.visible || this.frame !== null) return;
    this.frame = requestAnimationFrame(now => {
      this.frame = null;
      if (now - this.lastFrameAt >= 50) {
        this.lastFrameAt = now;
        void this.publish();
      }
      this.scheduleFrame();
    });
  }

  private async setVisible(visible: boolean): Promise<void> {
    if (this.destroyed) return;
    if (!this.started) { this.visible = visible; return; }
    if (this.visible === visible) {
      if (visible) this.scheduleFrame();
      return;
    }
    await invoke('set_design_satellites_visible', { generation: this.generation, visible });
    if (this.destroyed) return;
    this.visible = visible;
    if (visible) this.scheduleFrame();
    else if (this.frame !== null) { cancelAnimationFrame(this.frame); this.frame = null; }
    this.diagnostics.forEach(diagnostic => { diagnostic.visible = visible; });
    this.listeners.forEach(listener => listener());
  }

  private async updateBounds(bounds: Array<{ id: string; bounds: DesignSatelliteBounds }>): Promise<void> {
    if (this.destroyed || bounds.length === 0) return;
    const descriptors = await invoke<DesignSatelliteDescriptor[]>('update_design_satellite_bounds', { generation: this.generation, bounds });
    this.replaceDiagnostics(descriptors);
  }

  private destroy(): Promise<void> {
    if (this.destroyPromise) return this.destroyPromise;
    this.destroyPromise = this.destroyImpl();
    return this.destroyPromise;
  }

  private async destroyImpl(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.started = false;
    this.unlistenReady?.();
    this.unlistenCommand?.();
    this.unlistenReady = null;
    this.unlistenCommand = null;
    await invoke<DesignSatelliteTeardownAck>('destroy_current_design_satellites').catch(async () => {
      await invoke('destroy_design_satellites', { generation: this.generation });
    });
    this.diagnostics.clear();
    this.readyLabels.clear();
    this.latestBySurface.clear();
    this.listeners.forEach(listener => listener());
  }

  private toDescriptor(surfaceId: string): DesignSatelliteDescriptor | undefined {
    const diagnostic = this.diagnostics.get(surfaceId);
    if (!diagnostic) return undefined;
    return {
      id: diagnostic.id,
      label: diagnostic.label,
      kind: diagnostic.kind,
      pointer_mode: diagnostic.pointerMode,
      z_order: diagnostic.zOrder,
      bounds: diagnostic.bounds,
      content_rect: diagnostic.contentRect,
      ready: diagnostic.ready,
      visible: diagnostic.visible,
    };
  }
}

export function nativeSurfaceManifestToSpec(surface: NativeSurfaceManifest): NativeSurfaceManifest {
  return { ...surface };
}
