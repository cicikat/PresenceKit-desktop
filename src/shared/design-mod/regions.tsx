import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useDesignMounts } from './mounts';
import type { DesignComponentId } from './contract';

export function DesignAwareRegion({ id, children, fallback = true }: { id: DesignComponentId; children: ReactNode; fallback?: boolean }) {
  const { mounts } = useDesignMounts();
  const target = mounts[id];
  return target ? createPortal(children, target, `design-${id}`) : fallback ? <>{children}</> : null;
}
