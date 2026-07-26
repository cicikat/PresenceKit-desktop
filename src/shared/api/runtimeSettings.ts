import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

export interface ModelRoutingProfile {
  name: string;
  chat_preset: string;
  provider_kind: string;
  model: string;
  tool_call_mode: string;
}

export interface ModelRoutingSettings {
  active_routing: string;
  profiles: ModelRoutingProfile[];
  is_legacy_synth: boolean;
}

export interface SynthesizedVoice {
  audio_b64: string;
  mime: string;
}

export interface TtsAutoPlaySettings {
  chat: boolean;
  dream: boolean;
  video_call: boolean;
  desktop_pet: boolean;
  mobile: boolean;
}

export function getModelRouting(): Promise<ModelRoutingSettings> {
  return invoke<ModelRoutingSettings>('get_model_routing');
}

export function setModelRouting(activeRouting: string): Promise<void> {
  return invoke('set_model_routing', { activeRouting });
}

export function getDesktopTtsEnabled(): Promise<boolean> {
  return invoke<{ enabled: boolean }>('get_desktop_tts').then(result => result.enabled);
}

export async function setDesktopTtsEnabled(enabled: boolean): Promise<void> {
  await invoke('set_desktop_tts', { enabled });
  window.dispatchEvent(new CustomEvent('desktop-tts-settings', { detail: { enabled } }));
  await emit('desktop-tts-settings', { enabled });
}

export function getTtsAutoPlay(): Promise<TtsAutoPlaySettings> {
  return invoke<TtsAutoPlaySettings>('get_tts_auto_play');
}

export async function setTtsAutoPlay(patch: Partial<TtsAutoPlaySettings>): Promise<TtsAutoPlaySettings> {
  const settings = await invoke<TtsAutoPlaySettings>('set_tts_auto_play', {
    chat: patch.chat,
    dream: patch.dream,
    videoCall: patch.video_call,
    desktopPet: patch.desktop_pet,
    mobile: patch.mobile,
  });
  window.dispatchEvent(new CustomEvent('tts-auto-play-settings', { detail: settings }));
  await emit('tts-auto-play-settings', settings);
  return settings;
}

export function synthesizeDesktopVoice(text: string, emotion = 'neutral', scene = 'desktop_pet'): Promise<SynthesizedVoice> {
  return invoke<SynthesizedVoice>('synthesize_desktop_voice', { text, emotion, scene });
}

export function waterGarden(): Promise<unknown> {
  return invoke('water_garden');
}
