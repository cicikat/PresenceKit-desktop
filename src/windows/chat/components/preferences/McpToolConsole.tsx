import { useEffect, useMemo, useState } from 'react';
import {
  confirmMcpConsole,
  getMcpConsoleSettings,
  invokeMcpConsole,
  type McpConsoleResult,
  type McpConsoleServer,
  type McpConsoleTool,
} from '../../../../shared/api/mcpConsole';
import { useI18n } from '../../../../shared/i18n';

function eligibleTools(server: McpConsoleServer | undefined): McpConsoleTool[] {
  if (!server?.enabled || !server.runtime.connected) return [];
  return server.tool_states.filter(tool => (
    tool.allowlisted
    && tool.registered
    && (tool.policy_status === 'confirmed' || tool.policy_status === 'legacy_allowed')
  ));
}

export function McpToolConsole() {
  const { t } = useI18n();
  const [servers, setServers] = useState<McpConsoleServer[]>([]);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [serverName, setServerName] = useState('');
  const [toolName, setToolName] = useState('');
  const [argumentsText, setArgumentsText] = useState('{}');
  const [result, setResult] = useState<McpConsoleResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedServer = useMemo(
    () => servers.find(server => server.name === serverName),
    [servers, serverName],
  );
  const tools = useMemo(() => eligibleTools(selectedServer), [selectedServer]);
  const selectedTool = useMemo(
    () => tools.find(tool => tool.name === toolName),
    [tools, toolName],
  );

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const settings = await getMcpConsoleSettings();
      const connected = settings.servers.filter(server => server.enabled && server.runtime.connected);
      setMcpEnabled(settings.enabled);
      setServers(connected);
      setServerName(current => connected.some(server => server.name === current) ? current : (connected[0]?.name ?? ''));
    } catch (reason) {
      setError(`${t('settings.mcpConsole.loadFailed')}${String(reason)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  useEffect(() => {
    setToolName(current => tools.some(tool => tool.name === current) ? current : (tools[0]?.name ?? ''));
    setResult(null);
  }, [serverName, tools]);

  const run = async () => {
    if (!serverName || !toolName || loading) return;
    let arguments_: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(argumentsText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('参数必须是 JSON 对象');
      }
      arguments_ = parsed as Record<string, unknown>;
    } catch (reason) {
      setError(`${t('settings.mcpConsole.argumentsInvalid')}${reason instanceof Error ? reason.message : String(reason)}`);
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setResult(await invokeMcpConsole(serverName, toolName, arguments_));
    } catch (reason) {
      setError(`${t('settings.mcpConsole.invokeFailed')}${String(reason)}`);
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!result?.confirmation_id || loading) return;
    setLoading(true);
    setError('');
    try {
      setResult(await confirmMcpConsole(result.confirmation_id));
    } catch (reason) {
      setError(`${t('settings.mcpConsole.confirmFailed')}${String(reason)}`);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setResult(null);
    setError('');
  };

  const disabled = loading || !mcpEnabled || !selectedTool;
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{t('settings.mcpConsole.title')}</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 0.8 }}>{t('settings.mcpConsole.adminOnly')}</div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => void reload()} disabled={loading} style={buttonStyle} title={t('settings.mcpConsole.refreshTitle')}>↻</button>
      </div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        {t('settings.mcpConsole.description')}
      </div>
      {!mcpEnabled && <Notice text={t('settings.mcpConsole.disabled')} />}
      {mcpEnabled && servers.length === 0 && <Notice text={t('settings.mcpConsole.noServer')} />}
      {mcpEnabled && servers.length > 0 && (
        <>
          <label style={labelStyle}>{t('settings.mcpConsole.serverLabel')}
            <select value={serverName} onChange={event => setServerName(event.target.value)} style={selectStyle} disabled={loading}>
              {servers.map(server => <option key={server.name} value={server.name}>{server.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>{t('settings.mcpConsole.toolLabel')}
            <select value={toolName} onChange={event => setToolName(event.target.value)} style={selectStyle} disabled={loading || tools.length === 0}>
              {tools.map(tool => <option key={tool.name} value={tool.name}>{tool.name}</option>)}
            </select>
          </label>
          {tools.length === 0 && <Notice text={t('settings.mcpConsole.noTool')} />}
          {selectedTool && (
            <>
              <div style={infoStyle}>
                <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{selectedTool.description || t('settings.mcpConsole.noDescription')}</div>
                <div className="mono" style={{ marginTop: 4, fontSize: 9.5, color: 'var(--ink-3)' }}>
                  effect: {selectedTool.effect || 'unclassified'}{selectedTool.require_confirm ? ' · confirmation required' : ''}
                </div>
              </div>
              <label style={labelStyle}>{t('settings.mcpConsole.argumentsLabel')}
                <textarea value={argumentsText} onChange={event => setArgumentsText(event.target.value)} spellCheck={false}
                  disabled={loading} style={{ ...selectStyle, minHeight: 108, resize: 'vertical', fontFamily: 'ui-monospace, Consolas, monospace', lineHeight: 1.5 }} />
              </label>
              <details>
                <summary style={{ cursor: 'pointer', color: 'var(--ink-2)', fontSize: 11.5 }}>{t('settings.mcpConsole.schema')}</summary>
                <pre style={{ ...infoStyle, margin: '8px 0 0', maxHeight: 180, overflow: 'auto', fontSize: 10, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(selectedTool.input_schema, null, 2)}
                </pre>
              </details>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={clear} disabled={loading || (!result && !error)} style={buttonStyle}>{t('settings.mcpConsole.clear')}</button>
                <button type="button" onClick={() => void run()} disabled={disabled} style={primaryButtonStyle}>
                  {loading ? t('settings.mcpConsole.calling') : t('settings.mcpConsole.call')}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {error && <div style={{ color: 'var(--danger, #a33)', fontSize: 11.5 }}>{error}</div>}
      {result && (
        <div style={infoStyle}>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>audit_id: {result.audit_id}</div>
          {result.status === 'confirmation_required' ? (
            <>
              <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink)' }}>{result.confirmation_message}</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" onClick={clear} disabled={loading} style={buttonStyle}>{t('settings.mcpConsole.cancel')}</button>
                <button type="button" onClick={() => void confirm()} disabled={loading} style={primaryButtonStyle}>
                  {loading ? t('settings.mcpConsole.executing') : t('settings.mcpConsole.confirm')}
                </button>
              </div>
            </>
          ) : <pre style={{ margin: '7px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11.5, color: 'var(--ink-2)' }}>{result.result || t('settings.mcpConsole.noTextResult')}</pre>}
        </div>
      )}
    </section>
  );
}

function Notice({ text }: { text: string }) {
  return <div style={{ padding: '9px 11px', border: '1px solid var(--paper-edge)', color: 'var(--ink-3)', fontSize: 11.5 }}>{text}</div>;
}

const labelStyle = { display: 'grid', gap: 5, color: 'var(--ink-2)', fontSize: 11.5 };
const selectStyle = { width: '100%', boxSizing: 'border-box' as const, padding: '7px 9px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)', color: 'var(--ink)' };
const infoStyle = { padding: '10px 12px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)' };
const buttonStyle = { padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--paper-edge)', background: 'var(--paper-2)', color: 'var(--ink-2)', cursor: 'pointer' };
const primaryButtonStyle = { ...buttonStyle, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'white' };
