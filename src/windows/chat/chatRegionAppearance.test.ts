import { createElement, type ReactElement, type CSSProperties } from 'react';
import { describe, expect, it } from 'vitest';
import { applyChatRegionOpacity } from './chatRegionAppearance';

describe('optional chat region appearance', () => {
  it.each([false, null, undefined])('keeps hidden region %s absent without reading props', content => {
    expect(applyChatRegionOpacity(content, 0.5)).toBe(content);
  });

  it('applies opacity without mutating the region or losing grid placement', () => {
    const region = createElement('div', { style: { gridArea: 'header', padding: 18 } }, 'header');
    const rendered = applyChatRegionOpacity(region, 0.5) as ReactElement<{ style: CSSProperties }>;
    expect(rendered.props.style).toEqual({ gridArea: 'header', padding: 18, filter: 'opacity(0.5)' });
    expect(region.props.style).toEqual({ gridArea: 'header', padding: 18 });
  });
});
