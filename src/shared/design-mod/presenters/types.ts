import type { DiaryListItem, GardenState, PromptAssetCharacter } from '../../../shared/api/types';
import type { ToolStatusOverlayState } from '../../../shared/state/toolStatusOverlay';
import type { DesignPresenter } from './base';

export interface StatusPresenterSnapshot {
  schemaVersion: 1;
  mood: { id: string; label: string; hue: number; aura: number };
  activity: { id: string | null; text: string; arc?: string | null } | null;
  presence: { id: string; active: boolean };
  telemetry: {
    breath: number;
    gazeLock: number;
    moodAura: number;
    rhythm: number;
    source: 'sensor' | 'derived';
    sensorAvailable: boolean;
    sensorStaleSeconds?: number;
  };
  timeline: Array<{ mood: string; hue: number; aura: number; sampledAt: number }>;
  errors: { mood: string | null; activity: string | null; sensor: string | null };
  updatedAt: number;
}

export interface StatusPresenterCommands {
  retryMood(): void;
  retryActivity(): void;
  retrySensor(): void;
}

export interface FlowTimelineEntry {
  id: string;
  text: string;
  mood: string;
  timestamp: number;
}

export interface FlowPresenterSnapshot {
  schemaVersion: 1;
  narrative: string;
  mood: { id: string; hue: number };
  focus: { id: string; label: string };
  presence: { id: string; active: boolean };
  toolStatus: ToolStatusOverlayState | null;
  timeline: FlowTimelineEntry[];
  loading: boolean;
  error: string | null;
  source: 'state-engine' | 'tool-overlay';
  characterId: string;
  updatedAt: number;
}

export interface FlowPresenterCommands {
  refresh(): void;
}

export interface GardenPresenterSnapshot {
  schemaVersion: 1;
  garden: GardenState | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  source: 'garden-api' | 'empty';
  updatedAt: number;
}

export interface GardenPresenterCommands {
  refresh(): void;
}

export interface DiaryPresenterSnapshot {
  schemaVersion: 1;
  characters: PromptAssetCharacter[];
  activeCharacterId: string;
  entries: DiaryListItem[];
  loading: boolean;
  error: string | null;
  selectedEntryId: string | null;
  lastUpdated: number | null;
  source: 'diary-api' | 'empty';
  updatedAt: number;
}

export interface DiaryPresenterCommands {
  refresh(): void;
  selectCharacter(characterId: string): void;
  openEntry(entryId: string): Promise<void>;
}

export type StatusPresenter = DesignPresenter<StatusPresenterSnapshot, StatusPresenterCommands>;
export type FlowPresenter = DesignPresenter<FlowPresenterSnapshot, FlowPresenterCommands>;
export type GardenPresenter = DesignPresenter<GardenPresenterSnapshot, GardenPresenterCommands>;
export type DiaryPresenter = DesignPresenter<DiaryPresenterSnapshot, DiaryPresenterCommands>;
