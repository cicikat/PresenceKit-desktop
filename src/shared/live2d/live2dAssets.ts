import { invoke } from '@tauri-apps/api/core';

export interface Live2DModelAsset {
  dirName: string;
  modelJson: string;
  label: string;
}

export async function listLive2DModels(): Promise<Live2DModelAsset[]> {
  return invoke<Live2DModelAsset[]>('list_live2d_models');
}
