import { DESIGN_COMPONENTS, isDesignComponentOwnershipConflict, type DesignComponentId } from './contract';

export const DESIGN_CAPABILITIES = ['flow', 'garden', 'diary', 'status'] as const;
export type DesignCapability = typeof DESIGN_CAPABILITIES[number];
export type DesignCompositionMode = 'official-renderer' | 'subregions' | 'presenter-only';

export interface ComponentAttachment {
  id: DesignComponentId;
  mount: HTMLElement;
  attachedAt: number;
}

function capabilityFor(id: DesignComponentId): DesignCapability | null {
  const match = /^chat\.sidebar\.(flow|garden|diary|status)(?:\.|$)/.exec(id);
  return match?.[1] as DesignCapability | undefined ?? null;
}

function isCapabilityParent(id: DesignComponentId, capability: DesignCapability): boolean {
  return id === `chat.sidebar.${capability}`;
}

/** Tracks portal ownership and an optional explicit renderer composition plan. */
export class ComponentAttachmentRegistry {
  private readonly descriptors = new Map(DESIGN_COMPONENTS.map(descriptor => [descriptor.id, descriptor]));
  private readonly attachments = new Map<DesignComponentId, ComponentAttachment>();
  private readonly compositions = new Map<DesignCapability, DesignCompositionMode>();

  setComposition(capability: DesignCapability, mode: DesignCompositionMode): void {
    const attached = [...this.attachments.keys()].filter(id => capabilityFor(id) === capability);
    const hasParent = attached.some(id => isCapabilityParent(id, capability));
    const hasChild = attached.some(id => !isCapabilityParent(id, capability));
    if ((mode === 'official-renderer' && hasChild) || (mode === 'subregions' && hasParent) || (mode === 'presenter-only' && attached.length > 0)) {
      throw new Error(`Cannot switch ${capability} to ${mode}; detach conflicting attachments first`);
    }
    this.compositions.set(capability, mode);
  }

  getComposition(capability: DesignCapability): DesignCompositionMode | null {
    return this.compositions.get(capability) ?? null;
  }

  attach(id: string, mount: HTMLElement): ComponentAttachment {
    const descriptor = this.descriptors.get(id as DesignComponentId);
    if (!descriptor) throw new Error(`Unknown design component: ${id}`);
    if (typeof HTMLElement !== 'undefined' && !(mount instanceof HTMLElement)) throw new Error(`Component mount is not an HTMLElement: ${id}`);
    if (this.attachments.has(descriptor.id)) throw new Error(`Component is already attached as a singleton: ${id}`);
    const capability = capabilityFor(descriptor.id);
    const composition = capability ? this.compositions.get(capability) : null;
    if (composition === 'presenter-only') throw new Error(`${capability} is presenter-only and cannot attach ${descriptor.id}`);
    if (composition === 'official-renderer' && !isCapabilityParent(descriptor.id, capability!)) throw new Error(`${capability} uses official-renderer; attach chat.sidebar.${capability} instead of ${descriptor.id}`);
    if (composition === 'subregions' && isCapabilityParent(descriptor.id, capability!)) throw new Error(`${capability} uses subregions; attach a semantic child primitive instead of ${descriptor.id}`);
    const conflict = [...this.attachments.keys()].find(existing => isDesignComponentOwnershipConflict(existing, descriptor.id));
    if (conflict) throw new Error(`Component ownership conflict: ${conflict} and ${descriptor.id}; choose official-renderer, subregions, or presenter-only`);
    const attachment = { id: descriptor.id, mount, attachedAt: Date.now() };
    this.attachments.set(descriptor.id, attachment);
    return attachment;
  }

  detach(id: string): boolean {
    return this.attachments.delete(id as DesignComponentId);
  }

  get(id: string): ComponentAttachment | undefined {
    return this.attachments.get(id as DesignComponentId);
  }

  list(): DesignComponentId[] {
    return [...this.attachments.keys()];
  }

  clear(): void {
    this.attachments.clear();
    this.compositions.clear();
  }
}
