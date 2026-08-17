import { DESIGN_COMPONENTS, type DesignComponentId } from './contract';

export interface ComponentAttachment {
  id: DesignComponentId;
  mount: HTMLElement;
  attachedAt: number;
}

export class ComponentAttachmentRegistry {
  private readonly descriptors = new Map(DESIGN_COMPONENTS.map(descriptor => [descriptor.id, descriptor]));
  private readonly attachments = new Map<DesignComponentId, ComponentAttachment>();

  attach(id: string, mount: HTMLElement): ComponentAttachment {
    const descriptor = this.descriptors.get(id as DesignComponentId);
    if (!descriptor) throw new Error(`未知设计组件: ${id}`);
    if (typeof HTMLElement !== 'undefined' && !(mount instanceof HTMLElement)) throw new Error(`组件挂载点不是 HTMLElement: ${id}`);
    if (this.attachments.has(descriptor.id)) throw new Error(`组件已挂载且为 singleton: ${id}`);
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
  }
}
