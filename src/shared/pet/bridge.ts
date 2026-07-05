import { emit, emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { DEFAULT_PET_SNAPSHOT, type PetSnapshot } from './types';
import type { NarrativeSegment } from '../api/types';

export const PET_WINDOW_LABEL = 'pet';
const PET_SNAPSHOT_EVENT = 'pet://snapshot';
const PET_READY_EVENT = 'pet://ready';
const PET_PREFS_EVENT = 'pet://prefs';
const PET_TURN_EVENT = 'pet://turn';

export interface PetPrefsPatch {
  model3dZoom?: number;
  live2dZoom?: number;
}

// Raw, un-summarized forward of the main window's WS turn events — see cc-tasks/14 §D.
// The main window is the only WS connection (desktop_ws.py is single-connection); the pet
// window can't connect itself, so ChatWindow forwards these verbatim after receiving them.
export type PetTurnEvent =
  | { kind: 'channel_message'; content: string; msg_id: string; source?: string; char_id?: string; round_id?: string }
  | { kind: 'message_segments'; content: string; segments: NarrativeSegment[]; msg_id: string; source?: string; char_id?: string }
  | { kind: 'message_stream_start'; msg_id: string; char_id?: string; round_id?: string }
  | { kind: 'message_stream_delta'; msg_id: string; delta: string }
  | { kind: 'message_stream_end'; msg_id: string };

let currentSnapshot: PetSnapshot = DEFAULT_PET_SNAPSHOT;

function sendCurrentSnapshot() {
  return emitTo(PET_WINDOW_LABEL, PET_SNAPSHOT_EVENT, currentSnapshot)
    .catch(error => console.warn('[pet] snapshot 广播失败:', error));
}

export function publishPetSnapshot(patch: Partial<PetSnapshot>) {
  currentSnapshot = {
    ...currentSnapshot,
    ...patch,
    updatedAt: Date.now(),
  };
  void sendCurrentSnapshot();
}

export async function startPetSnapshotResponder(): Promise<UnlistenFn> {
  return listen(PET_READY_EVENT, () => {
    void sendCurrentSnapshot();
  });
}

export async function listenPetSnapshots(
  handler: (snapshot: PetSnapshot) => void,
): Promise<UnlistenFn> {
  handler(DEFAULT_PET_SNAPSHOT);
  const unlisten = await listen<PetSnapshot>(PET_SNAPSHOT_EVENT, event => {
    handler({ ...DEFAULT_PET_SNAPSHOT, ...event.payload });
  });
  await emit(PET_READY_EVENT);
  return unlisten;
}

export async function setPetWindowVisible(visible: boolean) {
  const petWindow = await WebviewWindow.getByLabel(PET_WINDOW_LABEL);
  if (!petWindow) throw new Error('pet window 尚未注册');
  if (visible) {
    await petWindow.show();
    await sendCurrentSnapshot();
  } else {
    await petWindow.hide();
  }
}

export function emitPetPrefs(patch: PetPrefsPatch) {
  return emitTo(PET_WINDOW_LABEL, PET_PREFS_EVENT, patch)
    .catch(error => console.warn('[pet] prefs 广播失败:', error));
}

export async function listenPetPrefs(
  handler: (patch: PetPrefsPatch) => void,
): Promise<UnlistenFn> {
  return listen<PetPrefsPatch>(PET_PREFS_EVENT, event => handler(event.payload));
}

export function emitPetTurn(turn: PetTurnEvent) {
  return emitTo(PET_WINDOW_LABEL, PET_TURN_EVENT, turn)
    .catch(error => console.warn('[pet] turn 转发失败:', error));
}

export async function listenPetTurn(
  handler: (turn: PetTurnEvent) => void,
): Promise<UnlistenFn> {
  return listen<PetTurnEvent>(PET_TURN_EVENT, event => handler(event.payload));
}
