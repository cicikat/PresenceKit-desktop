import { describe, expect, it } from 'vitest';
import { ComponentAttachmentRegistry } from './components';

describe('design component registry', () => {
  it('rejects unknown and duplicate singleton attachments', () => {
    const registry = new ComponentAttachmentRegistry();
    const mount = {} as HTMLElement;
    registry.attach('chat.sidebar.garden', mount);
    expect(() => registry.attach('chat.sidebar.garden', {} as HTMLElement)).toThrow('singleton');
    expect(() => registry.attach('chat.unknown', mount)).toThrow('Unknown design component');
    expect(registry.detach('chat.sidebar.garden')).toBe(true);
    expect(registry.list()).toEqual([]);
  });

  it('rejects parent and child region ownership conflicts', () => {
    const registry = new ComponentAttachmentRegistry();
    registry.attach('chat.sidebar.flow', {} as HTMLElement);
    expect(() => registry.attach('chat.sidebar.flow.now', {} as HTMLElement)).toThrow('ownership conflict');
    registry.clear();
    registry.attach('chat.sidebar.diary.entries', {} as HTMLElement);
    expect(() => registry.attach('chat.sidebar.diary', {} as HTMLElement)).toThrow('ownership conflict');
  });

  it('allows independent subregions after selecting subregions mode', () => {
    const registry = new ComponentAttachmentRegistry();
    registry.setComposition('flow', 'subregions');
    expect(() => registry.attach('chat.sidebar.flow', {} as HTMLElement)).toThrow('subregions');
    registry.attach('chat.sidebar.flow.now', {} as HTMLElement);
    registry.attach('chat.sidebar.flow.timeline', {} as HTMLElement);
    expect(registry.list()).toEqual(['chat.sidebar.flow.now', 'chat.sidebar.flow.timeline']);
  });

  it('makes presenter-only capability attachment-free', () => {
    const registry = new ComponentAttachmentRegistry();
    registry.setComposition('status', 'presenter-only');
    expect(() => registry.attach('chat.sidebar.status.mood', {} as HTMLElement)).toThrow('presenter-only');
    expect(registry.getComposition('status')).toBe('presenter-only');
  });

  it('keeps official-renderer ownership at the capability parent', () => {
    const registry = new ComponentAttachmentRegistry();
    registry.setComposition('garden', 'official-renderer');
    registry.attach('chat.sidebar.garden', {} as HTMLElement);
    expect(() => registry.attach('chat.sidebar.garden.visual', {} as HTMLElement)).toThrow('official-renderer');
  });

  it('keeps Status parent, subregions, and presenter-only modes mutually exclusive', () => {
    const registry = new ComponentAttachmentRegistry();
    registry.setComposition('status', 'official-renderer');
    registry.attach('chat.sidebar.status', {} as HTMLElement);
    expect(() => registry.attach('chat.sidebar.status.mood', {} as HTMLElement)).toThrow('official-renderer');

    registry.clear();
    registry.setComposition('status', 'subregions');
    registry.attach('chat.sidebar.status.mood', {} as HTMLElement);
    registry.attach('chat.sidebar.status.activity', {} as HTMLElement);
    registry.attach('chat.sidebar.status.timeline', {} as HTMLElement);
    expect(() => registry.attach('chat.sidebar.status', {} as HTMLElement)).toThrow('subregions');

    registry.clear();
    registry.setComposition('status', 'presenter-only');
    expect(() => registry.attach('chat.sidebar.status.timeline', {} as HTMLElement)).toThrow('presenter-only');
  });
});
