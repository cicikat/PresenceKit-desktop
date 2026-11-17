/** Preserve structured Markdown as one display unit; plain prose keeps its bubbles. */
export function hasMarkdownBlock(text: string): boolean {
  return /^(?: {0,3}(?:#{1,6}\s|>\s?|[-+*]\s|\d+[.)]\s|`{3,}|~{3,})| {4}\S)/m.test(text)
    || /^\s*\|?.+\|.*\r?\n\s*\|?\s*:?-{3,}/m.test(text);
}

export function splitReplyParagraphs(text: string): string[] {
  if (hasMarkdownBlock(text)) return text.trim() ? [text] : [];
  return text.split(/\n+/).map(part=>part.trim()).filter(Boolean);
}
