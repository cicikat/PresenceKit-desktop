import { useEffect, useRef, useState } from 'react';
import { getChatSettings, setChatMode, setChatMultiMessage, setChatStyle } from '../../../../shared/api/chat-settings';
import type { ChatSettings } from '../../../../shared/api/types';
import { PrefRow, PrefSwitch, prefSelectStyle } from './PrefAtoms';
export function ChatSettingsSection() {
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getChatSettings()
      .then(s => { setSettings(s); setLoading(false); })
      .catch(e => { setStatus({ ok: false, msg: `读取失败：${String(e)}` }); setLoading(false); });
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const flash = (ok: boolean, msg: string) => {
    setStatus({ ok, msg });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(null), 3000);
  };

  const saveMode = async (mode: ChatSettings['mode']) => {
    if (!settings || saving) return;
    setSaving(true);
    const prev = settings.mode;
    setSettings(s => s ? { ...s, mode } : s);
    try { await setChatMode(mode); flash(true, '聊天模式已保存'); }
    catch (e) { setSettings(s => s ? { ...s, mode: prev } : s); flash(false, `保存失败：${String(e)}`); }
    finally { setSaving(false); }
  };

  const saveStyle = async (style: ChatSettings['style']) => {
    if (!settings || saving) return;
    setSaving(true);
    const prev = settings.style;
    setSettings(s => s ? { ...s, style } : s);
    try { await setChatStyle(style); flash(true, '对话风格已保存'); }
    catch (e) { setSettings(s => s ? { ...s, style: prev } : s); flash(false, `保存失败：${String(e)}`); }
    finally { setSaving(false); }
  };

  const saveMultiMessage = async (enabled: boolean) => {
    if (!settings || saving) return;
    setSaving(true);
    const prev = settings.multi_message;
    setSettings(s => s ? { ...s, multi_message: enabled } : s);
    try { await setChatMultiMessage(enabled); flash(true, '分条发送已保存'); }
    catch (e) { setSettings(s => s ? { ...s, multi_message: prev } : s); flash(false, `保存失败：${String(e)}`); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>读取对话设置…</div>;
  }

  return (
    <div>
      <div style={{ display: 'grid', gap: 14 }}>
        <PrefRow label="聊天模式" hint="chat：日常陪伴 / roleplay：完整角色扮演管线">
          <select
            value={settings?.mode ?? 'chat'}
            disabled={saving || !settings}
            onChange={e => void saveMode(e.target.value as ChatSettings['mode'])}
            style={{ ...prefSelectStyle, width: 140 }}
          >
            <option value="chat">日常陪伴</option>
            <option value="roleplay">角色扮演</option>
          </select>
        </PrefRow>
        <PrefRow label="对话风格" hint="chat：以对白与回应为核心 / roleplay：第一人称沉浸，动作心理用括号表达">
          <select
            value={settings?.style ?? 'roleplay'}
            disabled={saving || !settings}
            onChange={e => void saveStyle(e.target.value as ChatSettings['style'])}
            style={{ ...prefSelectStyle, width: 140 }}
          >
            <option value="chat">对白为主</option>
            <option value="roleplay">第一人称沉浸</option>
          </select>
        </PrefRow>
        <PrefRow label="多消息分条" hint="开启后 AI 回复拆分成多条气泡发送">
          <PrefSwitch
            active={settings?.multi_message ?? false}
            onClick={() => { if (settings) void saveMultiMessage(!settings.multi_message); }}
          />
        </PrefRow>
        {status && (
          <div className="mono" style={{
            fontSize: 9.5, letterSpacing: 0.8,
            color: status.ok ? 'var(--ink-3)' : 'var(--danger)',
          }}>
            {status.msg}
          </div>
        )}
      </div>
    </div>
  );
}
