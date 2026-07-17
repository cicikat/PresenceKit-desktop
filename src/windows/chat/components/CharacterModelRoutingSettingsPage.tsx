import { useEffect, useState } from 'react';
import { getPromptAssets } from '../../../shared/api/backend';
import type { PromptAssetCharacter } from '../../../shared/api/types';
import {
  listRoutingProfiles,
  setCharacterModelRouting,
  type CharacterModelRoutingInfo,
  type RoutingProfileOption,
} from '../../../shared/api/characterModelRouting';
import { useI18n } from '../../../shared/i18n';

const DEFAULT_VALUE = '';

const selectStyle = {
  width: 200, padding: '6px 9px', border: '1px solid var(--paper-edge)',
  borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)', color: 'var(--ink-2)',
  fontFamily: 'inherit', fontSize: 11,
} as const;

function isNotFound(error: unknown): boolean {
  return String(error).includes('404');
}

function isUnprocessable(error: unknown): boolean {
  return String(error).includes('422');
}

function routingOf(character: PromptAssetCharacter): CharacterModelRoutingInfo | null {
  if (character.resolved_chat_preset === undefined) return null;
  return {
    model_routing: character.model_routing ?? null,
    effective_profile: character.effective_profile ?? '',
    resolved_chat_preset: character.resolved_chat_preset,
  };
}

export function CharacterModelRoutingSettingsPage() {
  const { t } = useI18n();
  const [unsupported, setUnsupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<RoutingProfileOption[]>([]);
  const [characters, setCharacters] = useState<PromptAssetCharacter[]>([]);
  const [routing, setRouting] = useState<Record<string, CharacterModelRoutingInfo | null>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [profilesResp, assets] = await Promise.all([listRoutingProfiles(), getPromptAssets()]);
        if (!mounted) return;
        setProfiles(profilesResp.profiles);
        setCharacters(assets.characters);
        setRouting(Object.fromEntries(assets.characters.map(character => [character.id, routingOf(character)])));
      } catch (error) {
        if (!mounted) return;
        if (isNotFound(error)) {
          setUnsupported(true);
        } else {
          setLoadError(`${t('settings.characterModelRouting.loadFailed')}：${String(error)}`);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [t]);

  async function handleChange(charId: string, value: string) {
    if (savingId) return;
    setSavingId(charId);
    setErrorById(prev => ({ ...prev, [charId]: null }));
    try {
      const info = await setCharacterModelRouting(charId, value === DEFAULT_VALUE ? null : value);
      setRouting(prev => ({ ...prev, [charId]: info }));
    } catch (error) {
      const message = isUnprocessable(error)
        ? t('settings.characterModelRouting.invalidProfile')
        : `${t('settings.characterModelRouting.saveFailed')}：${String(error)}`;
      setErrorById(prev => ({ ...prev, [charId]: message }));
    } finally {
      setSavingId(null);
    }
  }

  if (unsupported) return null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
          {t('settings.characterModelRouting.title')}
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          {t('settings.characterModelRouting.description')}
        </div>
      </div>
      {loading ? (
        <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
          {t('settings.characterModelRouting.loading')}
        </div>
      ) : loadError ? (
        <div className="mono" style={{ color: 'var(--danger)', fontSize: 10.5 }}>{loadError}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {characters.map(character => {
            const info = routing[character.id];
            return (
              <div key={character.id} style={{ display: 'grid', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 90, fontSize: 12.5, color: 'var(--ink-2)' }}>{character.label}</div>
                  <select
                    value={info?.model_routing ?? DEFAULT_VALUE}
                    disabled={savingId === character.id}
                    onChange={event => void handleChange(character.id, event.target.value)}
                    style={selectStyle}
                  >
                    <option value={DEFAULT_VALUE}>{t('settings.characterModelRouting.defaultOption')}</option>
                    {profiles.map(profile => (
                      <option key={profile.name} value={profile.name}>{profile.name}</option>
                    ))}
                  </select>
                  {info && (
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>
                      {t('settings.characterModelRouting.resolvedLabel')} · {info.resolved_chat_preset}
                    </span>
                  )}
                </div>
                {errorById[character.id] && (
                  <div className="mono" style={{ fontSize: 10, color: 'var(--danger)' }}>{errorById[character.id]}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
        {t('settings.characterModelRouting.groupHint')}
      </div>
    </div>
  );
}
