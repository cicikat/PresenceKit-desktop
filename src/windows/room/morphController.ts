import * as THREE from 'three';

export interface MorphTarget { mesh: THREE.Mesh; index: number; }

export class MorphController {
  private map = new Map<string, MorphTarget[]>();
  private current = new Map<string, number>();

  constructor(root: THREE.Object3D) {
    root.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      const dict = (mesh as any).morphTargetDictionary as Record<string, number> | undefined;
      if (mesh.isMesh && dict && mesh.morphTargetInfluences) {
        for (const [name, index] of Object.entries(dict)) {
          if (!this.map.has(name)) this.map.set(name, []);
          this.map.get(name)!.push({ mesh, index });
        }
      }
    });
  }

  has(name: string): boolean { return this.map.has(name); }
  names(): string[] { return [...this.map.keys()]; }

  set(name: string, value: number): void {
    const v = Math.max(0, Math.min(1, value));
    const targets = this.map.get(name);
    if (!targets) return;
    for (const t of targets) t.mesh.morphTargetInfluences![t.index] = v;
    this.current.set(name, v);
  }

  lerp(name: string, target: number, speed: number): void {
    if (!this.map.has(name)) return;
    const cur = this.current.get(name) ?? 0;
    this.set(name, cur + (Math.max(0, Math.min(1, target)) - cur) * speed);
  }
}
