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

export function resolveLegacyOriginal(
  current: string,
  original: string | undefined,
  lastRendered: string | undefined,
  forceLanguageRender: boolean,
): string {
  if (original === undefined) return current;
  if (!forceLanguageRender && current !== lastRendered) return current;
  return original;
}

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
  const rendered = new WeakMap<Node, string>();
  const attributeStates = new WeakMap<Element, Map<string, { original: string; rendered: string }>>();
  const translateNode = (node: Node, forceLanguageRender = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const current = node.textContent ?? '';
      const original = resolveLegacyOriginal(
        current,
        originals.get(node),
        rendered.get(node),
        forceLanguageRender,
      );
      originals.set(node, original);
      const next = currentLanguage === 'en-US' ? translateLegacyText(original) : original;
      rendered.set(node, next);
      if (current !== next) node.textContent = next;
      return;
    }
    if (!(node instanceof Element)) return;
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const current = node.getAttribute(attr);
      if (!current) continue;
      let states = attributeStates.get(node);
      if (!states) {
        states = new Map();
        attributeStates.set(node, states);
      }
      const previous = states.get(attr);
      const original = resolveLegacyOriginal(
        current,
        previous?.original,
        previous?.rendered,
        forceLanguageRender,
      );
      const next = currentLanguage === 'en-US' ? translateLegacyText(original) : original;
      states.set(attr, { original, rendered: next });
      if (current !== next) node.setAttribute(attr, next);
    }
    node.childNodes.forEach(child => translateNode(child, forceLanguageRender));
  };
  const render = () => translateNode(document.body, true);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    const next = event.newValue;
    if ((next !== 'zh-CN' && next !== 'en-US') || next === currentLanguage) return;
    currentLanguage = next;
    document.documentElement.lang = next;
    listeners.forEach(listener => listener());
  };
  render();
  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => translateNode(node));
      if (record.type === 'characterData' || record.type === 'attributes') translateNode(record.target);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label'],
  });
  window.addEventListener('storage', handleStorage);
  listeners.add(render);
  return () => {
    observer.disconnect();
    window.removeEventListener('storage', handleStorage);
    listeners.delete(render);
  };
}
