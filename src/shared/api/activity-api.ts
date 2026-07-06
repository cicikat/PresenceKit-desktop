// Activity API — routes all calls through Tauri invoke() so they go via Rust/reqwest,
// identical to every other API in this app. This bypasses WebView CORS restrictions
// and automatically carries the admin Bearer token.
import { invoke } from '@tauri-apps/api/core';

function parseActivityError(err: unknown): Error {
  const msg = String(err);
  if (msg.startsWith('HTTP ')) {
    // backend returned a non-2xx response; format: "HTTP <status>: <body>"
    return new Error(msg);
  }
  const invokeErrKeywords = ['missing required key', 'invalid args', 'invalid type', 'failed to deserialize', 'command'];
  if (invokeErrKeywords.some(k => msg.toLowerCase().includes(k))) {
    return new Error(`前端调用参数错误：${msg}`);
  }
  if (import.meta.env.DEV) {
    console.error('[activity] rust error:', msg);
  }
  // 透出 Rust 层真实错误（读文件失败 / 无法解析文件名 / 上传请求失败等），
  // 不再用兜底文案掩盖，方便用户看到真因。
  return new Error(msg);
}

async function invokeActivity<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (import.meta.env.DEV) {
    console.log(`[activity] invoke ${command}`, args ?? {});
  }
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    throw parseActivityError(err);
  }
}

// ── Reading ───────────────────────────────────────────────────────────────────

export interface ReadingStartResult {
  session_id: string;
  title: string;
  total_pages: number;
}

export interface ReadingState {
  session_id: string | null;
  title: string | null;
  current_page: number;
  total_pages: number;
  status: string;
}

export interface ReadingPageResult {
  page: number;
  total_pages: number;
  text: string;
}

export interface ReadingGroundingFacts {
  current_page?: number;
  total_pages?: number;
  progress_pct?: number;
  filename?: string;
}

export interface ReadingChatResult {
  session_id: string;
  reply: string;
  control?: Record<string, unknown>;
  grounding?: ReadingGroundingFacts;
}

export interface ReadingLibraryBook {
  book_id: string;
  filename: string;
  title: string;
  category: string;
  added_at?: string;
  total_pages?: number | null;
  size_bytes: number;
}

export interface ReadingLibraryResult {
  books: ReadingLibraryBook[];
}

export const readingApi = {
  start: (file_path: string): Promise<ReadingStartResult> =>
    invokeActivity('activity_reading_start', { filePath: file_path }),
  state: (): Promise<ReadingState> =>
    invokeActivity('activity_reading_state'),
  page: (session_id: string, page: number): Promise<ReadingPageResult> =>
    invokeActivity('activity_reading_page', { payload: { session_id, page } }),
  turnPage: (session_id: string, direction: 'next' | 'prev'): Promise<ReadingPageResult> =>
    invokeActivity('activity_reading_turn_page', { payload: { session_id, direction } }),
  close: (session_id: string): Promise<{ status: string }> =>
    invokeActivity('activity_reading_close', { payload: { session_id } }),
  chat: (params: { session_id: string; message: string }): Promise<ReadingChatResult> =>
    invokeActivity('activity_reading_chat', { payload: { session_id: params.session_id, message: params.message } }),
  library: (): Promise<ReadingLibraryResult> =>
    invokeActivity('activity_reading_library'),
  addBook: (filePath: string): Promise<ReadingLibraryBook> =>
    invokeActivity('activity_reading_add_book', { filePath }),
  startFromLibrary: (book_id: string, start_page = 1): Promise<ReadingStartResult> =>
    invokeActivity('activity_reading_start_from_library', { payload: { book_id, start_page } }),
  deleteBook: (book_id: string, with_insights = false): Promise<{ deleted: boolean; book_id: string }> =>
    invokeActivity('activity_reading_delete_book', { payload: { book_id, with_insights } }),
  renameBook: (book_id: string, title: string): Promise<ReadingLibraryBook> =>
    invokeActivity('activity_reading_rename_book', { payload: { book_id, title } }),
  categorizeBook: (book_id: string, category: string): Promise<ReadingLibraryBook> =>
    invokeActivity('activity_reading_categorize_book', { payload: { book_id, category } }),
};

// ── Gomoku ────────────────────────────────────────────────────────────────────

export type GomokuCell = 'black' | 'white' | null;
export type GomokuOpponent = 'human' | 'character_ai';
export type GomokuAiStyle = 'balanced' | 'gentle' | 'serious' | 'teaching';

export interface GomokuLastMove {
  x: number;  // col
  y: number;  // row
  player: string;
  move_no: number;
}

export interface GomokuState {
  session_id: string | null;
  board: GomokuCell[][];
  current_turn: string;
  winner: string | null;
  status: string;
  last_move: GomokuLastMove | null;
  opponent?: GomokuOpponent | null;
  ai_player?: 'white' | null;
  ai_style?: GomokuAiStyle | null;
}

export interface GomokuStartRequest {
  opponent?: GomokuOpponent;
  ai_style?: GomokuAiStyle;
}

export interface GomokuUserMoveFacts {
  created_chain?: number | null;
  blocked_opponent_chain?: number | null;
  is_center_area?: boolean;
  is_edge_area?: boolean;
  adjacent_stones?: number;
  summary?: string;
}

