// Look preset row (work order 5): pick a built-in or saved lights+grade bundle, save the
// current state as a new one, update or delete a saved one. Applying goes through the stage
// so the scene updates immediately even while the lights effect is paused for editing.
import { useState } from 'react';
import type { RoomSettings } from '../../shared/room/roomSettings';
import {
  BUILTIN_LOOKS, applyAndRemember, saveNewLook, updateLook, renameLook, deleteLook, setSceneLook, isBuiltinLookId,
} from '../../shared/room/lookPresets';
import type { ThreeCallStageHandle } from './ThreeCallStage';
import { useI18n } from '../../shared/i18n';

export function LookSection({ settings, stage }: { settings: RoomSettings; stage: ThreeCallStageHandle }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const selectedId = settings.lookByScene?.[settings.sceneFile] ?? '';
  const userLooks = Object.entries(settings.looks ?? {});
  const canEdit = selectedId !== '' && !isBuiltinLookId(selectedId) && !!settings.looks?.[selectedId];

  return (
    <div className="room-editor-panel__group room-editor-panel__looks">
      <div className="room-editor-panel__group-title">{t('room.editor.look.title')}</div>
      <div className="room-editor-panel__params room-editor-panel__params--flat">
        <select
          value={selectedId}
          onChange={e => {
            const id = e.target.value;
            if (id === '') stage.applyLookSettings(setSceneLook(settings, settings.sceneFile, null));
            else stage.applyLookSettings(applyAndRemember(settings, id));
          }}
        >
          <option value="">{t('room.editor.look.custom')}</option>
          <optgroup label={t('room.editor.look.builtinGroup')}>
            {Object.entries(BUILTIN_LOOKS).map(([id, look]) => (
              <option key={id} value={id}>{t(look.nameKey as never)}</option>
            ))}
          </optgroup>
          {userLooks.length > 0 && (
            <optgroup label={t('room.editor.look.userGroup')}>
              {userLooks.map(([id, look]) => <option key={id} value={id}>{look.name}</option>)}
            </optgroup>
          )}
        </select>
        <div className="room-editor-panel__add-row">
          <input
            type="text"
            className="room-editor-panel__text-input"
            value={name}
            placeholder={t('room.editor.look.namePlaceholder')}
            onChange={e => setName(e.target.value)}
          />
          <button
            type="button"
            className="room-editor-panel__tool-btn"
            disabled={!name.trim()}
            onClick={() => {
              stage.applyLookSettings(saveNewLook(settings, name, crypto.randomUUID()));
              setName('');
            }}
          >{t('room.editor.look.saveNew')}</button>
        </div>
        <div className="room-editor-panel__add-row">
          <button
            type="button"
            className="room-editor-panel__tool-btn"
            disabled={!canEdit}
            onClick={() => stage.applyLookSettings(updateLook(settings, selectedId))}
          >{t('room.editor.look.update')}</button>
          <button
            type="button"
            className="room-editor-panel__tool-btn"
            disabled={!canEdit || !name.trim()}
            onClick={() => { stage.applyLookSettings(renameLook(settings, selectedId, name)); setName(''); }}
          >{t('room.editor.look.rename')}</button>
          <button
            type="button"
            className="room-editor-panel__delete-btn"
            disabled={!canEdit}
            onClick={() => stage.applyLookSettings(deleteLook(settings, selectedId))}
          >{t('room.editor.delete')}</button>
        </div>
      </div>
    </div>
  );
}
