import { useEffect, useState, type CSSProperties } from 'react';
import { getClientConfig, invalidateClientConfig } from '../../shared/api/config';
import { testBackendAuth, saveClientConfig } from '../../shared/api/connectionSettings';
import { setAuthInvalid } from '../../shared/api/authGate';
import { classifyHttpError } from '../../shared/api/httpError';
import { useI18n } from '../../shared/i18n';

const inputStyle: CSSProperties = {
  width: '100%', padding: '7px 10px', boxSizing: 'border-box',
  border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
  background: 'var(--paper-2)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 13,
};

const primaryBtn: CSSProperties = {
  padding: '7px 16px', borderRadius: 'var(--radius-sm)', fontSize: 13,
  background: 'var(--accent-3)', color: 'var(--paper)',
  border: '1px solid transparent', cursor: 'pointer', fontFamily: 'inherit',
};

export interface TokenSetupFormProps {
  onSuccess: () => void;
}

// 首启引导门禁（cc-tasks/34 §1, 35 §1）的 token 校验/保存表单；梦境等其余入口的 401
// 都并入同一份 authGate 全局门禁,不再各自维护表单（cc-tasks/37）。
export function TokenSetupForm({ onSuccess }: TokenSetupFormProps) {
  const { t } = useI18n();
  const [backendBase, setBackendBase] = useState('');
  const [websocketBase, setWebsocketBase] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getClientConfig().then(cfg => {
      if (!mounted) return;
      setBackendBase(cfg.backendBase);
      setWebsocketBase(cfg.websocketBase);
      setLoaded(true);
    });
    return () => { mounted = false; };
  }, []);

  async function handleSubmit() {
    const token = tokenInput.trim();
    if (!token) {
      setError(t('onboarding.errorEmpty'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await testBackendAuth(backendBase.trim(), token);
      await saveClientConfig(backendBase.trim(), websocketBase.trim(), token);
      invalidateClientConfig();
      setAuthInvalid(false);
      setTokenInput('');
      onSuccess();
    } catch (err) {
      const classified = classifyHttpError(err);
      setError(classified.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {loaded && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 4 }}>
            {t('onboarding.stepOpenPanel')}
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 1 }}>
              {t('onboarding.backendAddressLabel')}
            </span>
            <input
              style={inputStyle}
              value={backendBase}
              onChange={e => setBackendBase(e.target.value)}
              placeholder="http://127.0.0.1:8080"
            />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{t('onboarding.tokenInputLabel')}</span>
        <input
          type="password"
          style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)' }}
          value={tokenInput}
          onChange={e => setTokenInput(e.target.value)}
          placeholder={t('onboarding.tokenInputPlaceholder')}
          autoComplete="off"
          onKeyDown={e => { if (e.key === 'Enter') void handleSubmit(); }}
        />
      </div>

      {error && (
        <div className="mono" style={{ fontSize: 11, letterSpacing: 0.4, color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <button style={primaryBtn} disabled={submitting} onClick={() => void handleSubmit()}>
        {submitting ? t('onboarding.submitting') : t('onboarding.submit')}
      </button>
    </div>
  );
}
