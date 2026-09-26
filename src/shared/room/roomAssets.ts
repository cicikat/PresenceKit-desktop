import { invoke } from '@tauri-apps/api/core';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

export function roomAssetsLocation(): Promise<string> {
  return invoke<string>('room_assets_location');
}

export async function roomModelUrl(kind: 'character' | 'scene', fileName: string): Promise<string> {
  return invoke<string>('read_room_asset', { kind, fileName });
}

export function loadRoomModel(
  loader: GLTFLoader,
  kind: 'character' | 'scene',
  fileName: string,
  onLoad: Parameters<GLTFLoader['load']>[1],
  onProgress?: Parameters<GLTFLoader['load']>[2],
  onError?: Parameters<GLTFLoader['load']>[3],
): void {
  void roomModelUrl(kind, fileName)
    .then(url => loader.load(url, onLoad, onProgress, onError))
    .catch(error => onError?.(error));
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
