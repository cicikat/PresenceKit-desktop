import { invoke } from '@tauri-apps/api/core';

export interface AvatarConfig {
  her: { path: string | null; dataUrl: string | null };
  you: { path: string | null; dataUrl: string | null; visible: boolean };
}

interface AvatarsJson {
  her?: { path: string } | null;
  you?: { path: string | null; visible: boolean } | null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

class AvatarStore {
  private config: AvatarConfig = {
    her: { path: null, dataUrl: null },
    you: { path: null, dataUrl: null, visible: false },
  };
  private listeners = new Set<(c: AvatarConfig) => void>();

  get(): AvatarConfig {
    return this.config;
  }

  subscribe(fn: (c: AvatarConfig) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snap: AvatarConfig = {
      her: { ...this.config.her },
      you: { ...this.config.you },
    };
    this.listeners.forEach(fn => fn(snap));
  }

  async init(): Promise<void> {
    try {
      const json = await invoke<string>('read_avatars_json');
      const data: AvatarsJson = JSON.parse(json);
      if (data.her?.path) {
        try {
          const dataUrl = await invoke<string>('load_avatar', { path: data.her.path });
          this.config.her = { path: data.her.path, dataUrl };
        } catch {}
      }
      if (data.you?.path) {
        try {
          const dataUrl = await invoke<string>('load_avatar', { path: data.you.path });
          this.config.you = { path: data.you.path, dataUrl, visible: data.you.visible ?? false };
        } catch {}
      }
    } catch {}
    this.emit();
  }

  async setAvatar(role: 'her' | 'you', blob: Blob): Promise<void> {
    const b64 = await blobToBase64(blob);
    const dataUrl = `data:image/png;base64,${b64}`;
    const path = await invoke<string>('save_avatar', { role, imageB64: b64 });
    if (role === 'her') {
      this.config.her = { path, dataUrl };
    } else {
      this.config.you = { ...this.config.you, path, dataUrl };
    }
    await this.saveJson();
    this.emit();
  }

  async setYouVisible(visible: boolean): Promise<void> {
    this.config.you = { ...this.config.you, visible };
    await this.saveJson();
    this.emit();
  }

  private async saveJson(): Promise<void> {
    const data: AvatarsJson = {
      her: this.config.her.path ? { path: this.config.her.path } : null,
      you: { path: this.config.you.path, visible: this.config.you.visible },
    };
    await invoke('write_avatars_json', { json: JSON.stringify(data) });
  }
}

export const avatarStore = new AvatarStore();
