import * as THREE from 'three';
import type { ExpressionsConfig } from '../../shared/character/expressionsConfig';

export interface MorphTarget { mesh: THREE.Mesh; index: number; /** Multiplier from an expression mapping. */ weight?: number }

export interface MappingReport {
  applied: string[];
  /** Semantic names whose every target was missing; they keep their same-name keys (or stay unavailable). */
  unresolved: string[];
  /** Individual `mesh/key` references that did not exist on the model. */
  missingTargets: string[];
}

export class MorphController {
  private map = new Map<string, MorphTarget[]>();
  private current = new Map<string, number>();
  private readonly meshes: THREE.Mesh[] = [];

  constructor(root: THREE.Object3D) {
    root.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      const dict = (mesh as any).morphTargetDictionary as Record<string, number> | undefined;
      if (mesh.isMesh && dict && mesh.morphTargetInfluences) {
        this.meshes.push(mesh);
        for (const [name, index] of Object.entries(dict)) {
          if (!this.map.has(name)) this.map.set(name, []);
          this.map.get(name)!.push({ mesh, index });
        }
      }
    });
  }

  has(name: string): boolean { return this.map.has(name); }
  names(): string[] { return [...this.map.keys()]; }

  /**
   * Route semantic names onto weighted, optionally mesh-scoped keys. A semantic name replaces its
   * same-name binding only when at least one target resolves; zero influence is restored for the
   * keys it displaces so nothing stays stuck from the old binding.
   */
  applyMapping(config: ExpressionsConfig): MappingReport {
    const report: MappingReport = { applied: [], unresolved: [], missingTargets: [] };
    for (const [semantic, wanted] of Object.entries(config.expressions)) {
      const resolved: MorphTarget[] = [];
      for (const t of wanted) {
        const hits = this.meshes.filter((m) => (!t.mesh || m.name === t.mesh) && m.morphTargetDictionary && t.key in m.morphTargetDictionary);
        if (hits.length === 0) { report.missingTargets.push(`${t.mesh ?? '*'}/${t.key}`); continue; }
        for (const mesh of hits) resolved.push({ mesh, index: mesh.morphTargetDictionary![t.key], weight: t.weight });
      }
      if (resolved.length === 0) { report.unresolved.push(semantic); continue; }
      for (const old of this.map.get(semantic) ?? []) old.mesh.morphTargetInfluences![old.index] = 0;
      this.map.set(semantic, resolved);
      this.current.delete(semantic);
      report.applied.push(semantic);
    }
    return report;
  }

  /** Zero every influence this controller can reach, e.g. before the model is replaced or a config is cleared. */
  resetAll(): void {
    for (const targets of this.map.values()) for (const t of targets) t.mesh.morphTargetInfluences![t.index] = 0;
    this.current.clear();
  }

  set(name: string, value: number): void {
    const v = Math.max(0, Math.min(1, value));
    const targets = this.map.get(name);
    if (!targets) return;
    for (const t of targets) t.mesh.morphTargetInfluences![t.index] = Math.min(1, v * (t.weight ?? 1));
    this.current.set(name, v);
  }

  lerp(name: string, target: number, speed: number): void {
    if (!this.map.has(name)) return;
    const cur = this.current.get(name) ?? 0;
    this.set(name, cur + (Math.max(0, Math.min(1, target)) - cur) * speed);
  }
}
