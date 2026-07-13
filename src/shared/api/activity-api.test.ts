// Client-side authoritative contract lock for activity-api.ts.
//
// Emerald-presence's tests/test_activity_contract.py used to be the only place
// asserting these Tauri command names and request/response field shapes, cross-repo.
// This file is now this repo's own copy of that lock: if a command name or a
// field name below drifts from what activity-api.ts actually sends, `npm test`
// goes red here — no need to run the backend's pytest suite to notice.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { readingApi, gomokuApi, chessApi, dreamSeedApi } = await import('./activity-api');

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({});
});

describe('readingApi', () => {
  it('start() invokes activity_reading_start with filePath', async () => {
    await readingApi.start('/tmp/book.pdf');
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_start', { filePath: '/tmp/book.pdf' });
  });

  it('state() invokes activity_reading_state with no args', async () => {
    await readingApi.state();
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_state', undefined);
  });

  it('page() invokes activity_reading_page with session_id/page payload', async () => {
    await readingApi.page('sess-1', 3);
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_page', {
      payload: { session_id: 'sess-1', page: 3 },
    });
  });

  it('turnPage() invokes activity_reading_turn_page with direction', async () => {
    await readingApi.turnPage('sess-1', 'next');
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_turn_page', {
      payload: { session_id: 'sess-1', direction: 'next' },
    });
  });

  it('close() invokes activity_reading_close with session_id', async () => {
    await readingApi.close('sess-1');
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_close', {
      payload: { session_id: 'sess-1' },
    });
  });

  it('chat() invokes activity_reading_chat with session_id/message', async () => {
    await readingApi.chat({ session_id: 'sess-1', message: 'hi' });
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_chat', {
      payload: { session_id: 'sess-1', message: 'hi' },
    });
  });

  it('library() invokes activity_reading_library with no args', async () => {
    await readingApi.library();
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_library', undefined);
  });

  it('addBook() invokes activity_reading_add_book with filePath', async () => {
    await readingApi.addBook('/tmp/book.pdf');
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_add_book', { filePath: '/tmp/book.pdf' });
  });

  it('startFromLibrary() invokes activity_reading_start_from_library with book_id/start_page', async () => {
    await readingApi.startFromLibrary('book-1');
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_start_from_library', {
      payload: { book_id: 'book-1', start_page: 1 },
    });
  });

  it('deleteBook() invokes activity_reading_delete_book with book_id/with_insights', async () => {
    await readingApi.deleteBook('book-1', true);
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_delete_book', {
      payload: { book_id: 'book-1', with_insights: true },
    });
  });

  it('renameBook() invokes activity_reading_rename_book with book_id/title', async () => {
    await readingApi.renameBook('book-1', 'New Title');
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_rename_book', {
      payload: { book_id: 'book-1', title: 'New Title' },
    });
  });

  it('categorizeBook() invokes activity_reading_categorize_book with book_id/category', async () => {
    await readingApi.categorizeBook('book-1', 'fiction');
    expect(invokeMock).toHaveBeenCalledWith('activity_reading_categorize_book', {
      payload: { book_id: 'book-1', category: 'fiction' },
    });
  });
});

describe('gomokuApi', () => {
  it('start() invokes activity_gomoku_start with camelCase aiStyle', async () => {
    await gomokuApi.start({ opponent: 'human', ai_style: 'gentle' });
    expect(invokeMock).toHaveBeenCalledWith('activity_gomoku_start', {
      opponent: 'human',
      aiStyle: 'gentle',
      aiResponseMode: null,
    });
  });

  it('start() defaults opponent/aiStyle to null when omitted', async () => {
    await gomokuApi.start();
    expect(invokeMock).toHaveBeenCalledWith('activity_gomoku_start', {
      opponent: null,
      aiStyle: null,
      aiResponseMode: null,
    });
  });

  it('state() invokes activity_gomoku_state', async () => {
    await gomokuApi.state();
    expect(invokeMock).toHaveBeenCalledWith('activity_gomoku_state', undefined);
  });

  it('move() invokes activity_gomoku_move with session_id/x/y payload', async () => {
    await gomokuApi.move({ session_id: 'sess-1', x: 3, y: 4 });
    expect(invokeMock).toHaveBeenCalledWith('activity_gomoku_move', {
      payload: { session_id: 'sess-1', x: 3, y: 4 },
    });
  });

  it('close() invokes activity_gomoku_close with session_id', async () => {
    await gomokuApi.close('sess-1');
    expect(invokeMock).toHaveBeenCalledWith('activity_gomoku_close', {
      payload: { session_id: 'sess-1' },
    });
  });

  it('chat() invokes activity_gomoku_chat with session_id/message', async () => {
    await gomokuApi.chat({ session_id: 'sess-1', message: 'nice move' });
    expect(invokeMock).toHaveBeenCalledWith('activity_gomoku_chat', {
      payload: { session_id: 'sess-1', message: 'nice move' },
    });
  });

  it('aiMove() invokes activity_gomoku_ai_move with session_id', async () => {
    await gomokuApi.aiMove('sess-1');
    expect(invokeMock).toHaveBeenCalledWith('activity_gomoku_ai_move', {
      payload: { session_id: 'sess-1' },
    });
  });
});

