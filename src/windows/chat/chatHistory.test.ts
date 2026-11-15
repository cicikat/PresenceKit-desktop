import { expect, it } from 'vitest';
import { historyAssistantParts, historyVisibleText } from './chatHistory';

const artifact = { id: 'aa'.repeat(16), filename: 'report.html', mime: 'text/html', size: 12, previewable: true };

it('restores historical files only on the first displayed segment', () => {
  const parts = historyAssistantParts({ time: '12:00', user: '', assistant: 'raw', assistant_display_text: 'one\ntwo', artifacts: [artifact] });
  expect(parts.map(p => p.text)).toEqual(['one', 'two']);
  expect(parts[0].artifacts?.[0]).toMatchObject(artifact);
  expect(parts[1].artifacts).toBeUndefined();
});

it('restores file-only turns, including after a serialized history round trip', () => {
  const entry = JSON.parse(JSON.stringify({ time: '12:00', user: '', assistant: '', turn_id: 'turn', artifacts: [artifact] }));
  expect(historyAssistantParts(entry)).toHaveLength(1);
  expect(historyAssistantParts(entry)[0]).toMatchObject({ text: '', artifacts: [artifact] });
});

it('keeps legacy text and ignores invalid sidecars without empty bubbles', () => {
  expect(historyAssistantParts({ time: '12:00', user: '', assistant: 'old reply' })).toEqual([{ text: 'old reply', artifacts: undefined }]);
  expect(historyAssistantParts({ time: '12:00', user: '', assistant: '', artifacts: [{ ...artifact, id: 'invalid' }] })).toEqual([]);
});

it('hides only a terminal writer footer and keeps ordinary body quotes', () => {
  expect(historyVisibleText('我觉得你好像有点不一样了\n> speaker:user turn_id:fixture-user-turn')).toBe('我觉得你好像有点不一样了');
  expect(historyVisibleText('body\n> speaker:user turn_id:inside\nmore')).toBe('body\n> speaker:user turn_id:inside\nmore');
  expect(historyVisibleText('explain turn_id:please')).toBe('explain turn_id:please');
  expect(historyVisibleText('voice\n> speaker:user source:mobile modality:voice asr_low:1')).toBe('voice');
  expect(historyVisibleText('text\n> speaker:user')).toBe('text');
});

it('hides compact and trailing-blank legacy footer variants after failure', () => {
  for (const footer of ['\n> speaker:user turn_id:fixture-turn\n\n', '\r\n>speaker:user turn_id:fixture-turn\r\n']) {
    expect(historyVisibleText('original' + footer)).toBe('original');
  }
  expect(historyVisibleText('>speaker:user turn_id:fixture-turn\n')).toBe('');
  expect(historyVisibleText('ordinary >speaker:user example')).toBe('ordinary >speaker:user example');
});
