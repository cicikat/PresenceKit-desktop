import { SLOT_IDS, type SlotId } from './contract';
import type { LayoutManifest, SlotSpec } from './types';

function isSlotSpec(value: unknown): value is SlotSpec {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as SlotSpec).order === 'number'
    && Number.isFinite((value as SlotSpec).order);
}

export function validateLayout(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== 'object') return ['manifest 必须是对象'];
  const candidate = manifest as Partial<LayoutManifest>;
  const errors: string[] = [];
  if (typeof candidate.id !== 'string' || !candidate.id) errors.push('id 必须是非空字符串');
  if (typeof candidate.name !== 'string' || !candidate.name) errors.push('name 必须是非空字符串');
  if (candidate.direction !== 'row' && candidate.direction !== 'row-reverse') {
    errors.push('direction 必须是 row 或 row-reverse');
  }
  if (!candidate.slots || typeof candidate.slots !== 'object') {
    errors.push('slots 必须包含全部 slot');
    return errors;
  }
  for (const slotId of SLOT_IDS) {
    const slot = candidate.slots[slotId];
    if (!isSlotSpec(slot)) errors.push(`${slotId}.order 必须是 number`);
    if (slot?.size !== undefined && (!Number.isFinite(slot.size) || slot.size <= 0)) {
      errors.push(`${slotId}.size 必须是正数`);
    }
    if (slot?.hidden === true && slotId !== 'sidebar') {
      errors.push(`${slotId} 不允许 hidden`);
    }
  }
  return errors;
}

export function applyLayoutCss(id: string, cssText: string | null): void {
  document.querySelectorAll('style[data-layout-css]').forEach(element => element.remove());
  if (!cssText) return;
  const style = document.createElement('style');
  style.setAttribute('data-layout-css', id);
  style.textContent = cssText;
  document.head.appendChild(style);
}

export function clearLayoutCss(): void {
  document.querySelectorAll('style[data-layout-css]').forEach(element => element.remove());
}

export function layoutSlot(manifest: LayoutManifest, slotId: SlotId): SlotSpec {
  return manifest.slots[slotId];
}
