import { invoke } from '@tauri-apps/api/core';

export type FileAgentMode = 'enabled' | 'paused' | 'disabled';

export interface FileAgentStatus {
  state: FileAgentMode;
  online: boolean;
  grants: { id: string; alias: string; write: boolean }[];
  recent: { id: string; task_id: string; path: string; diff: string; sha256: string;
    status: string; synced: boolean; undoable: boolean }[];
  action: [string, string] | null;
}

export const deviceFileAgent = {
  status: () => invoke<FileAgentStatus>('device_file_status'),
  mode: (mode: FileAgentMode) => invoke<void>('device_file_mode', { mode }),
  pick: (single: boolean, write: boolean) => invoke<void>('device_file_pick', { single, write }),
  grant: (id: string, write: boolean | null) => invoke<void>('device_file_grant', { id, write }),
  undo: (id: string) => invoke<void>('device_file_undo_local', { id }),
  clear: () => invoke<void>('device_file_clear'),
};
