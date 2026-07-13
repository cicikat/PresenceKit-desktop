import { invoke } from '@tauri-apps/api/core';

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
}

export function synthesizeDesktopVoice(text: string, emotion = 'neutral'): Promise<SynthesizedVoice> {
  return invoke<SynthesizedVoice>('synthesize_desktop_voice', { text, emotion });
}

export function waterGarden(): Promise<unknown> {
  return invoke('water_garden');
}