export interface GomokuAiMoveFacts {
  purpose?: string;
  created_chain?: number | null;
  blocked_user_chain?: number | null;
  summary?: string;
}

export interface GomokuGroundingFacts {
  last_user_move_facts?: GomokuUserMoveFacts;
  last_ai_move_facts?: GomokuAiMoveFacts;
}

export interface GomokuChatResult {
  session_id: string;
  reply: string;
  control?: Record<string, unknown>;
  grounding?: GomokuGroundingFacts;
}

export const gomokuApi = {
  start: (req?: GomokuStartRequest): Promise<GomokuState> =>
    // Tauri v2 bare-param commands use rename_all="camelCase": ai_style → aiStyle
    invokeActivity('activity_gomoku_start', {
      opponent: req?.opponent ?? null,
      aiStyle: req?.ai_style ?? null,
    }),
  state: (): Promise<GomokuState | { active: false }> =>
    invokeActivity('activity_gomoku_state'),
  move: (params: { session_id: string; x: number; y: number }): Promise<Omit<GomokuState, 'session_id'>> =>
    invokeActivity('activity_gomoku_move', { payload: params }),
  close: (session_id: string): Promise<{ status: string }> =>
    invokeActivity('activity_gomoku_close', { payload: { session_id } }),
  chat: (params: { session_id: string; message: string }): Promise<GomokuChatResult> =>
    invokeActivity('activity_gomoku_chat', { payload: { session_id: params.session_id, message: params.message } }),
  aiMove: (session_id: string): Promise<Omit<GomokuState, 'session_id'>> =>
    invokeActivity('activity_gomoku_ai_move', { payload: { session_id } }),
};

// ── Chess ─────────────────────────────────────────────────────────────────────

export type ChessTurn = 'white' | 'black';
export type ChessOpponent = 'human' | 'character_ai';
export type ChessAiStyle = 'balanced' | 'gentle' | 'serious' | 'teaching';

export interface ChessMoveEntry {
  move_no: number;
  uci: string;
  san: string;
  player: ChessTurn;
  fen_after: string;
}

export interface ChessState {
  session_id: string | null;
  fen: string;
  turn: ChessTurn;
  result: string | null;
  termination: string | null;
  status: string;
  move_history: ChessMoveEntry[];
  last_move: ChessMoveEntry | null;
  opponent?: ChessOpponent | null;
  ai_player?: ChessTurn | null;
  ai_style?: ChessAiStyle | null;
  pending_ai_turn?: boolean;
}

export interface ChessStartRequest {
  opponent?: ChessOpponent;
  ai_style?: ChessAiStyle;
}

export interface ChessMoveResult {
  session_id: string;
  fen: string;
  turn: ChessTurn;
  result: string | null;
  termination: string | null;
  status: string;
  last_move: ChessMoveEntry;
  opponent?: ChessOpponent | null;
  ai_player?: ChessTurn | null;
  pending_ai_turn?: boolean;
}

export interface ChessGroundingFacts {
  last_san?: string | null;
  move_hint?: string;
  is_check?: boolean;
  captured_piece?: string | null;
  material_balance_desc?: string;
  turn?: string;
}

export interface ChessChatResult {
  session_id: string;
  reply: string;
  control?: Record<string, unknown>;
  grounding?: ChessGroundingFacts;
}

export const chessApi = {
  start: (req?: ChessStartRequest): Promise<ChessState> =>
    invokeActivity('activity_chess_start', {
      opponent: req?.opponent ?? null,
      aiStyle: req?.ai_style ?? null,
    }),
  state: (): Promise<ChessState | { active: false }> =>
    invokeActivity('activity_chess_state'),
  move: (session_id: string, uci: string): Promise<ChessMoveResult> =>
    invokeActivity('activity_chess_move', { payload: { session_id, uci } }),
  legalMoves: (session_id: string): Promise<{ legal_moves: string[] }> =>
    invokeActivity('activity_chess_legal_moves', { payload: { session_id } }),
  close: (session_id: string): Promise<{ status: string }> =>
    invokeActivity('activity_chess_close', { payload: { session_id } }),
  chat: (params: { session_id: string; message: string }): Promise<ChessChatResult> =>
    invokeActivity('activity_chess_chat', { payload: { session_id: params.session_id, message: params.message } }),
  aiMove: (session_id: string): Promise<ChessMoveResult> =>
    invokeActivity('activity_chess_ai_move', { payload: { session_id } }),
};

// ── Dream Seed ────────────────────────────────────────────────────────────────

export interface DreamSeedState {
  active: boolean;
  session_id: string | null;
  has_seed: boolean;
  seed_preview: string;
}

export const dreamSeedApi = {
  start: (): Promise<{ session_id: string; status: string }> =>
    invokeActivity('activity_dream_seed_start'),
  state: (): Promise<DreamSeedState> =>
    invokeActivity('activity_dream_seed_state'),
  chat: (session_id: string, message: string): Promise<{ session_id: string; reply: string }> =>
    invokeActivity('activity_dream_seed_chat', { payload: { session_id, message } }),
  close: (session_id: string): Promise<{ success: boolean; seed_text: string }> =>
    invokeActivity('activity_dream_seed_close', { payload: { session_id } }),
};
