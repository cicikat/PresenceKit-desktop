import { describe, expect, it } from 'vitest';
import { attachmentKind, mergeAttachments, type DraftAttachment } from './draftAttachments';

const draft = (filename: string): DraftAttachment => ({ id: filename, filename });
describe('attachment draft contract', () => {
  it('stages multiple images without changing the existing draft', () => {
    const first = [draft('first.png')];
    expect(mergeAttachments(first, [draft('second.JPG')])).toHaveLength(2);
    expect(first).toHaveLength(1);
    expect(attachmentKind('scan.JPEG')).toBe('image');
  });
  it('rejects mixed media, multiple documents and unsupported types atomically', () => {
    expect(() => mergeAttachments([draft('note.md')], [draft('photo.png')])).toThrow('singleDocument');
    expect(() => mergeAttachments([draft('note.md')], [draft('other.txt')])).toThrow('singleDocument');
    expect(() => mergeAttachments([], [draft('app.exe')])).toThrow('unsupported');
    expect(() => mergeAttachments([], Array.from({ length: 11 }, (_, i) => draft(`${i}.png`)))).toThrow('countLimit');
  });
});
