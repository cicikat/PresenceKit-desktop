import type { RoutingProfileOption } from '../../../shared/api/characterModelRouting';

export interface GlobalRoutingDisplay {
  profile: string;
  chatPreset: string | null;
}

export function resolveGlobalRoutingDisplay(
  profiles: RoutingProfileOption[],
  activeRouting: string,
): GlobalRoutingDisplay {
  const profile = profiles.find(item => item.name === activeRouting);
  return {
    profile: activeRouting,
    chatPreset: profile?.categories.chat ?? null,
  };
}

export function isFollowingGlobal(modelRouting: string | null | undefined): boolean {
  return modelRouting == null;
}
