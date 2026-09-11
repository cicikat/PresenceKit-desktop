import type { CSSProperties } from 'react';
import { useI18n } from '../i18n';

/** A scoped miniature: editing the inactive day/night slot never changes its colors. */
export function AppearancePreview({ tokens, dream = false }: { tokens: Record<string, string>; dream?: boolean }) {
  const { t } = useI18n();
  const bg = dream ? 'var(--dt-bg-1)' : 'var(--paper)';
  const surface = dream ? 'var(--dt-bg-2)' : 'var(--paper-2)';
  const ink = dream ? 'var(--dt-ink)' : 'var(--ink)';
  const accent = dream ? 'var(--dt-flower-dandelion)' : 'var(--forest)';
  return <figure aria-label={t('appearance.preview.title')} style={{ ...tokens, margin: '12px 0', border: '1px solid var(--paper-edge)', borderRadius: 12, overflow: 'hidden', background: bg, color: ink } as CSSProperties}>
    <figcaption style={{ padding: '8px 12px', fontSize: 11 }}>{t('appearance.preview.title')}</figcaption>
    <div style={{ display: 'flex', minHeight: 180, borderTop: '1px solid var(--paper-edge)' }}>
      <div aria-hidden="true" style={{ width: 30, background: accent, display: 'grid', alignContent: 'start', justifyContent: 'center', gap: 12, paddingTop: 14 }}>
        {[0, 1, 2, 3].map(i => <span key={i} style={{ width: 10, height: 10, borderRadius: 3, background: dream ? ink : 'var(--on-forest)', opacity: i ? 0.5 : 1 }} />)}
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: 14, display: 'grid', gap: 12, fontSize: 12 }}>
        <div style={{ background: surface, padding: '10px 12px', borderRadius: '3px 12px 12px 12px', justifySelf: 'start' }}>{t('appearance.preview.message')}</div>
        <div style={{ background: dream ? 'var(--dt-bg-3)' : ink, color: dream ? ink : bg, padding: '10px 12px', borderRadius: '12px 3px 12px 12px', justifySelf: 'end' }}>{t('appearance.preview.reply')}</div>
        <div style={{ borderTop: `1px solid ${accent}`, paddingTop: 10, color: dream ? 'var(--dt-ink-3)' : 'var(--ink-3)' }}>{t('appearance.preview.input')} <span style={{ float: 'right', color: dream ? 'var(--dt-accent-violet)' : 'var(--accent)' }}>➤</span></div>
      </div>
    </div>
  </figure>;
}
