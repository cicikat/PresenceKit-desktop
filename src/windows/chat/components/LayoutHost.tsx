import type { ReactNode } from 'react';
import { SLOT_IDS, type SlotId } from '../../../shared/layout/contract';
import type { LayoutManifest } from '../../../shared/layout/types';

interface LayoutHostProps {
  manifest: LayoutManifest;
  slots: Record<SlotId, ReactNode>;
  sidebarSize?: number;
}

export function LayoutHost({ manifest, slots, sidebarSize }: LayoutHostProps) {
  const orderedSlots = [...SLOT_IDS].sort((left, right) => (
    manifest.slots[left].order - manifest.slots[right].order
  ));

  return (
    <div
      className="chat-ui__layout"
      style={{ height: '100%', display: 'flex', minHeight: 0, minWidth: 0, flexDirection: manifest.direction }}
    >
      {orderedSlots.map(slotId => {
        const slot = manifest.slots[slotId];
        const content = slots[slotId];
        if (slotId === 'sidebar' && !content) return null;
        const size = slotId === 'sidebar' ? (sidebarSize ?? slot.size) : slot.size;
        const style = slotId === 'main'
          ? { order: slot.order, flex: 1, minWidth: 0, minHeight: 0, position: 'relative' as const }
          : {
              order: slot.order,
              flex: size ? `0 0 ${size + (slotId === 'sidebar' ? 5 : 0)}px` : '0 0 auto',
              width: size ? size + (slotId === 'sidebar' ? 5 : 0) : undefined,
              minHeight: 0,
              minWidth: 0,
              display: slotId === 'sidebar' ? 'flex' : undefined,
              flexDirection: slotId === 'sidebar' ? manifest.direction : undefined,
            };
        return <div key={slotId} data-layout-slot={slotId} style={style}>{content}</div>;
      })}
    </div>
  );
}
