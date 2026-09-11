import { useCallback, useEffect, useRef, useState } from 'react';
import type { StateEngine } from '../../../shared/state/store';
import { emitPetPrefs, emitPetTurn, getPetWindowState, publishPetSnapshot, setPetWindowVisible, startPetSnapshotResponder } from '../../../shared/pet/bridge';
import { loadPetMouseSettings, savePetMouseSettings, subscribePetMouseSettings, type PetMouseSettings } from '../../../shared/pet/mouseSettings';
import { loadPetVisualStyle, savePetVisualStyle, subscribePetVisualStyle, type PetVisualStyle } from '../../../shared/pet/petVisualStyle';
import { loadPetRoamSettings, savePetRoamSettings, subscribePetRoamSettings } from '../../../shared/pet/petRoamSettings';
import { loadPetRippleSettings, savePetRippleSettings, subscribePetRippleSettings } from '../../../shared/pet/petRippleSettings';
import { isPlayModeEnabled, setPlayModeEnabled } from '../../../shared/playMode';
import { getUIPref, setUIPref } from '../../../shared/uiPreferences';
import { wsClient } from '../../../shared/api/ws';
import { isSingleRealityMessage } from '../../../shared/api/realityMessageScope';
import { getActiveCharacterInfo } from '../../../shared/activeCharacter';

export function usePetController(engine: StateEngine, onToyOpen?: () => void) {
  const [petVisible, setPetVisible] = useState(false);
  const [petBusy, setPetBusy] = useState(false);
  const [petError, setPetError] = useState<string | null>(null);
  const petOperationRef = useRef<Promise<void> | null>(null);
  const petGenerationRef = useRef(0);
  const [petMouseSettings, setPetMouseSettings] = useState<PetMouseSettings>(() => loadPetMouseSettings());
  const [petVisualStyle, setPetVisualStyle] = useState<PetVisualStyle>(() => loadPetVisualStyle());
  const [model3dZoom, setModel3dZoom] = useState(() => getUIPref('pet.model3d.zoom', 1));
  const [live2dZoom, setLive2dZoom] = useState(() => getUIPref('pet.live2d.zoom', 1));
  const [playModeEnabled, setPlayModeEnabledState] = useState(() => isPlayModeEnabled());
  const [petRoamEnabled, setPetRoamEnabled] = useState(() => loadPetRoamSettings().enabled);
  const [petRippleEnabled, setPetRippleEnabled] = useState(() => loadPetRippleSettings().enabled);

  useEffect(() => subscribePetMouseSettings(setPetMouseSettings), []);
  useEffect(() => subscribePetVisualStyle(setPetVisualStyle), []);
  useEffect(() => subscribePetRoamSettings(settings => setPetRoamEnabled(settings.enabled)), []);
  useEffect(() => subscribePetRippleSettings(settings => setPetRippleEnabled(settings.enabled)), []);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        const status = await getPetWindowState();
        if (active) setPetVisible(status.visible);
      } catch {
        if (active) setPetVisible(false);
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), 2_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const publishEngineSnapshot = () => {
      const state = engine.get();
      publishPetSnapshot({ mood: state.mood, presence: state.presence });
    };
    publishEngineSnapshot();
    const unsubscribeEngine = engine.subscribe(publishEngineSnapshot);
    let unsubscribeResponder: (() => void) | undefined;
    startPetSnapshotResponder()
      .then(unsubscribe => { unsubscribeResponder = unsubscribe; })
      .catch(error => console.warn('[pet] ready 监听失败:', error));
    return () => {
      unsubscribeEngine();
      unsubscribeResponder?.();
    };
  }, [engine]);

  // Keep pet forwarding outside ChatPanel so its dedup/fallback guards cannot swallow a pet turn.
  useEffect(() => {
    const offs = [
      wsClient.on('channel_message', payload => {
        if (isSingleRealityMessage(payload, getActiveCharacterInfo().id)) void emitPetTurn({ kind: 'channel_message', ...payload });
      }),
      wsClient.on('message_segments', payload => { void emitPetTurn({ kind: 'message_segments', ...payload }); }),
      wsClient.on('message_stream_start', payload => { void emitPetTurn({ kind: 'message_stream_start', ...payload }); }),
      wsClient.on('message_stream_delta', payload => { void emitPetTurn({ kind: 'message_stream_delta', ...payload }); }),
      wsClient.on('message_stream_end', payload => { void emitPetTurn({ kind: 'message_stream_end', ...payload }); }),
    ];
    return () => offs.forEach(off => off());
  }, []);

  useEffect(() => wsClient.on('toy_invite', () => {
    if (isPlayModeEnabled()) onToyOpen?.();
  }), [onToyOpen]);

  const setPetVisibility = useCallback((next: boolean) => {
    if (petOperationRef.current) return petOperationRef.current;
    const generation = ++petGenerationRef.current;
    setPetBusy(true);
    setPetError(null);
    const operation = (async () => {
      try {
        const status = await setPetWindowVisible(next);
        if (generation !== petGenerationRef.current) return;
        setPetVisible(status.visible);
        engine.setMode(status.visible ? 'companion' : 'chat-only');
      } catch (error) {
        if (generation !== petGenerationRef.current) return;
        setPetVisible(false);
        setPetError(error instanceof Error ? error.message : String(error));
      } finally {
        if (generation === petGenerationRef.current) setPetBusy(false);
        petOperationRef.current = null;
      }
    })();
    petOperationRef.current = operation;
    return operation;
  }, [engine]);

  const togglePet = useCallback(() => setPetVisibility(!petVisible), [petVisible, setPetVisibility]);
  const retryPet = useCallback(() => setPetVisibility(true), [setPetVisibility]);

  const updatePetMouseSettings = useCallback((patch: Partial<PetMouseSettings>) => {
    setPetMouseSettings(savePetMouseSettings(patch));
  }, []);

  const updatePetVisualStyle = useCallback((style: PetVisualStyle) => {
    setPetVisualStyle(savePetVisualStyle(style));
  }, []);

  const updateModel3dZoom = useCallback((zoom: number) => {
    const clamped = Math.max(0.3, Math.min(4, zoom));
    setModel3dZoom(clamped);
    setUIPref('pet.model3d.zoom', clamped);
    void emitPetPrefs({ model3dZoom: clamped });
  }, []);

  const updateLive2dZoom = useCallback((zoom: number) => {
    const clamped = Math.max(0.3, Math.min(4, zoom));
    setLive2dZoom(clamped);
    setUIPref('pet.live2d.zoom', clamped);
    void emitPetPrefs({ live2dZoom: clamped });
  }, []);

  const togglePlayMode = useCallback(() => {
    const next = !playModeEnabled;
    setPlayModeEnabled(next);
    setPlayModeEnabledState(next);
  }, [playModeEnabled]);

  const togglePetRoam = useCallback(() => savePetRoamSettings({ enabled: !petRoamEnabled }), [petRoamEnabled]);
  const togglePetRipple = useCallback(() => savePetRippleSettings({ enabled: !petRippleEnabled }), [petRippleEnabled]);

  return {
    petVisible, petBusy, petError, petMouseSettings, petVisualStyle, model3dZoom, live2dZoom, playModeEnabled,
    petRoamEnabled, petRippleEnabled, togglePet, updatePetMouseSettings, updatePetVisualStyle,
    updateModel3dZoom, updateLive2dZoom, togglePlayMode, togglePetRoam, togglePetRipple, retryPet,
  };
}
