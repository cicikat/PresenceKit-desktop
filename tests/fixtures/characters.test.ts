import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cases = [
  { file: 'plain.glb', bones: 0, morphs: 0, clips: 0 },
  { file: 'morph-only.glb', bones: 0, morphs: 1, clips: 0 },
  { file: 'full-standard.glb', bones: 21, morphs: 1, clips: 1 },
  { file: 'full-alternate.glb', bones: 21, morphs: 0, clips: 1 },
  { file: 'morph-no-eye-bones.glb', bones: 19, morphs: 1, clips: 1 },
  { file: 'half-no-eyes.glb', bones: 13, morphs: 0, clips: 1 },
];

describe('anonymous character baseline assets', () => {
  for (const item of cases) {
    it(`${item.file} parses with the expected capabilities`, async () => {
      const bytes = await readFile(new URL(`./characters/${item.file}`, import.meta.url));
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await new GLTFLoader().parseAsync(data, '');
      let bones = 0;
      let morphs = 0;
      gltf.scene.traverse(object => {
        if (object.type === 'Bone') bones++;
        if ('morphTargetDictionary' in object && object.morphTargetDictionary) {
          morphs += Object.keys(object.morphTargetDictionary).length;
        }
      });
      expect({ bones, morphs, clips: gltf.animations.length }).toEqual({
        bones: item.bones, morphs: item.morphs, clips: item.clips,
      });
    });
  }
});
