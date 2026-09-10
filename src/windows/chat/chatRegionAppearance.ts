import { cloneElement, isValidElement, type CSSProperties, type ReactNode } from 'react';

/** Optional regions can be false/null when hidden by a saved preference. */
export function applyChatRegionOpacity(content: ReactNode, opacity: number): ReactNode {
  if (!isValidElement<{ style?: CSSProperties }>(content)) return content;
  return cloneElement(content, {
    style: { ...content.props.style, filter: `opacity(${opacity})` },
  });
}
