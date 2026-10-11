import { useEffect, useState } from 'react';
import { getActiveMotionLibrary, subscribeMotionLibrary } from '../../shared/character/motionLibrary';
import { useI18n } from '../../shared/i18n';
import type { MessageKey } from '../../shared/i18n/locales/zh-CN';

const LABELS: Record<string, MessageKey> = {
  idle: 'room.motion.idle', arms_crossed: 'room.motion.armsCrossed', talking: 'room.motion.talking',
  nod: 'room.motion.nod', head_shake: 'room.motion.headShake', relaxed_lean: 'room.motion.rail',
};

export function MotionPreview() {
  const { t } = useI18n();
  const [, refresh] = useState(0);
  const [selected, select] = useState('arms_crossed');
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const library = getActiveMotionLibrary();
  useEffect(() => subscribeMotionLibrary(() => { refresh(n => n + 1); setPaused(false); }), []);
  useEffect(() => () => getActiveMotionLibrary()?.resumePresentation(), []);
  const ids = library?.ids() ?? [];
  const id = ids.includes(selected) ? selected : ids[0] ?? '';
  return <div className="room-editor-panel__params">
    <div className="room-editor-panel__group-title">{t('room.motion.title')}</div>
    <select aria-label={t('room.motion.title')} value={id} onChange={e => select(e.target.value)} disabled={!ids.length}>
      {ids.map(value => <option key={value} value={value}>{LABELS[value] ? t(LABELS[value]) : value}</option>)}
    </select>
    <div className="room-editor-panel__toolbar">
      <button className="room-editor-panel__tool-btn" disabled={!id} onClick={() => { setFailed(!library?.preview(id)); setPaused(false); refresh(n => n + 1); }}>{t('room.motion.play')}</button>
      <button className="room-editor-panel__tool-btn" disabled={!library?.player.playingId} onClick={() => { library?.player.setPaused(!paused); setPaused(library?.player.paused ?? false); refresh(n => n + 1); }}>{t(paused ? 'room.motion.resume' : 'room.motion.pause')}</button>
      <button className="room-editor-panel__tool-btn" onClick={() => { library?.resumePresentation(); setPaused(false); setFailed(false); refresh(n => n + 1); }}>{t('room.motion.idle')}</button>
    </div>
    {(!ids.length || failed) && <div className="room-editor-panel__hint" role="status">{t('room.motion.unavailable')}</div>}
  </div>;
}
