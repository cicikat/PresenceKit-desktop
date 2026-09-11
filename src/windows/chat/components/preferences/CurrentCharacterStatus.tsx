import { useEffect, useRef, useState } from 'react';
import { getPromptAssets, patchPromptAssets } from '../../../../shared/api/backend';
import type { PromptAssetsResponse } from '../../../../shared/api/types';
import { subscribeActiveCharacter, updateActiveCharacterFromAssets } from '../../../../shared/activeCharacter';
import { useI18n } from '../../../../shared/i18n';
import './SettingsSections.css';
import { PrefRow, prefSelectStyle, prefActionButtonStyle } from './PrefAtoms';

export function CurrentCharacterStatus({ onCharacterSwitched }: { onCharacterSwitched?: () => void }) {
  const { t } = useI18n();
  const [assets, setAssets] = useState<PromptAssetsResponse | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  async function refresh() {
    const current = ++generation.current;
    setAssets(null); setError(false);
    try { const next = await getPromptAssets({ force: true }); if (current === generation.current) setAssets(next); }
    catch { if (current === generation.current) setError(true); }
  }
  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeActiveCharacter(() => { void refresh(); });
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { ++generation.current; unsubscribe(); window.removeEventListener('focus', onFocus); };
  }, []);
  async function selectCharacter(id: string) {
    if (!assets || busy || !assets.characters.some(c => c.id === id)) return;
    setBusy(true);
    try {
      const result = await patchPromptAssets({ active_character: id });
      updateActiveCharacterFromAssets({ ...assets, active: result.active });
      onCharacterSwitched?.();
      await refresh();
    } catch { setError(true); } finally { setBusy(false); }
  }
  const character = assets?.characters.find(c => c.id === assets.active.active_character);
  const unknown = t('settings.current.unknown');
  return <section className="settings-section">
    <header className="settings-section__header"><h3>{t('settings.current.title')}</h3><button type="button" style={prefActionButtonStyle} onClick={() => void refresh()}>{t('settings.current.refresh')}</button></header>
    {error && <p role="alert">{t('settings.current.error')}</p>}
    <button type="button" onClick={() => void refresh()}>{t('settings.current.refresh')}</button>
    {!assets ? <p role="status">{error ? unknown : t('settings.current.loading')}</p> : <>
      <PrefRow label={t('settings.current.character')}>
        <select style={prefSelectStyle} value={assets.active.active_character} disabled={busy} onChange={e => void selectCharacter(e.target.value)}>
          {assets.characters.map(c => <option key={c.id} value={c.id}>{c.label || c.id}</option>)}
        </select>
      </PrefRow>
      <p className="settings-section__hint">{t('settings.current.readOnly')}</p>
      <PrefRow label={t('settings.current.source')}><span>{character?.binding_source === 'character' ? t('settings.current.bound') : character?.binding_source === 'global' || character?.model_routing === null ? t('settings.current.global') : character?.model_routing ? t('settings.current.bound') : unknown}</span></PrefRow>
      <PrefRow label={t('settings.current.profile')}><span>{character?.effective_profile || unknown}</span></PrefRow>
      <PrefRow label={t('settings.current.preset')}><span>{character?.resolved_chat_preset || unknown}</span></PrefRow>
      <PrefRow label={t('settings.current.model')}><span>{character?.resolved_chat_model || unknown}</span></PrefRow>
      <PrefRow label={t('settings.current.configuration')}><span>{character?.chat_configured === undefined ? unknown : character.chat_configured ? t('settings.current.configured') : t('settings.current.incomplete')}</span></PrefRow>
      <PrefRow label={t('settings.current.lorebooks')}><span>{assets.active.enabled_lorebooks.map(id => assets.lorebooks.find(item => item.id === id)?.label || id).join('、') || t('settings.current.none')}</span></PrefRow>
      <PrefRow label={t('settings.current.prompts')}><span>{assets.active.enabled_jailbreaks.map(id => assets.jailbreaks.find(item => item.id === id)?.label || id).join('、') || t('settings.current.none')}</span></PrefRow>
    </>}
  </section>;
}
