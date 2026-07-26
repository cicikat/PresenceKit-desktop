import { useEffect, useState } from 'react';
import { getDesktopTtsEnabled, getTtsAutoPlay, setDesktopTtsEnabled, setTtsAutoPlay, type TtsAutoPlaySettings } from '../../../shared/api/runtimeSettings';

export function DesktopTtsSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [autoPlay, setAutoPlay] = useState<TtsAutoPlaySettings>({ chat: false, dream: false, video_call: false, desktop_pet: false, mobile: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDesktopTtsEnabled(), getTtsAutoPlay()])
      .then(([ttsEnabled, settings]) => { setEnabled(ttsEnabled); setAutoPlay(settings); })
      .catch(e => setError(String(e))).finally(() => setLoading(false));
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    setError(null);
    try { await setDesktopTtsEnabled(next); }
    catch (e) { setEnabled(!next); setError(String(e)); }
    finally { setSaving(false); }
  };

  const toggleAutoPlay = async (key: keyof TtsAutoPlaySettings) => {
    const next = !autoPlay[key];
    setAutoPlay(current => ({ ...current, [key]: next }));
    setSaving(true);
    setError(null);
    try { setAutoPlay(await setTtsAutoPlay({ [key]: next })); }
    catch (e) { setAutoPlay(current => ({ ...current, [key]: !next })); setError(String(e)); }
    finally { setSaving(false); }
  };

  const autoPlayRows: Array<[keyof TtsAutoPlaySettings, string, string]> = [
    ['chat', '聊天窗口', '新消息生成语音后自动播放'],
    ['desktop_pet', '桌宠气泡', '桌宠收到回复后自动播放'],
  ];

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>桌面语音条</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>
            开启后助手消息显示语音条；可分别设置各场景是否自动播放
          </div>
        </div>
        <button onClick={() => void toggle()} disabled={loading || saving} style={{
          width: 42, height: 22, borderRadius: 11, padding: 0, position: 'relative', cursor: 'pointer',
          background: enabled ? 'var(--accent-3)' : 'var(--paper-3)', border: '1px solid var(--paper-edge)',
        }}>
          <span style={{ position: 'absolute', top: 1, left: enabled ? 21 : 1, width: 18, height: 18, borderRadius: '50%', background: 'var(--paper)', transition: 'left .2s' }} />
        </button>
      </div>
      <div style={{ borderTop: '1px solid var(--paper-edge)', paddingTop: 10, display: 'grid', gap: 9 }}>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>自动播放</div>
        {autoPlayRows.map(([key, title, description]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{title}</div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 2 }}>{description}</div>
            </div>
            <button onClick={() => void toggleAutoPlay(key)} disabled={loading || saving || !enabled} aria-label={`${title}自动播放`} style={{
              width: 42, height: 22, borderRadius: 11, padding: 0, position: 'relative', cursor: 'pointer',
              background: autoPlay[key] ? 'var(--accent-3)' : 'var(--paper-3)', border: '1px solid var(--paper-edge)', opacity: enabled ? 1 : .5,
            }}>
              <span style={{ position: 'absolute', top: 1, left: autoPlay[key] ? 21 : 1, width: 18, height: 18, borderRadius: '50%', background: 'var(--paper)', transition: 'left .2s' }} />
            </button>
          </div>
        ))}
      </div>
      {error && <div className="mono" style={{ fontSize: 10, color: 'var(--danger)' }}>保存失败：{error}</div>}
    </div>
  );
}
