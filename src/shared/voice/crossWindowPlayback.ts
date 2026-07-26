import { emitTo, listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { setAudioPlaybackGate, type AudioPlaybackPermit } from './playbackQueue';

const MAIN_WINDOW_LABEL = 'main';
const REQUEST_EVENT = 'voice-playback://request';
const RELEASE_EVENT = 'voice-playback://release';
const GRANTED_EVENT = 'voice-playback://granted';

interface PlaybackRequest {
  requestId: string;
  windowLabel: string;
}

interface PlaybackGrant {
  requestId: string;
}

let initPromise: Promise<void> | null = null;

/**
 * The main Webview owns a tiny lease queue. Every Webview can prepare audio in
 * parallel, but exactly one Webview holds the audible-output lease at a time.
 */
export function initCrossWindowAudioPlayback(): Promise<void> {
  if (!initPromise) initPromise = initialize();
  return initPromise;
}

async function initialize(): Promise<void> {
  const windowLabel = getCurrentWebviewWindow().label;
  if (windowLabel === MAIN_WINDOW_LABEL) await installMainWindowCoordinator();
  setAudioPlaybackGate({
    acquire: () => requestPlaybackPermit(windowLabel),
  });
}

async function requestPlaybackPermit(windowLabel: string): Promise<AudioPlaybackPermit> {
  const requestId = crypto.randomUUID();
  let resolveGrant!: () => void;
  let rejectGrant!: (error: Error) => void;
  const granted = new Promise<void>((resolve, reject) => {
    resolveGrant = resolve;
    rejectGrant = reject;
  });
  const unlisten = await listen<PlaybackGrant>(GRANTED_EVENT, event => {
    if (event.payload.requestId === requestId) resolveGrant();
  });
  const timeout = window.setTimeout(
    () => rejectGrant(new Error('cross-window playback coordinator timeout')),
    3000,
  );

  try {
    await emitTo(MAIN_WINDOW_LABEL, REQUEST_EVENT, { requestId, windowLabel } satisfies PlaybackRequest);
    await granted;
  } catch (error) {
    // A browser preview or a partial desktop startup has no main coordinator.
    // Playing locally is better than silently discarding an already-rendered voice.
    console.warn('[voice] cross-window coordinator unavailable; playing locally:', error);
    return { release: async () => {} };
  } finally {
    window.clearTimeout(timeout);
    unlisten();
  }

  return {
    release: () => emitTo(MAIN_WINDOW_LABEL, RELEASE_EVENT, { requestId } satisfies PlaybackGrant),
  };
}

async function installMainWindowCoordinator(): Promise<void> {
  const waiting: PlaybackRequest[] = [];
  let active: PlaybackRequest | null = null;

  const grantNext = async (): Promise<void> => {
    const next = waiting.shift() ?? null;
    active = next;
    if (!next) return;
    try {
      await emitTo(next.windowLabel, GRANTED_EVENT, { requestId: next.requestId } satisfies PlaybackGrant);
    } catch (error) {
      console.warn('[voice] skipped unavailable playback window:', error);
      await grantNext();
    }
  };

  await listen<PlaybackRequest>(REQUEST_EVENT, event => {
    const request = event.payload;
    if (active) waiting.push(request);
    else {
      waiting.push(request);
      void grantNext();
    }
  });
  await listen<PlaybackGrant>(RELEASE_EVENT, event => {
    if (active?.requestId !== event.payload.requestId) return;
    void grantNext();
  });
}
