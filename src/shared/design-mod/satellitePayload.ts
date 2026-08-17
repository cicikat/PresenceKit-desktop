export interface SatellitePayloadKey {
  generation: number;
  modId: string;
  sequence: number;
}

export function canReuseSatellitePayload(current: SatellitePayloadKey | null, next: SatellitePayloadKey): boolean {
  return current !== null
    && current.generation === next.generation
    && current.modId === next.modId
    && current.sequence === next.sequence;
}
