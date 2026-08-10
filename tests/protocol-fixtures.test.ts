import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';

type JsonObject = Record<string, any>;

function fixtureRoot(): string {
  const configured = process.env.PRESENCEKIT_PROTOCOL_FIXTURES;
  if (configured) return resolve(configured);
  // Local three-repo checkouts normally live next to each other. CI sets the
  // environment variable explicitly after checking out the frozen backend SHA.
  return resolve(process.cwd(), '..', 'Emerald-presence', 'tests', 'protocol_fixtures', 'v1');
}

function load(name: string): JsonObject {
  return JSON.parse(readFileSync(join(fixtureRoot(), name), 'utf8')) as JsonObject;
}

test('desktop consumer reads the canonical v1 fixture manifest', () => {
  const manifest = load('manifest.json');
  expect(manifest.fixture_version).toBe('v1');
  expect(manifest.schema_version).toBe('1');
  expect(manifest.source_of_truth).toBe('Emerald-presence');
  expect(manifest.cases).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'desktop-http-correlation', file: 'desktop_http.json' }),
    expect.objectContaining({ id: 'desktop-websocket-correlation', file: 'desktop_ws.json' }),
  ]));
});

test('desktop HTTP fixture preserves opaque response correlation', () => {
  const fixture = load('desktop_http.json');
  const response = fixture.response.body;
  expect(fixture.request.method).toBe('POST');
  expect(fixture.request.path).toBe('/desktop/chat');
  expect(response.turn_id).toBe(fixture.correlation.http_id);
  expect(response.msg_id).toBe(fixture.correlation.ws_channel_message_id);
  expect(response.reply).toEqual(expect.any(String));
});

test('desktop WS fixture covers hello, stream, canonical, action ack and ping', () => {
  const fixture = load('desktop_ws.json');
  const serverTypes = fixture.server_frames.map((frame: JsonObject) => frame.type);
  const clientTypes = fixture.client_frames.map((frame: JsonObject) => frame.type);
  expect(serverTypes).toEqual(expect.arrayContaining([
    'hello_ack', 'message_stream_start', 'message_stream_delta',
    'message_stream_end', 'channel_message', 'action', 'ping',
  ]));
  expect(clientTypes).toEqual(expect.arrayContaining(['hello', 'ack', 'pong']));

  const correlated = fixture.server_frames
    .filter((frame: JsonObject) => frame.msg_id?.startsWith('turn-'))
    .map((frame: JsonObject) => frame.msg_id);
  expect(new Set(correlated)).toEqual(new Set(['turn-fixture-002']));
  expect(fixture.client_frames).toContainEqual(
    expect.objectContaining({ type: 'ack', msg_id: 'action-fixture-001', ok: true }),
  );
});

test('desktop valid request bodies contain no caller-controlled security fields', () => {
  const fixture = load('security.json');
  const forbidden = new Set(fixture.forbidden_client_fields as string[]);
  const desktop = load('desktop_http.json');
  const keys = Object.keys(desktop.request.body);
  expect(keys.some(key => forbidden.has(key))).toBe(false);
});
