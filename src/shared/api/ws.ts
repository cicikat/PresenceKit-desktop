import { invoke } from '@tauri-apps/api/core';
import type { ServerMessage, ClientMessage, ConnectionState, DesktopActionPayload, DesktopActionType } from './types';

type EventMap = {
  state: ConnectionState;
  channel_message: string;
  action: DesktopActionPayload;
};

function actionType(action: DesktopActionPayload): string | null {
  const raw = action.action_type ?? action.type;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function actionParams(action: DesktopActionPayload): Record<string, unknown> {
  return action.params && typeof action.params === 'object' && !Array.isArray(action.params)
    ? action.params
    : {};
}

function stringParam(
  action: DesktopActionPayload,
  keys: string[],
  fallback = '',
): string {
  const params = actionParams(action);
  for (const key of keys) {
    const value = params[key] ?? action[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

class WSClient {
  private ws: WebSocket | null = null;
  private connState: ConnectionState = 'idle';
  private backoff = 1000;
  private lastRecv = 0;
  private watchdogTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private url = '';
  private handlers = new Map<string, Set<(payload: any) => void>>();

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
    this.handlers.get(event)?.forEach(h => h(payload));
  }

  connect(url: string) {
    if (this.url) return; // already initialized, idempotent
    this.url = url;
    this._connect();
  }

  disconnect() {
    this.url = ''; // clears url so onclose won't reschedule
    this._clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this._setState('idle');
  }

  getState(): ConnectionState { return this.connState; }

  private _setState(s: ConnectionState) {
    this.connState = s;
    this.emit('state', s);
  }

  private _clearTimers() {
    if (this.watchdogTimer !== null) { clearInterval(this.watchdogTimer); this.watchdogTimer = null; }
    if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  private _connect() {
    this._setState('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    this.lastRecv = Date.now();

    ws.onopen = () => {
      this._send({ type: 'hello', client: 'emerald-client', version: '0.1' });
      console.log('[ws] WS 已连接，hello 已发送');
      this.watchdogTimer = window.setInterval(() => {
        if (Date.now() - this.lastRecv > 60_000) {
          console.log('[ws] watchdog: 60s 无消息，主动断开重连');
          ws.close();
        }
      }, 5_000);
    };

    ws.onmessage = (e) => {
      this.lastRecv = Date.now();
      let msg: ServerMessage;
      try { msg = JSON.parse(e.data as string); }
      catch { return; }

      switch (msg.type) {
        case 'hello_ack':
          console.log('[ws] 握手成功, server_version:', msg.server_version);
          this.backoff = 1000; // reset backoff on confirmed handshake, not on open
          this._setState('connected');
          break;
        case 'channel_message':
          this.emit('channel_message', msg.content);
          this._send({ type: 'ack', msg_id: msg.msg_id, ok: true });
          break;
        case 'action':
          this.emit('action', msg.action);
          void this._handleAction(msg.msg_id, msg.action);
          break;
        case 'ping':
          this._send({ type: 'pong' });
          break;
      }
    };

    ws.onerror = () => { /* onclose always follows */ };

    ws.onclose = () => {
      this._clearTimers();
      this.ws = null;
      if (!this.url) return; // disconnect() was called, don't reconnect
      this._setState('disconnected');
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, 30_000);
      console.log(`[ws] 连接断开，${delay / 1000}s 后重连`);
      this.reconnectTimer = window.setTimeout(() => this._connect(), delay);
    };
  }

  private _send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private async _handleAction(msgId: string, action: DesktopActionPayload) {
    const type = actionType(action);
    console.log('[ws] action received:', action);

    if (!type) {
      const error = 'action 缺少 type/action_type';
      console.warn('[ws] action dispatch failed:', error, action);
      this._send({ type: 'ack', msg_id: msgId, ok: false, error });
      return;
    }

    try {
      await this._dispatchAction(type as DesktopActionType, action);
      console.log('[ws] action executed:', type);
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
      default:
        throw new Error(`unsupported action type: ${type}`);
    }
  }
}

export const wsClient = new WSClient();
