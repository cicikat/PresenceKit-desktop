import { invoke } from '@tauri-apps/api/core';

export interface RoutingProfileOption {
  name: string;
  categories: Record<string, string>;
}

export interface RoutingProfilesList {
  active_routing: string;
  profiles: RoutingProfileOption[];
}

export interface CharacterModelRoutingInfo {
  model_routing: string | null;
  effective_profile: string;
  resolved_chat_preset: string;
}

export function listRoutingProfiles(): Promise<RoutingProfilesList> {
  return invoke<RoutingProfilesList>('list_routing_profiles');
}

export function setCharacterModelRouting(charId: string, modelRouting: string | null): Promise<CharacterModelRoutingInfo> {
  return invoke<CharacterModelRoutingInfo>('set_character_model_routing', { charId, modelRouting });
}
