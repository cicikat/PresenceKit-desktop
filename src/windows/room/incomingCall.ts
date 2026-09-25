import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

export interface IncomingVideoCall {
  invite_id: string;
  char_id: string;
  expires_in_seconds: number;
}

const LABEL = 'video-call-invite';

export async function showIncomingVideoCall(call: IncomingVideoCall): Promise<void> {
  const existing = await WebviewWindow.getByLabel(LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }
  const deadline = Date.now() + Math.min(10, Math.max(0, call.expires_in_seconds)) * 1000;
  const params = new URLSearchParams({
    window: 'video-call-invite',
    invite: call.invite_id,
    char: call.char_id,
    deadline: String(deadline),
  });
  const window = new WebviewWindow(LABEL, {
    url: `index.html?${params.toString()}`,
    title: '视频来电',
    width: 384,
    height: 510,
    center: true,
    resizable: false,
    decorations: false,
    alwaysOnTop: true,
    focus: true,
    visible: true,
    skipTaskbar: false,
  });
  window.once('tauri://error', event => console.warn('[video-call] incoming window failed', event));
}
