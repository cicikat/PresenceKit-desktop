import { invoke } from '@tauri-apps/api/core';
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { parseMaterialsConfig, type MaterialsConfig } from '../character/materialsConfig';
import { parseExpressionsConfig, type ExpressionsConfig } from '../character/expressionsConfig';
import { parseMotionsConfig, type MotionsConfig } from '../character/motionConfig';

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

/** CA-06 sidecar `<model>.materials.json`; null when the character has none or it fails validation. */
export async function loadCharacterMaterials(fileName: string): Promise<MaterialsConfig | null> {
  try {
    const text = await invoke<string | null>('read_room_material_config', { fileName });
    if (!text) return null;
    const result = parseMaterialsConfig(JSON.parse(text));
    if (result.ok === true) return result.config;
    console.warn('[materials] invalid config, using model materials:', (result as { errors: string[] }).errors);
    return null;
  } catch (error) {
    console.warn('[materials] config unavailable, using model materials:', error);
    return null;
  }
}

/** Sidecar PNG maps named by the config (shade/transition), decoded once per name; missing ones are skipped. */
export async function loadCharacterToonTextures(
  fileName: string, config: MaterialsConfig,
): Promise<Record<string, THREE.Texture>> {
  const names = new Set<string>();
  for (const binding of config.bindings) {
    if (binding.params.shadeMap) names.add(binding.params.shadeMap);
    if (binding.params.transitionMap) names.add(binding.params.transitionMap);
  }
  for (const look of Object.values(config.looks)) {
    for (const p of Object.values(look)) {
      if (p.shadeMap) names.add(p.shadeMap);
      if (p.transitionMap) names.add(p.transitionMap);
    }
  }
  const out: Record<string, THREE.Texture> = {};
  const loader = new THREE.TextureLoader();
  await Promise.all([...names].map(async (mapName) => {
    try {
      const url = await invoke<string | null>('read_room_material_map', { fileName, mapName });
      if (!url) return;
      const texture = await loader.loadAsync(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false; // match glTF texture orientation so the maps line up with the base map
      out[mapName] = texture;
    } catch (error) {
      console.warn(`[materials] map ${mapName} unavailable:`, error);
    }
  }));
  return out;
}

/** CA-04 sidecar `<model>.expressions.json`; null when absent or invalid (the model's own key names stay in use). */
export async function loadCharacterExpressions(fileName: string): Promise<ExpressionsConfig | null> {
  try {
    const text = await invoke<string | null>('read_room_expression_config', { fileName });
    if (!text) return null;
    const result = parseExpressionsConfig(JSON.parse(text));
    if (result.ok === true) return result.config;
    console.warn('[expressions] invalid config, using model key names:', (result as { errors: string[] }).errors);
    return null;
  } catch (error) {
    console.warn('[expressions] config unavailable, using model key names:', error);
    return null;
  }
}

/** CA-05 sidecar `<model>.motions.json`; null when absent or invalid. */
export async function loadCharacterMotions(fileName: string): Promise<MotionsConfig | null> {
  try {
    const text = await invoke<string | null>('read_room_motion_config', { fileName });
    if (!text) return null;
    const result = parseMotionsConfig(JSON.parse(text));
    if (result.ok === true) return result.config;
    console.warn('[motions] invalid config, no motions loaded:', (result as { errors: string[] }).errors);
    return null;
  } catch (error) {
    console.warn('[motions] config unavailable, no motions loaded:', error);
    return null;
  }
}

/** Data URL of `motions/<name>.glb`, or null when it does not exist. */
export const loadMotionFileUrl = (motionName: string): Promise<string | null> =>
  invoke<string | null>('read_room_motion_file', { motionName });
