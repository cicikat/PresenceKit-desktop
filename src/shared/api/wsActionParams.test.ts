// Pure-logic tests for the ws_bridge `action` payload parsing helpers.
// Covers legal-message parsing plus the missing-field/unknown-shape tolerance
// paths that `_dispatchAction` in ws.ts relies on before executing an action.
import { describe, it, expect } from 'vitest';
import { actionType, actionParams, stringParam } from './wsActionParams';
import type { DesktopActionPayload } from './types';

describe('actionType', () => {
  it('reads action_type when present', () => {
    expect(actionType({ action_type: 'open_url', type: 'ignored' })).toBe('open_url');
  });

  it('falls back to type when action_type is absent', () => {
    expect(actionType({ type: 'minimize_window' })).toBe('minimize_window');
  });

  it('trims whitespace', () => {
    expect(actionType({ action_type: '  show_notify  ' })).toBe('show_notify');
  });

  it('returns null when both fields are missing', () => {
    expect(actionType({})).toBeNull();
  });

  it('returns null for a blank/whitespace-only type (unknown-message tolerance)', () => {
    expect(actionType({ action_type: '   ' })).toBeNull();
  });

  it('returns null when the field is a non-string value', () => {
    expect(actionType({ action_type: 42 as unknown as string })).toBeNull();
  });
});

describe('actionParams', () => {
  it('returns params when it is a plain object', () => {
    expect(actionParams({ params: { url: 'https://x' } })).toEqual({ url: 'https://x' });
  });

  it('returns {} when params is missing', () => {
    expect(actionParams({})).toEqual({});
  });

  it('returns {} when params is an array (malformed message tolerance)', () => {
    expect(actionParams({ params: ['not', 'an', 'object'] as unknown as Record<string, unknown> })).toEqual({});
  });

  it('returns {} when params is a primitive', () => {
    expect(actionParams({ params: 'oops' as unknown as Record<string, unknown> })).toEqual({});
  });
});

describe('stringParam', () => {
  it('prefers a value nested under params over a top-level field', () => {
    const action: DesktopActionPayload = { params: { text: 'from params' }, text: 'top level' };
    expect(stringParam(action, ['text'])).toBe('from params');
  });

  it('falls back to a top-level field when params lacks the key', () => {
    const action: DesktopActionPayload = { params: {}, text: 'top level' };
    expect(stringParam(action, ['text'])).toBe('top level');
  });

  it('tries keys in order and returns the first non-empty match', () => {
    const action: DesktopActionPayload = { params: { message: 'msg value' } };
    expect(stringParam(action, ['text', 'message', 'body'])).toBe('msg value');
  });

  it('trims the matched value', () => {
    const action: DesktopActionPayload = { params: { text: '  hello  ' } };
    expect(stringParam(action, ['text'])).toBe('hello');
  });

  it('skips blank candidates and keeps looking', () => {
    const action: DesktopActionPayload = { params: { text: '   ', body: 'real text' } };
    expect(stringParam(action, ['text', 'body'])).toBe('real text');
  });

  it('returns the fallback when no key matches (missing-field tolerance)', () => {
    const action: DesktopActionPayload = {};
    expect(stringParam(action, ['text', 'message'], 'default')).toBe('default');
  });

  it('defaults the fallback to an empty string', () => {
    expect(stringParam({}, ['text'])).toBe('');
  });
});
