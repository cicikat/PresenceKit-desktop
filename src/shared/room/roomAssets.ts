import { invoke } from '@tauri-apps/api/core';

export interface RoomAsset {
  fileName: string;
  label: string;
}

export async function listRoomCharacters(): Promise<RoomAsset[]> {
  return invoke<RoomAsset[]>('list_room_assets', { kind: 'character' });
}

export async function listRoomScenes(): Promise<RoomAsset[]> {
  return invoke<RoomAsset[]>('list_room_assets', { kind: 'scene' });
}

export interface RoomPropCategory {
  category: string;
}

export interface RoomPropFile {
  file: string;
  label: string;
  category: string;
}

export async function listRoomPropCategories(): Promise<RoomPropCategory[]> {
  return invoke<RoomPropCategory[]>('list_room_props', {});
}

export async function listRoomPropFiles(category: string): Promise<RoomPropFile[]> {
  return invoke<RoomPropFile[]>('list_room_props', { category });
}
