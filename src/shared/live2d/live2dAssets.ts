import { invoke } from '@tauri-apps/api/core';

export interface Live2DModelAsset {
  dirName: string;
  modelJson: string;
  label: string;
  /** moc3 format version (byte offset 4 of the .moc3 file); null if unreadable. v≥6 (Cubism
   * Editor 5.2+) may use offscreen-rendering parts that the current renderer doesn't draw —
   * see cc-tasks/31. */
  mocVersion: number | null;
}

export async function listLive2DModels(): Promise<Live2DModelAsset[]> {
  return invoke<Live2DModelAsset[]>('list_live2d_models');
}
