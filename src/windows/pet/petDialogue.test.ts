import { describe, expect, it } from 'vitest';
import { splitPetDialogue } from './petDialogue';

describe('pet dialogue', () => {
  it('splits LF and CRLF paragraphs and skips empty lines', () => {
    expect(splitPetDialogue({ id: 'a', text: ' first\r\n\r\nsecond\nthird ' }))
      .toEqual(['first', 'second', 'third'].map((text, index) => ({ id: `a:${index}`, text, sticker: undefined })));
  });
  it('keeps a sticker only on the first bubble and supports sticker-only turns', () => {
    const sticker = { kind: 'sticker' as const, data_url: 'data:image/png;base64,test', emotion: 'happy' };
    expect(splitPetDialogue({ id: 's', text: '\n', sticker })[0]?.sticker).toEqual(sticker);
    expect(splitPetDialogue({ id: 's', text: 'one\ntwo', sticker })[1].sticker).toBeUndefined();
    expect(splitPetDialogue({ id: 'empty', text: ' \n ' })).toEqual([]);
  });
});
