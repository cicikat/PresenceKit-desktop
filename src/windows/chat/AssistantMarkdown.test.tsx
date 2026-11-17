import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantMarkdown } from './AssistantMarkdown';
import { historyAssistantParts } from './chatHistory';

describe('assistant Markdown display', () => {
  it('renders the shared Markdown subset without rewriting the source', () => {
    const source = '# Title\n\n**bold** *italic* ~~removed~~ `inline`\n\n> quote\n\n1. first\n2. second\n\n```js\nconst x = "<hl>literal</hl>";\n```\n\n| A | B |\n|---|---|\n| one | two |';
    const html = renderToStaticMarkup(<AssistantMarkdown text={source} />);
    for (const element of ['h1','strong','em','del','code','blockquote','ol','table']) {
      expect(html).toContain(`<${element}`);
    }
    expect(html).toContain('&lt;hl&gt;literal&lt;/hl&gt;');
    expect(source).toContain('**bold**');
  });

  it('does not execute HTML, load images or expose unsafe links', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown text={'<script>alert(1)</script>\n\n<img src="https://private.invalid/image">\n\n![private](https://private.invalid/image)\n\n[x](javascript:alert(1)) [file](file:///private) [data](data:text/html,bad) [ok](https://example.invalid)'} />);
    expect(html).not.toMatch(/<(script|img|iframe)\b/);
    expect(html).not.toMatch(/href="(?:javascript|file|data):/);
    expect(html).toContain('href="https://example.invalid"');
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps legacy accents alongside inline Markdown and ordinary punctuation', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown text={'<hl>accent</hl> **bold**\n#hashtag 2*3=6'} />);
    expect(html).toContain('chat-inline-hl');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('#hashtag 2*3=6');
    expect(html).not.toContain('<h1');
  });

  it('keeps a code block and table intact during history recovery', () => {
    const entry = {assistant:'before\n```text\na\nb\n```\n| A |\n|---|\n| B |'};
    expect(historyAssistantParts(entry as never).map(p=>p.text)).toEqual([entry.assistant]);
    expect(historyAssistantParts({assistant:'    literal code'} as never)[0].text).toBe('    literal code');
  });
});
