import { emit, emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { DEFAULT_PET_SNAPSHOT, type PetSnapshot } from './types';

export const PET_WINDOW_LABEL = 'pet';
const PET_SNAPSHOT_EVENT = 'pet://snapshot';
const PET_READY_EVENT = 'pet://ready';

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

export function summarizePetReply(text: string, maxLength = 92) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  const sentence = compact.match(/^.*?[。！？!?…](?:…)?/)?.[0] ?? compact;
  return sentence.length > maxLength
    ? `${sentence.slice(0, maxLength - 1)}…`
    : sentence;
}
