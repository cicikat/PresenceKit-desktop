import { useEffect, useState, useSyncExternalStore } from 'react';
import { useI18n } from '../../shared/i18n';
import { getStageControls, subscribeStageControls } from '../../shared/live2d/stageControls';

/** Artistic preview of this window's loaded asset. No synthetic backend state. */
export function Live2DPerformancePanel() {
  const { t } = useI18n();
  const controls = useSyncExternalStore(subscribeStageControls, getStageControls, () => null);
  const [expression, setExpression] = useState('');
  const [motion, setMotion] = useState('');
  useEffect(() => { setExpression(''); setMotion(''); }, [controls]);
  useEffect(() => () => controls?.stop(), [controls]);
  const actionLabel = (name: string) => {
    switch (name) {
      case 'nod': return t('live2d.performance.nod');
      case 'shake': return t('live2d.performance.shake');
      case 'lean_in': return t('live2d.performance.leanIn');
      case 'lean_back': return t('live2d.performance.leanBack');
      case 'speaking': return t('live2d.performance.speaking');
      default: return name;
    }
  };
  return <div className="room-editor-panel__group">
    <div className="room-editor-panel__group-title">{t('live2d.performance.title')}</div>
    <div className="room-editor-panel__params room-editor-panel__params--flat">
      {!controls ? <div className="room-editor-panel__hint">{t('live2d.performance.waiting')}</div> : <>
        <div className="room-editor-panel__hint">{controls.model}</div>
        <label>{t('live2d.performance.expression')}
          <select aria-label={t('live2d.performance.expression')} value={expression} onChange={event => {
            setExpression(event.target.value);
            controls.playExpression(event.target.value || null);
          }}>
            <option value="">{t('live2d.performance.follow')}</option>
            {controls.expressions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>{t('live2d.performance.motion')}
          <select aria-label={t('live2d.performance.motion')} value={motion} onChange={event => setMotion(event.target.value)}>
            <option value="">{t('live2d.performance.choose')}</option>
            {controls.motions.map(file => <option key={file} value={file}>{file}</option>)}
          </select>
        </label>
        <div className="room-editor-panel__toolbar">
          <button className="room-editor-panel__tool-btn" type="button" disabled={!motion} onClick={() => controls.playMotion(motion)}>{t('live2d.performance.play')}</button>
          <button className="room-editor-panel__tool-btn" type="button" onClick={() => { controls.stop(); setExpression(''); setMotion(''); }}>{t('live2d.performance.stop')}</button>
        </div>
        {controls.actions.length > 0 && <>
          <div className="room-editor-panel__hint">{t('live2d.performance.actions')}</div>
          <div className="room-editor-panel__toolbar" style={{ flexWrap: 'wrap' }}>
            {controls.actions.map(name => <button className="room-editor-panel__tool-btn" style={{ flex: '1 0 40%' }} type="button" key={name} onClick={() => controls.playAction(name)}>{actionLabel(name)}</button>)}
          </div>
        </>}
        <div className="room-editor-panel__hint">{t('live2d.performance.hint')}</div>
      </>}
    </div>
  </div>;
}
