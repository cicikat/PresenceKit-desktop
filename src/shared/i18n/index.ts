import { useEffect, useState } from 'react';
import { enUS } from './locales/en-US';
import { zhCN, type MessageKey } from './locales/zh-CN';
import { translateLegacyText } from './legacy';

export type Language = 'zh-CN' | 'en-US';
const STORAGE_KEY = 'presencekit.language';
const resources = { 'zh-CN': zhCN, 'en-US': enUS } as const;
let currentLanguage: Language = readLanguage();
const listeners = new Set<() => void>();

function readLanguage(): Language {
  if (typeof window === 'undefined') return 'zh-CN';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'en-US' || saved === 'zh-CN' ? saved : 'zh-CN';
}

export function getLanguage(): Language { return currentLanguage; }
export function setLanguage(language: Language): void {
  if (language === currentLanguage) return;
  currentLanguage = language;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, language);
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  listeners.forEach(listener => listener());
}
export function t(key: MessageKey): string { return resources[currentLanguage][key]; }
export function useI18n() {
  const [language, updateLanguage] = useState(currentLanguage);
  useEffect(() => {
    const listener = () => updateLanguage(currentLanguage);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return { language, setLanguage, t };
}

export function initI18n(): () => void {
  if (typeof document === 'undefined') return () => {};
  document.documentElement.lang = currentLanguage;
  const originals = new WeakMap<Node, string>();
  const translateNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const current = node.textContent ?? '';
      let original = originals.get(node);
      if (original === undefined) {
        original = current;
      } else {
        const previousRender = currentLanguage === 'en-US' ? translateLegacyText(original) : original;
        if (current !== previousRender) original = current;
      }
      originals.set(node, original);
      const next = currentLanguage === 'en-US' ? translateLegacyText(original) : original;
      if (current !== next) node.textContent = next;
      return;
    }
    if (!(node instanceof Element)) return;
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const marker = `data-i18n-original-${attr}`;
      const original = node.getAttribute(marker) ?? node.getAttribute(attr);
      if (!original) continue;
      node.setAttribute(marker, original);
      node.setAttribute(attr, currentLanguage === 'en-US' ? translateLegacyText(original) : original);
    }
    node.childNodes.forEach(translateNode);
  };
  const render = () => translateNode(document.body);
  render();
  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(translateNode);
      if (record.type === 'characterData') translateNode(record.target);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  listeners.add(render);
  return () => { observer.disconnect(); listeners.delete(render); };
}
