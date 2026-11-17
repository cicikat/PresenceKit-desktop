import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Plugin } from 'unified';
import type { Root } from 'mdast';
import './assistantMarkdown.css';

type Node = {type: string; value?: string; children?: Node[]; data?: Record<string, unknown>};
const legacyPair = /<(hl|big|sm)>([^<]{0,200})<\/\1>/g;

// Transform only parsed HTML nodes. Code spans/fences never visit this path.
const remarkLegacy: Plugin<[], Root> = function () {
  const parse = (text: string) => this.parse(text) as Root;
  function visit(parent: Node) {
    if (!parent.children) return;
    const children = parent.children;
    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      const opening = child.type === 'html' && /^<(hl|big|sm)>$/.exec(child.value || '');
      if (opening) {
        const end = children.findIndex((node, at) => at > index && node.type === 'html' && node.value === `</${opening[1]}>`);
        if (end > index) {
          const content = children.slice(index + 1, end);
          const wrapped: Node = {type:'emphasis', children:content, data:{hName:'span',hProperties:{className:[`chat-inline-${opening[1]}`]}}};
          children.splice(index, end - index + 1, wrapped);
          visit(wrapped);
          continue;
        }
      }
      if (child.type === 'html' && child.value && /<(hl|big|sm)>[^<]{0,200}<\/\1>/.test(child.value)) {
        const converted = child.value.replace(legacyPair, (_, tag, body) => `[${body}](presence-inline:${tag})`);
        const parsed = parse(converted).children as unknown as Node[];
        const replacement = parent.type === 'root' ? parsed : parsed.flatMap(node => node.type === 'paragraph' ? node.children || [] : [node]);
        children.splice(index, 1, ...replacement);
        index--;
        continue;
      }
      visit(child);
    }
  }
  return tree => visit(tree as unknown as Node);
};

export function safeMarkdownUrl(value: string): string {
  if (/^presence-inline:(hl|big|sm)$/.test(value)) return value;
  if (!/^https?:\/\//i.test(value) || /[\s\u0000-\u001f]/.test(value)) return '';
  try {
    const parsed = new URL(value);
    return parsed.hostname && !parsed.username && !parsed.password ? value : '';
  } catch { return ''; }
}

export const AssistantMarkdown = memo(function AssistantMarkdown({text}: {text:string}) {
  return <div className="chat-markdown"><Markdown
    remarkPlugins={[remarkGfm, remarkLegacy]}
    urlTransform={safeMarkdownUrl}
    components={{
      img: ({alt}) => <span>{alt || ''}</span>,
      a: ({href, children}) => {
        if (href?.startsWith('presence-inline:')) return <span className={`chat-inline-${href.split(':')[1]}`}>{children}</span>;
        if (!href) return <span>{children}</span>;
        return <a href={href} rel="noopener noreferrer" target="_blank" onClick={event => {event.preventDefault(); void openUrl(href).catch(() => {});}}>{children}</a>;
      },
      table: ({children}) => <div className="chat-markdown-table"><table>{children}</table></div>,
    }}
  >{text}</Markdown></div>;
});
