export function normalizeChatDisplayText(text: string): string {
  return text.replace(/\*([^*\n]+)\*/g, '（$1）');
}
