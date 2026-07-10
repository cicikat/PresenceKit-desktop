import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  ServerMessage,
  ClientMessage,
  ConnectionState,
  DesktopActionPayload,
  DesktopActionType,
  NarrativeSegment,
} from './types';
import { isPresenceNagEnabled } from '../presenceNag';
import { getActiveCharacterInfo } from '../activeCharacter';
import { actionType, actionParams, stringParam } from './wsActionParams';

type EventMap = {
  state: ConnectionState;
  channel_message: { content: string; msg_id: string; source?: string; char_id?: string; round_id?: string };
  message_segments: { content: string; segments: NarrativeSegment[]; msg_id: string; source?: string; char_id?: string };
  action: DesktopActionPayload;
  dream_invite: Record<string, never>;
  toy_invite: Record<string, never>;
  message_stream_start: { msg_id: string; char_id?: string; round_id?: string };
  message_stream_delta: { msg_id: string; delta: string };
  message_stream_end: { msg_id: string };
  group_round_start: { round_id: string; group_id: string };
  group_round_end: { round_id: string; group_id: string };
};

type NativeMessageEvent = { connectionId: number; data: string };
type NativeCloseEvent = {
  connectionId: number;
  code: number;
  replacedByNewConnection: boolean;
};

class WSClient {
  private connectionId: number | null = null;
  private connState: ConnectionState = 'idle';
  private backoff = 1000;
  private lastRecv = 0;
  private watchdogTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private url = '';
  private authFailed = false;
  private listenersPromise: Promise<void> | null = null;
  private handlers = new Map<string, Set<(payload: any) => void>>();

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
    this.handlers.get(event)?.forEach(handler => handler(payload));
  }

  connect(url: string) {
    if (this.url) return;
    // The URL is only an initialization marker. Rust reads and sanitizes the real
    // configured URL so credentials never enter WebView state or native events.
    this.url = url;
    this.authFailed = false;
    this._connect();
  }

  disconnect() {
    this.url = '';
    this._clearTimers();
    this.connectionId = null;
    void invoke('native_ws_disconnect');
    this._setState('idle');
  }

  // 连接设置页保存后调用：强制断开并用新地址重连，忽略 connect() 的“已有 url 则跳过”守卫。
  reconnect(url: string) {
    this.disconnect();
    this.connect(url);
  }

  getState(): ConnectionState {
    return this.connState;
  }

  private _setState(state: ConnectionState) {
    this.connState = state;
    this.emit('state', state);
  }

  private _clearTimers() {
    if (this.watchdogTimer !== null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async _ensureListeners() {
    if (!this.listenersPromise) {
      this.listenersPromise = Promise.all([
        listen<NativeMessageEvent>('client-ws-message', event => {
          if (event.payload.connectionId !== this.connectionId) return;
          this._handleMessage(event.payload.data);
        }),
        listen<NativeCloseEvent>('client-ws-close', event => {
          if (event.payload.connectionId !== this.connectionId) return;
          this._handleClose(event.payload.replacedByNewConnection);
        }),
      ]).then(() => undefined);
    }
    return this.listenersPromise;
  }

  private _connect() {
    void this._connectNative();
  }

  private async _connectNative() {
    this._setState('connecting');
    try {
      await this._ensureListeners();
      const connectionId = await invoke<number>('native_ws_connect');
      if (!this.url) {
        await invoke('native_ws_disconnect');
        return;
      }
      this.connectionId = connectionId;
      this.authFailed = false;
      this.lastRecv = Date.now();
      this._send({ type: 'hello', client: 'emerald-client', version: '0.1' });
      this.watchdogTimer = window.setInterval(() => {
        if (Date.now() - this.lastRecv > 60_000) {
          void invoke('native_ws_disconnect');
        }
      }, 5_000);
    } catch (error) {
      const message = String(error);
      this.connectionId = null;
      this._clearTimers();
      if (message.includes('AUTHENTICATION_FAILED')) {
        this.authFailed = true;
        this._setState('auth-failed');
        console.warn('[ws] WebSocket 认证被拒：token 无效或缺少 ws.desktop scope');
        return;
      }
      this._setState('disconnected');
      this._scheduleReconnect();
    }
  }

  private _handleMessage(data: string) {
    this.lastRecv = Date.now();
    let msg: ServerMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'hello_ack':
        this.backoff = 1000;
        this._setState('connected');
        break;
      case 'channel_message':
        this.emit('channel_message', { content: msg.content, msg_id: msg.msg_id, source: msg.source, char_id: msg.char_id, round_id: msg.round_id });
        this._send({ type: 'ack', msg_id: msg.msg_id, ok: true });
        break;
      case 'message_segments':
        this.emit('message_segments', {
          content: msg.content,
          segments: msg.segments,
          msg_id: msg.msg_id,
          source: msg.source,
          char_id: msg.char_id,
        });
        break;
      case 'action':
        this.emit('action', msg.action);
        void this._handleAction(msg.msg_id, msg.action);
        break;
      case 'ping':
        this._send({ type: 'pong' });
        break;
      case 'message_stream_start':
        this.emit('message_stream_start', { msg_id: msg.msg_id, char_id: msg.char_id, round_id: msg.round_id });
        break;
      case 'message_stream_delta':
        this.emit('message_stream_delta', { msg_id: msg.msg_id, delta: msg.delta });
        break;
      case 'message_stream_end':
        this.emit('message_stream_end', { msg_id: msg.msg_id });
        break;
      case 'group_round_start':
        this.emit('group_round_start', { round_id: msg.round_id, group_id: msg.group_id });
        break;
      case 'group_round_end':
        this.emit('group_round_end', { round_id: msg.round_id, group_id: msg.group_id });
        break;
    }
  }

  private _handleClose(replacedByNewConnection: boolean) {
    this._clearTimers();
    this.connectionId = null;
    if (replacedByNewConnection) {
      this.url = '';
      this._setState('idle');
      return;
    }
    if (!this.url || this.authFailed) return;
    this._setState('disconnected');
    this._scheduleReconnect();
  }

  private _scheduleReconnect() {
    if (!this.url || this.authFailed) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30_000);
    this.reconnectTimer = window.setTimeout(() => this._connect(), delay);
  }

  private _send(msg: ClientMessage) {
    if (this.connectionId === null) return;
    void invoke('native_ws_send', {
      connectionId: this.connectionId,
      message: JSON.stringify(msg),
    });
  }

  private async _handleAction(msgId: string, action: DesktopActionPayload) {
    const type = actionType(action);
    if (!type) {
      const error = 'action 缺少 type/action_type';
      console.warn('[ws] action dispatch failed:', error);
      this._send({ type: 'ack', msg_id: msgId, ok: false, error });
      return;
    }

    try {
      await this._dispatchAction(type as DesktopActionType, action);
      this._send({ type: 'ack', msg_id: msgId, ok: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn('[ws] action execute failed:', type, error);
      this._send({ type: 'ack', msg_id: msgId, ok: false, error });
    }
  }

  private async _dispatchAction(type: DesktopActionType, action: DesktopActionPayload) {
    switch (type) {
      case 'minimize_window':
        await invoke('action_minimize_window');
        return;
      case 'open_url': {
        const url = stringParam(action, ['url']);
        if (!url) throw new Error('open_url 缺少 params.url');
        await invoke('action_open_url', { url });
        return;
      }
      case 'show_notify': {
        const text = stringParam(action, ['text', 'message', 'body']);
        if (!text) throw new Error('show_notify 缺少 params.text');
        const title = stringParam(action, ['title'], 'Emerald');
        await invoke('action_show_notify', { title, text });
        return;
      }
      case 'media_play_pause':
        await invoke('action_media_play_pause');
        return;
      case 'play_netease': {
        const songId = stringParam(action, ['song_id']);
        if (!songId) throw new Error('play_netease 缺少 params.song_id');
        await invoke('action_play_netease', { songId });
        return;
      }
      case 'dream_invite':
        this.emit('dream_invite', {});
        return;
      case 'toy_invite':
        this.emit('toy_invite', {});
        return;
      case 'presence_nag': {
        if (!isPresenceNagEnabled()) return;
        const text = stringParam(action, ['text', 'message', 'body']);
        if (!text) throw new Error('presence_nag 缺少 text');
        const avatar = stringParam(action, ['avatar', 'character', 'char_id'], getActiveCharacterInfo().id);
        await invoke('presence_nag', { text, avatar });
        return;
      }
      case 'avatar_directive':
        // consumed via wsClient.on('action') in avatarDirective.ts
        return;
      default:
        throw new Error(`unsupported action type: ${type}`);
    }
  }
}

export const wsClient = new WSClient();
