import { useEffect, useRef, useState } from 'react';
import { previewChatImage } from '../../../shared/api/chatArtifacts';
import type { ChatArtifactPayload } from '../../../shared/api/types';
import { useI18n } from '../../../shared/i18n';

/** Images are fetched by authenticated IPC, never by a URL containing a token. */
export function GeneratedImage({ artifact }: { artifact: ChatArtifactPayload }) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [source, setSource] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries.some(e => e.isIntersecting)), { rootMargin: '160px' });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const active = visible || expanded;
  useEffect(() => {
    let cancelled = false;
    setSource(undefined); setFailed(false);
    if (active) {
      previewChatImage(artifact.id).then(data => { if (!cancelled) setSource(data); }, () => { if (!cancelled) setFailed(true); });
    }
    return () => { cancelled = true; };
  }, [artifact.id, active, attempt]);
  useEffect(() => {
    if (!expanded) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [expanded]);
  return <div ref={root} style={{ width: '100%', minHeight: 48 }}>
    {source && <button type="button" aria-label={t('chat.artifacts.preview')} onClick={() => setExpanded(true)} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'zoom-in', maxWidth: '100%' }}>
      <img src={source} alt={artifact.filename} onError={() => { setFailed(true); setSource(undefined); }} style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 6, display: 'block' }} />
    </button>}
    {!source && !failed && <span role="status">{t('chat.artifacts.imageLoading')}</span>}
    {failed && <button type="button" onClick={() => setAttempt(a => a + 1)}>{t('chat.artifacts.imageRetry')}</button>}
    {expanded && <div role="dialog" aria-modal="true" aria-label={artifact.filename} onClick={() => setExpanded(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button type="button" autoFocus onClick={() => setExpanded(false)} style={{ position: 'absolute', top: 20, right: 20 }}>{t('chat.artifacts.close')}</button>
      {source && <img src={source} alt={artifact.filename} style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain' }} />}
    </div>}
  </div>;
}
