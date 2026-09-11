import { useEffect, useRef, useState } from 'react';
import { getCharacterAvatar, uploadCharacterAvatar } from '../../../../shared/api/backend';
import { getActiveCharacterInfo, notifyCharacterAvatarChanged, subscribeActiveCharacter } from '../../../../shared/activeCharacter';
import { useI18n } from '../../../../shared/i18n';
import { AvatarCropper } from '../AvatarCropper';
import { prefActionButtonStyle } from './PrefAtoms';

export function CurrentCharacterAvatar() {
  const { t } = useI18n();
  const [character, setCharacter] = useState(getActiveCharacterInfo);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ url: string; id: string } | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  useEffect(() => subscribeActiveCharacter(() => setCharacter(getActiveCharacterInfo())), []);
  useEffect(() => {
    let stale = false;
    setAvatar(null); setError(false);
    if (character.id) void getCharacterAvatar(character.id).then(value => {
      if (!stale) setAvatar(value);
    }).catch(() => { if (!stale) setError(true); });
    return () => { stale = true; };
  }, [character.id, character.avatarRevision, revision]);
  useEffect(() => { setCrop(null); }, [character.id]);
  useEffect(() => () => { if (crop) URL.revokeObjectURL(crop.url); }, [crop]);
  async function save(blob: Blob) {
    if (!crop || saving.current || crop.id !== getActiveCharacterInfo().id) return;
    saving.current = true; setBusy(true); setError(false);
    try {
      await uploadCharacterAvatar(crop.id, new File([blob], 'avatar.png', { type: 'image/png' }));
      notifyCharacterAvatarChanged(crop.id);
      setCrop(null); setRevision(value => value + 1);
    } catch { setError(true); }
    finally { saving.current = false; setBusy(false); }
  }
  return <>
    <div className="settings-avatar">
      <div className="settings-avatar__preview">{avatar ? <img src={avatar} alt={t('settings.avatar.title')} /> : <span>{character.name?.slice(0, 1) || '◇'}</span>}</div>
      <div className="settings-avatar__copy"><strong>{t('settings.avatar.title')}</strong><p>{t('settings.avatar.hint')}</p></div>
      <button style={prefActionButtonStyle} disabled={!character.id || busy} onClick={() => input.current?.click()}>{t(busy ? 'settings.avatar.saving' : 'settings.avatar.change')}</button>
      <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError(true); return; }
        setError(false); setCrop({ url: URL.createObjectURL(file), id: character.id });
      }} />
    </div>
    {error && !crop && <p role="alert" className="settings-section__hint">{t('settings.avatar.error')} <button style={prefActionButtonStyle} onClick={() => setRevision(value => value + 1)}>{t('settings.current.refresh')}</button></p>}
    {crop && <AvatarCropper imageSrc={crop.url} error={error ? t('settings.avatar.error') : null} onConfirm={save} onCancel={() => { if (!saving.current) setCrop(null); }} />}
  </>;
}
