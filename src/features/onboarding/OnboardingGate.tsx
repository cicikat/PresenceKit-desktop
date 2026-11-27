import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getTokenStatus, type TokenStatus } from '../../shared/api/connectionSettings';
import { onAuthInvalidChange, setAuthInvalid } from '../../shared/api/authGate';
import { useI18n } from '../../shared/i18n';
import { StartupSurface } from '../../shared/window/StartupSurface';
import { TokenSetupForm } from './TokenSetupForm';
import { checkTokenStatus, TokenCheckTimeoutError } from './tokenCheck';

type GateState = 'checking' | 'blocked' | 'error' | 'ok';

let startupCheck: Promise<TokenStatus> | undefined;
let startupStatus: TokenStatus | undefined;

/** Check local configuration while code and preferences load, without mounting chat. */
export function prepareOnboarding(): void {
  if (startupCheck) return;
  startupCheck = checkTokenStatus(getTokenStatus).then(status => {
    startupStatus = status;
    return status;
  });
  // The mounted gate presents timeout/failure and its existing retry action.
  void startupCheck.catch(() => {});
}

// 首启 token 引导门禁（cc-tasks/34 §1, 35 §1）：
// - 启动检测：get_token_status 判空/占位符（Rust 侧已修正，见 client_config.rs）。
// - 行为兜底：任意经共享请求层（authGate.invokeGated）的调用收到 401，都会把全局
//   authInvalid 置位——这里订阅它，无论何时触发都退回本页，直到用户重新填写并验证成功。
// 门禁未通过时整个主窗口（含 Dream/Activity/Toy/Room 等子视图）都不挂载，避免任何未鉴权
// 请求在后台继续发起。
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<GateState>(() => startupStatus ? (startupStatus.configured ? 'ok' : 'blocked') : 'checking');
  const [error, setError] = useState<string | null>(null);

  const recheck = useCallback(async (signal?: AbortSignal, initial = false) => {
    if (!initial) setState('checking');
    setError(null);
    try {
      const status = await (initial && startupCheck ? startupCheck : checkTokenStatus(getTokenStatus, undefined, signal));
      if (signal?.aborted) return;
      if (status.configured) {
        setAuthInvalid(false);
        setState('ok');
      } else {
        setState('blocked');
      }
    } catch (nextError) {
      if (signal?.aborted) return;
      setError(nextError instanceof TokenCheckTimeoutError ? t('onboarding.checkFailedTimeout') : t('onboarding.checkFailed'));
      setState('error');
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void recheck(controller.signal, true);
    return () => controller.abort();
  }, [recheck]);

  useEffect(() => onAuthInvalidChange(invalid => {
    if (invalid) setState('blocked');
  }), []);

  if (state === 'checking') return <StartupSurface />;

  if (state === 'error' || (state === 'blocked' && error)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--paper)' }}>
        <div style={{ width: 'min(420px, 92vw)', background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-lg)', padding: '24px 26px', display: 'grid', gap: 12 }}>
          <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{t('onboarding.checkFailedTitle')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{error}</div>
          <button type="button" onClick={() => void recheck()}>{t('common.retry')}</button>
        </div>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--paper)',
      }}>
        <div style={{
          width: 'min(420px, 92vw)', background: 'var(--paper-2)',
          border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-lg)',
          padding: '24px 26px', display: 'grid', gap: 12,
          boxShadow: '0 24px 60px var(--shadow-rgb-mix)',
        }}>
          <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
            {t('onboarding.title')}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            {t('onboarding.description')}
          </div>
          <TokenSetupForm onSuccess={() => void recheck()} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