describe('chessApi', () => {
  it('start() invokes activity_chess_start with camelCase aiStyle', async () => {
    await chessApi.start({ opponent: 'character_ai', ai_style: 'serious' });
    expect(invokeMock).toHaveBeenCalledWith('activity_chess_start', {
      opponent: 'character_ai',
      aiStyle: 'serious',
    });
  });

  it('state() invokes activity_chess_state', async () => {
    await chessApi.state();
    expect(invokeMock).toHaveBeenCalledWith('activity_chess_state', undefined);
  });

  it('move() invokes activity_chess_move with session_id/uci payload', async () => {
    await chessApi.move('sess-1', 'e2e4');
    expect(invokeMock).toHaveBeenCalledWith('activity_chess_move', {
      payload: { session_id: 'sess-1', uci: 'e2e4' },
    });
  });

  it('legalMoves() invokes activity_chess_legal_moves with session_id', async () => {
    await chessApi.legalMoves('sess-1');
    expect(invokeMock).toHaveBeenCalledWith('activity_chess_legal_moves', {
      payload: { session_id: 'sess-1' },
    });
  });

  it('close() invokes activity_chess_close with session_id', async () => {
    await chessApi.close('sess-1');
    expect(invokeMock).toHaveBeenCalledWith('activity_chess_close', {
      payload: { session_id: 'sess-1' },
    });
  });

  it('chat() invokes activity_chess_chat with session_id/message', async () => {
    await chessApi.chat({ session_id: 'sess-1', message: 'good game' });
    expect(invokeMock).toHaveBeenCalledWith('activity_chess_chat', {
      payload: { session_id: 'sess-1', message: 'good game' },
    });
  });

  it('aiMove() invokes activity_chess_ai_move with session_id', async () => {
    await chessApi.aiMove('sess-1');
    expect(invokeMock).toHaveBeenCalledWith('activity_chess_ai_move', {
      payload: { session_id: 'sess-1' },
    });
  });
});

describe('dreamSeedApi', () => {
  it('start() invokes activity_dream_seed_start with no args', async () => {
    await dreamSeedApi.start();
    expect(invokeMock).toHaveBeenCalledWith('activity_dream_seed_start', undefined);
  });

  it('state() invokes activity_dream_seed_state', async () => {
    await dreamSeedApi.state();
    expect(invokeMock).toHaveBeenCalledWith('activity_dream_seed_state', undefined);
  });

  it('chat() invokes activity_dream_seed_chat with session_id/message', async () => {
    await dreamSeedApi.chat('sess-1', 'hello');
    expect(invokeMock).toHaveBeenCalledWith('activity_dream_seed_chat', {
      payload: { session_id: 'sess-1', message: 'hello' },
    });
  });

  it('close() invokes activity_dream_seed_close with session_id', async () => {
    await dreamSeedApi.close('sess-1');
    expect(invokeMock).toHaveBeenCalledWith('activity_dream_seed_close', {
      payload: { session_id: 'sess-1' },
    });
  });
});

describe('activity error parsing', () => {
  it('passes through "HTTP <status>: <body>" errors from the backend unchanged', async () => {
    invokeMock.mockRejectedValueOnce('HTTP 404: book not found');
    await expect(readingApi.state()).rejects.toThrow('HTTP 404: book not found');
  });

  it('prefixes Tauri invoke argument errors with a 前端调用参数错误 marker', async () => {
    invokeMock.mockRejectedValueOnce('invalid args `payload` for command `activity_reading_page`');
    await expect(readingApi.page('sess-1', 1)).rejects.toThrow('前端调用参数错误');
  });

  it('passes through other backend errors unchanged', async () => {
    invokeMock.mockRejectedValueOnce('failed to read file: permission denied');
    await expect(readingApi.state()).rejects.toThrow('failed to read file: permission denied');
  });
});
