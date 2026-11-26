// One in-memory grant per selected role and connection. Reopening the UI or
// explicitly changing role/connection starts a new binding; failed/expired
// grants never trigger an automatic replay or a replacement session.
export interface RealityGrant {
  session_id: string;
  char_id: string;
  owner_id: string;
  domain: string;
  expires_at: number;
  connection_key: string;
}

// Raised before dispatch, or after the server explicitly rejects admission.
export class SessionPreparationError extends Error {}

export const realityCommands = new Set([
  'transcribe_audio', 'send_chat', 'get_chat_request', 'upload_document', 'desktop_wake',
  'load_chat_log_dates', 'load_chat_log_day', 'load_turn_reasoning',
  'download_chat_artifact', 'preview_chat_artifact', 'preview_chat_image',
  'get_video_call_state', 'observe_video_call_frame', 'poll_video_call_camera',
  'submit_video_call_camera_frame', 'close_video_call_camera',
  'respond_video_call_invite', 'hangup_video_call_invite',
]);

export class RealitySessions {
  private current?: { key: string; grant: Promise<RealityGrant> };

  async acquire(charId: string, connectionKey: string,
    bind: () => Promise<RealityGrant>, now = Date.now() / 1000): Promise<RealityGrant> {
    if (!charId) throw new Error('session_scope_required');
    const key = JSON.stringify([connectionKey, charId]);
    if (this.current?.key !== key) this.current = { key, grant: bind() };
    const grant = await this.current.grant;
    if (this.current.key !== key || grant.connection_key !== connectionKey ||
      grant.char_id !== charId || grant.domain !== 'reality' || !grant.owner_id || !grant.session_id)
      throw new Error('session_scope_stale');
    if (grant.expires_at <= now) throw new Error('session_not_found');
    return grant;
  }
}
