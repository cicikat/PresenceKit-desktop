import { describe, expect, it } from 'vitest';
import { ComponentAttachmentRegistry } from './components';

describe('design component registry', () => {
  it('rejects unknown and duplicate singleton attachments', () => {
    const registry = new ComponentAttachmentRegistry();
    const mount = {} as HTMLElement;
    registry.attach('chat.sidebar.garden', mount);
    expect(() => registry.attach('chat.sidebar.garden', {} as HTMLElement)).toThrow('singleton');
    expect(() => registry.attach('chat.unknown', mount)).toThrow('未知设计组件');
    expect(registry.detach('chat.sidebar.garden')).toBe(true);
    expect(registry.list()).toEqual([]);
  });

  it('rejects parent and child region ownership conflicts', () => {
    const registry = new ComponentAttachmentRegistry();
    registry.attach('chat.sidebar.flow', {} as HTMLElement);
    expect(() => registry.attach('chat.sidebar.flow.now', {} as HTMLElement)).toThrow('所有权冲突');
    registry.clear();
    registry.attach('chat.sidebar.diary.entries', {} as HTMLElement);
    expect(() => registry.attach('chat.sidebar.diary', {} as HTMLElement)).toThrow('所有权冲突');
  });
});
