import { useEffect, useState, type CSSProperties } from 'react';
import { getClientConfig, invalidateClientConfig } from '../../../shared/api/config';
import { getTokenStatus, testBackendAuth, saveClientConfig } from '../../../shared/api/connectionSettings';
import type { TokenStatus } from '../../../shared/api/connectionSettings';
import { wsClient } from '../../../shared/api/ws';

// ─── local styles (kept local to avoid coupling to ChatWindow.tsx internals) ──

const inputStyle: CSSProperties = {
  width: '100%', padding: '6px 9px', boxSizing: 'border-box',
  border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
  background: 'var(--paper-2)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12,
};

const ghostBtn: CSSProperties = {
  padding: '5px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12,
  background: 'var(--paper-2)', border: '1px solid var(--paper-edge)',
  color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
};

const primaryBtn: CSSProperties = {
  ...ghostBtn, background: 'var(--accent-3)', color: 'var(--paper)',
  border: '1px solid transparent',
};

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
        {hint && <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--paper-edge)' }} />;
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'oklch(0.20 0.04 60 / 0.50)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(380px, 90vw)',
        background: 'var(--paper)', border: '1px solid var(--paper-edge)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        boxShadow: '0 24px 60px var(--shadow-rgb-mix)',
      }}>
        <div style={{ padding: '16px 18px', display: 'grid', gap: 10 }}>
          <div className="serif" style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)' }}>确认修改 token？</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{message}</div>
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--paper-edge)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'var(--paper-2)' }}>
          <button onClick={onCancel} style={ghostBtn}>取消</button>
          <button onClick={onConfirm} style={primaryBtn}>确认修改</button>
        </div>
      </div>
    </div>
  );
}

export function ConnectionSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [backendBase, setBackendBase] = useState('');
  const [websocketBase, setWebsocketBase] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([getClientConfig(), getTokenStatus()])
      .then(([cfg, status]) => {
        if (!mounted) return;
        setBackendBase(cfg.backendBase);
        setWebsocketBase(cfg.websocketBase);
        setTokenStatus(status);
      })
      .catch(e => { if (mounted) setSaveResult({ ok: false, msg: `读取失败：${String(e)}` }); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function handleTest() {
    if (!tokenInput.trim()) {
      setTestResult({ ok: false, msg: '请先在上方粘贴 token 再测试（出于安全考虑，已保存的 token 不会回显，无法直接用它测试）' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testBackendAuth(backendBase.trim(), tokenInput.trim());
      setTestResult({ ok: true, msg: `✓ 已认证：${result.label}（scopes: ${result.scopes.join(', ') || '无'}）` });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function doSave() {
    setSaving(true);
    setSaveResult(null);
    try {
      const token = tokenInput.trim() || undefined;
      await saveClientConfig(backendBase.trim(), websocketBase.trim(), token);
      invalidateClientConfig();
      const status = await getTokenStatus();
      setTokenStatus(status);
      setTokenInput('');
      setTestResult(null);
      setShowReconnect(true);
      setSaveResult({ ok: true, msg: '已保存。HTTP 请求即时生效（每次调用重读配置）；WebSocket 需重连才能恢复推送。' });
    } catch (e) {
      setSaveResult({ ok: false, msg: `保存失败：${String(e)}` });
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (tokenInput.trim()) {
      setConfirmOpen(true);
      return;
    }
    void doSave();
  }

  function handleReconnect() {
    wsClient.reconnect(websocketBase.trim());
    setShowReconnect(false);
  }

  if (loading) {
    return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>读取连接配置…</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {confirmOpen && (
        <ConfirmDialog
          message="即将用输入框中的新值覆盖本地保存的 token，此操作不可撤销。确认继续吗？"
          onConfirm={() => { setConfirmOpen(false); void doSave(); }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>连接</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          对应 config/client.local.json；保存后写回该文件，其余自定义键保持不变
        </div>
      </div>

      <Row label="后端地址" hint="Rust 侧 HTTP 请求 base URL，不含末尾 /">
        <input
          style={inputStyle}
          value={backendBase}
          onChange={e => setBackendBase(e.target.value)}
          placeholder="http://127.0.0.1:8080"
        />
      </Row>

      <Row label="WebSocket 地址" hint="原生 WS bridge 连接地址">
        <input
          style={inputStyle}
          value={websocketBase}
          onChange={e => setWebsocketBase(e.target.value)}
          placeholder="ws://127.0.0.1:8080/ws/desktop"
        />
      </Row>

      <Row label="Token" hint={tokenStatus?.configured ? `已配置（${tokenStatus.prefix}…）` : '未配置'}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type={tokenVisible ? 'text' : 'password'}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)' }}
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            placeholder={tokenStatus?.configured ? '留空则不修改已保存的 token' : '粘贴 desktop profile token（emt_…）'}
            autoComplete="off"
          />
          <button style={ghostBtn} onClick={() => setTokenVisible(v => !v)}>{tokenVisible ? '隐藏' : '显示'}</button>
        </div>
      </Row>

      {testResult && (
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: 0.6, color: testResult.ok ? 'var(--ink-2)' : 'var(--danger)' }}>
          {testResult.msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button style={ghostBtn} disabled={testing} onClick={() => void handleTest()}>
          {testing ? '测试中…' : '测试连接'}
        </button>
        <button style={primaryBtn} disabled={saving} onClick={handleSaveClick}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>

      {saveResult && (
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: 0.6, color: saveResult.ok ? 'var(--ink-2)' : 'var(--danger)' }}>
          {saveResult.msg}
        </div>
      )}

      {showReconnect && (
        <Row label="WebSocket 重连" hint="保存后 WS 不会自动重连，需手动触发一次才能恢复推送">
          <button style={ghostBtn} onClick={handleReconnect}>立即重连</button>
        </Row>
      )}

      <Divider />

      <div className="serif" style={{
        padding: '12px 14px', border: '1px dashed var(--paper-edge)',
        borderRadius: 'var(--radius-md)', color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.7,
      }}>
        出于安全考虑，已保存的 token 不会在此回显明文，只显示「已配置（前 8 位）」状态；此处只用于填写新值。也可直接编辑
        config/client.local.json（参见 config/client.example.json 与 docs/backend-integration.md）。
      </div>
    </div>
  );
}
