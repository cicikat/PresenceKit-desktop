import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import {
  chessApi,
  type ChessState,
  type ChessMoveEntry,
  type ChessMoveResult,
  type ChessTurn,
  type ChessOpponent,
  type ChessAiStyle,
} from '../../../shared/api/activity-api';
import { CompanionSidebar } from './CompanionSidebar';
import { GameSetupControls, type GameSetupOption } from './GameSetupControls';
import { getUIPref, onUIPrefChange } from '../../../shared/uiPreferences';
import { getActiveCharacterName } from '../../../shared/activeCharacter';
import { useI18n } from '../../../shared/i18n';

const AI_OPPONENT: ChessOpponent = 'character_ai';

const BOARD_THEMES: Record<string, Record<string, string>> = {
  classic_wood: {},
  cool_grey: {
    '--board-light': '#dee3e6',
    '--board-dark': '#8ca2ad',
    '--board-select': '#f0f070',
    '--board-target-light': '#b8c060',
    '--board-target-dark': '#8a8e3a',
    '--board-coord-light': '#8ca2ad',
    '--board-coord-dark': '#dee3e6',
  },
};

const SQUARE = 54;   // default square size
const MIN_SQUARE = 28;

// piece notation → Unicode
const PIECE_UNICODE: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

// row/col → UCI square name (e.g. 0,0 → "a8")
function toSquareName(row: number, col: number): string {
  return String.fromCharCode(97 + col) + String(8 - row);
}

// UCI square name → row/col (inverse of toSquareName)
function squareNameToRowCol(sq: string): [number, number] {
  const col = sq.charCodeAt(0) - 97;
  const row = 8 - Number(sq[1]);
  return [row, col];
}

// Resolve a click on `sq` given the currently selected piece (`fromSq`/`piece`) and its
// full legal-move UCI list. Handles: normal moves, promotion (defaults to queen),
// castling by clicking the rook, and en passant by clicking the captured pawn's square.
function resolveChessMove(
  sq: string,
  fromSq: string,
  piece: string,
  selectedMoves: string[],
): string | null {
  const direct = selectedMoves.filter(m => m.slice(2, 4) === sq);
  if (direct.length > 0) {
    const promoQueen = direct.find(m => m.length === 5 && m.endsWith('q'));
    return promoQueen ?? direct[0];
  }

  const pieceType = piece.toUpperCase();

  // castling: king selected, click lands on own rook's home square
  if (pieceType === 'K' && (fromSq === 'e1' || fromSq === 'e8')) {
    const rank = fromSq[1];
    if (sq === `h${rank}`) {
      const uci = `${fromSq}g${rank}`;
      if (selectedMoves.includes(uci)) return uci;
    }
    if (sq === `a${rank}`) {
      const uci = `${fromSq}c${rank}`;
      if (selectedMoves.includes(uci)) return uci;
    }
  }

  // en passant: pawn selected, click lands on the enemy pawn being captured
  // (actual UCI target is the empty square diagonally behind it)
  if (pieceType === 'P') {
    const file = sq[0];
    const candidate = selectedMoves.find(m => m.slice(2, 4)[0] === file && m.slice(2, 4) !== sq);
    if (candidate) return candidate;
  }

  return null;
}

// Visible target squares for the selected piece: normal move targets plus the
// "alias" squares users intuitively click — own rook for castling, the captured
// pawn's square for en passant.
function deriveChessTargets(
  selectedMoves: string[],
  fromSq: string | null,
  piece: string | null,
  board: (string | null)[][],
): string[] {
  if (!fromSq || !piece) return [];
  const targets = new Set<string>();
  for (const m of selectedMoves) targets.add(m.slice(2, 4));

  const pieceType = piece.toUpperCase();
  if (pieceType === 'K' && (fromSq === 'e1' || fromSq === 'e8')) {
    const rank = fromSq[1];
    if (selectedMoves.includes(`${fromSq}g${rank}`)) targets.add(`h${rank}`);
    if (selectedMoves.includes(`${fromSq}c${rank}`)) targets.add(`a${rank}`);
  }

  if (pieceType === 'P') {
    const fromFile = fromSq[0];
    for (const m of selectedMoves) {
      const target = m.slice(2, 4);
      if (target[0] === fromFile) continue; // straight push, not a diagonal capture
      const [r, c] = squareNameToRowCol(target);
      if ((board[r]?.[c] ?? null) === null) {
        targets.add(`${target[0]}${fromSq[1]}`); // en passant: alias to captured pawn's square
      }
    }
  }

  return Array.from(targets);
}

function fenToBoard(fen: string): (string | null)[][] {
  const rows = fen.split(' ')[0]?.split('/') ?? [];
  if (rows.length !== 8) return Array.from({ length: 8 }, () => Array(8).fill(null));

  return rows.map(rank => {
    const row: (string | null)[] = [];
    for (const token of rank) {
      if (/\d/.test(token)) {
        row.push(...Array(Number(token)).fill(null));
      } else {
        row.push(token);
      }
    }
    return row.length === 8 ? row : Array(8).fill(null);
  });
}

function normalizeChessState(
  raw: ChessState | ChessMoveResult,
  previous?: ChessState | null,
): ChessState {
  const lastMove = raw.last_move ?? null;
  const moveHistory = 'move_history' in raw
    ? raw.move_history
    : lastMove
      ? [...(previous?.move_history ?? []), lastMove]
      : previous?.move_history ?? [];

  return {
    session_id: raw.session_id ?? previous?.session_id ?? null,
    fen: raw.fen,
    turn: raw.turn,
    result: raw.result ?? null,
    termination: raw.termination ?? null,
    status: raw.status,
    move_history: moveHistory,
    last_move: lastMove,
    opponent: ('opponent' in raw ? raw.opponent : undefined) ?? previous?.opponent ?? null,
    ai_player: ('ai_player' in raw ? raw.ai_player : undefined) ?? previous?.ai_player ?? null,
    ai_style: previous?.ai_style ?? null,
    pending_ai_turn: ('pending_ai_turn' in raw ? raw.pending_ai_turn : undefined) ?? false,
  };
}

function isCurrentTurnPiece(piece: string | null, turn: ChessTurn): boolean {
  if (!piece) return false;
  return turn === 'white' ? piece === piece.toUpperCase() : piece === piece.toLowerCase();
}

function StatusTag({ text, ok }: { text: string; ok?: boolean }) {
  return (
    <span className="mono" style={{
      display: 'inline-block', padding: '2px 7px',
      fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
      background: ok ? 'oklch(0.38 0.13 145)' : 'var(--ink)',
      color: ok ? 'oklch(0.97 0.04 145)' : 'var(--paper)',
      borderRadius: 'var(--radius-xs)', textTransform: 'uppercase',
    }}>{text}</span>
  );
}

function Btn({ children, onClick, variant = 'ghost', disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: 'inherit', fontSize: 12.5,
      padding: '7px 14px', borderRadius: 'var(--radius-sm)',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      letterSpacing: 0.3, transition: 'background 0.15s',
      border: variant === 'solid' ? '1px solid var(--ink)' : '1px solid var(--paper-edge)',
      background: variant === 'solid' ? 'var(--ink)' : 'var(--paper-2)',
      color: variant === 'solid' ? 'var(--paper)' : 'var(--ink)',
      fontWeight: variant === 'ghost' ? 500 : 600,
    }}>{children}</button>
  );
}

function ChessBoard({
  board,
  selected,
  legalTargets,
  onSquareClick,
  disabled,
  pieceStyle,
  squareSize = SQUARE,
}: {
  board: (string | null)[][];
  selected: [number, number] | null;
  legalTargets: string[];
  onSquareClick: (row: number, col: number) => void;
  disabled: boolean;
  pieceStyle: string;
  squareSize?: number;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(8, ${squareSize}px)`,
      gridTemplateRows: `repeat(8, ${squareSize}px)`,
      border: '2px solid var(--paper-edge)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
      userSelect: 'none',
      flexShrink: 0,
    }}>
      {Array.from({ length: 8 }).map((_, row) =>
        Array.from({ length: 8 }).map((_, col) => {
          const isLight = (row + col) % 2 === 0;
          const piece = board[row]?.[col] ?? null;
          const isSelected = selected?.[0] === row && selected?.[1] === col;
          const sqName = toSquareName(row, col);
          const isTarget = legalTargets.includes(sqName);

          let bg = isLight ? 'var(--board-light)' : 'var(--board-dark)';
          if (isSelected) bg = 'var(--board-select)';
          else if (isTarget) bg = isLight ? 'var(--board-target-light)' : 'var(--board-target-dark)';

          return (
            <div
              key={`${row}-${col}`}
              onClick={() => !disabled && onSquareClick(row, col)}
              style={{
                width: squareSize, height: squareSize,
                background: bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: disabled ? 'default' : 'pointer',
                position: 'relative',
                transition: 'background 0.1s',
              }}
            >
              {/* rank/file labels */}
              {col === 0 && (
                <span style={{
                  position: 'absolute', top: 2, left: 3,
                  fontSize: Math.max(7, squareSize / 7), fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: isLight ? 'var(--board-coord-light)' : 'var(--board-coord-dark)', lineHeight: 1,
                }}>{8 - row}</span>
              )}
              {row === 7 && (
                <span style={{
                  position: 'absolute', bottom: 2, right: 3,
                  fontSize: Math.max(7, squareSize / 7), fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: isLight ? 'var(--board-coord-light)' : 'var(--board-coord-dark)', lineHeight: 1,
                }}>{String.fromCharCode(97 + col)}</span>
              )}

              {/* piece */}
              {piece && (
                <span style={{
                  fontSize: squareSize - 14,
                  lineHeight: 1,
                  userSelect: 'none',
                  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
                  ...(pieceStyle === 'letter' ? {
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: piece === piece.toUpperCase() ? '#fff' : '#111',
                    textShadow: piece === piece.toUpperCase()
                      ? '0 0 3px #000, 0 1px 3px #000'
                      : '0 0 2px #fff, 0 1px 2px #fff',
                  } : {}),
                }}>
                  {pieceStyle === 'letter' ? piece.toUpperCase() : (PIECE_UNICODE[piece] ?? piece)}
                </span>
              )}

              {/* target dot (no piece) */}
              {isTarget && !piece && (
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.20)',
                }} />
              )}

              {/* target ring (has piece = capture) */}
              {isTarget && piece && (
                <div style={{
                  position: 'absolute', inset: 3,
                  borderRadius: '50%',
                  border: '3px solid rgba(0,0,0,0.25)',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export function ChessPage() {
  const [gameState, setGameState] = useState<ChessState | null>(null);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [selectedMoves, setSelectedMoves] = useState<string[]>([]); // full legal UCI list for the selected piece
  const [loading, setLoading] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boardTheme, setBoardTheme] = useState(() => getUIPref('activity.board.theme', 'classic_wood'));
  const [pieceStyle, setPieceStyle] = useState(() => getUIPref('activity.chess.pieceStyle', 'unicode'));
  const [showDebug, setShowDebug] = useState(() => getUIPref('activity.debug', false));
  const [opponent, setOpponent] = useState<ChessOpponent>(AI_OPPONENT);
  const [aiStyle, setAiStyle] = useState<ChessAiStyle>('balanced');
  const { t } = useI18n();

  const opponentOptions: GameSetupOption[] = [
    { value: AI_OPPONENT, label: `${getActiveCharacterName()}执黑 / AI 对手` },
    { value: 'human', label: t('activity.gameSetup.opponent.human') },
  ];
  const styleOptions: GameSetupOption[] = [
    { value: 'balanced', label: t('activity.gameSetup.style.balanced') },
    { value: 'gentle', label: t('activity.gameSetup.style.gentle') },
    { value: 'serious', label: t('activity.gameSetup.style.serious') },
    { value: 'teaching', label: t('activity.gameSetup.style.teaching') },
  ];

  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [dynamicSquare, setDynamicSquare] = useState(SQUARE);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAiTimer = useCallback(() => {
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearAiTimer, [clearAiTimer]);

  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) {
        const fit = Math.floor(w / 8);
        setDynamicSquare(Math.max(MIN_SQUARE, Math.min(SQUARE, fit)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => onUIPrefChange(key => {
    if (key === 'activity.board.theme') setBoardTheme(getUIPref('activity.board.theme', 'classic_wood'));
    if (key === 'activity.chess.pieceStyle') setPieceStyle(getUIPref('activity.chess.pieceStyle', 'unicode'));
    if (key === 'activity.debug') setShowDebug(getUIPref('activity.debug', false));
  }), []);

  const refreshState = useCallback(async () => {
    try {
      const s = await chessApi.state();
      if ('active' in s && s.active === false) {
        setGameState(null);
      } else {
        setGameState(normalizeChessState(s as ChessState));
      }
    } catch {
      setGameState(null);
    }
  }, []);

  useEffect(() => { refreshState(); }, [refreshState]);

  const fireComment = useCallback((sessionId: string) => {
    chessApi.comment(sessionId).then(res => {
      if (!res.comment) return;
      window.dispatchEvent(new CustomEvent('activity-companion-push', {
        detail: { activityId: 'chess', sessionId, text: res.comment, grounding: res.grounding },
      }));
    }).catch(e => console.debug('[chess] comment fetch failed', e));
  }, []);

  const triggerAiMove = useCallback(async (sessionId: string) => {
    try {
      const result = await chessApi.aiMove(sessionId);
      setGameState(prev => normalizeChessState(result, prev));
      fireComment(sessionId);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setAiThinking(false);
    }
  }, [fireComment]);

  const scheduleAiMove = useCallback((sessionId: string) => {
    setAiThinking(true);
    const delay = 3000 + Math.random() * 5000; // 3–8s thinking window
    aiTimerRef.current = setTimeout(() => {
      aiTimerRef.current = null;
      triggerAiMove(sessionId);
    }, delay);
  }, [triggerAiMove]);

  const handleStart = async () => {
    clearAiTimer(); setAiThinking(false);
    setLoading(true); setError(null);
    setSelected(null); setSelectedPiece(null); setSelectedMoves([]);
    try {
      const s = await chessApi.start({ opponent, ai_style: aiStyle });
      setGameState(normalizeChessState({
        ...s,
        result: null,
        termination: null,
        move_history: [],
        last_move: null,
      }));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    clearAiTimer(); setAiThinking(false);
    setLoading(true); setError(null);
    setSelected(null); setSelectedPiece(null); setSelectedMoves([]);
    try {
      if (gameState?.session_id) {
        await chessApi.close(gameState.session_id);
      }
      setGameState(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const handleSquareClick = async (row: number, col: number) => {
    if (!gameState || gameState.status !== 'active' || loading || aiThinking) return;
    if (gameState.turn === gameState.ai_player) return;

    const board = fenToBoard(gameState.fen);
    const piece = board[row]?.[col] ?? null;
    const sqName = toSquareName(row, col);

    if (!selected) {
      if (isCurrentTurnPiece(piece, gameState.turn)) {
        setSelected([row, col]);
        setSelectedPiece(piece);
        try {
          const { legal_moves } = await chessApi.legalMoves(gameState.session_id!);
          const fromSq = toSquareName(row, col);
          setSelectedMoves(legal_moves.filter(m => m.startsWith(fromSq)));
        } catch {
          setSelectedMoves([]);
        }
      }
      return;
    }

    const fromSq = toSquareName(selected[0], selected[1]);
    const uci = selectedPiece ? resolveChessMove(sqName, fromSq, selectedPiece, selectedMoves) : null;
    if (uci) {
      const sid = gameState.session_id!;
      setSelected(null); setSelectedPiece(null); setSelectedMoves([]);
      setLoading(true); setError(null);
      try {
        const result = await chessApi.move(sid, uci);
        setGameState(prev => normalizeChessState(result, prev));
        if (result.pending_ai_turn) {
          scheduleAiMove(sid);
        } else if (result.status !== 'active') {
          fireComment(sid);
        }
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }
    } else if (isCurrentTurnPiece(piece, gameState.turn)) {
      setSelected([row, col]);
      setSelectedPiece(piece);
      try {
        const { legal_moves } = await chessApi.legalMoves(gameState.session_id!);
        setSelectedMoves(legal_moves.filter(m => m.startsWith(sqName)));
      } catch {
        setSelectedMoves([]);
      }
    } else {
      setSelected(null); setSelectedPiece(null); setSelectedMoves([]);
    }
  };

  const isActive = gameState?.status === 'active';
  const isFinished = !isActive && !!gameState?.session_id;

  const displayBoard = fenToBoard(gameState?.fen ?? '8/8/8/8/8/8/8/8 w - - 0 1');
  const selectedSqName = selected ? toSquareName(selected[0], selected[1]) : null;
  const legalTargets = deriveChessTargets(selectedMoves, selectedSqName, selectedPiece, displayBoard);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '28px 32px', gap: 20, overflowY: 'auto',
      background: 'var(--paper)', color: 'var(--ink)',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
          国际象棋
        </div>
        {gameState?.status && (
          <StatusTag text={gameState.status} ok={isActive} />
        )}
        {gameState?.result && (
          <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.5 }}>
            {gameState.result}
            {gameState.termination ? ` · ${gameState.termination}` : ''}
          </span>
        )}
      </div>

      {/* error */}
      {error && (
        <div className="mono" style={{
          padding: '8px 12px', background: 'oklch(0.95 0.05 20)',
          border: '1px solid oklch(0.80 0.10 20)', borderRadius: 'var(--radius-sm)',
          fontSize: 11, color: 'oklch(0.40 0.14 20)', letterSpacing: 0.5,
        }}>
          {error}
        </div>
      )}

      {/* controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {!isActive && !isFinished && (
          <GameSetupControls
            opponentOptions={opponentOptions}
            opponentValue={opponent}
            onOpponentChange={v => setOpponent(v as ChessOpponent)}
            styleOptions={styleOptions}
            styleValue={aiStyle}
            onStyleChange={v => setAiStyle(v as ChessAiStyle)}
            showStyleSelect={opponent === AI_OPPONENT}
            onStart={handleStart}
            startLabel={loading ? t('activity.gameSetup.starting') : t('activity.gameSetup.start')}
            loading={loading}
          />
        )}
        {(isActive || isFinished) && (
          <>
            {isFinished && <Btn variant="solid" onClick={handleStart} disabled={loading}>再来一局</Btn>}
            <Btn onClick={handleClose} disabled={loading}>结束对局</Btn>
          </>
        )}
        {isActive && (
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', letterSpacing: 0.8 }}>
            当前回合：{gameState?.turn === 'white' ? '♔ 白方' : '♚ 黑方'}
            {aiThinking
              ? ` · ${getActiveCharacterName()}思考中…`
              : loading ? ' · 等待中…' : ''}
          </span>
        )}
      </div>

      {/* board row: left=board+info, right=companion */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', position: 'relative' }}>
        {/* left: board (responsive) + instructions + move history */}
        <div
          ref={boardContainerRef}
          style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={BOARD_THEMES[boardTheme] as CSSProperties}>
            <ChessBoard
              board={displayBoard}
              selected={selected}
              legalTargets={legalTargets}
              onSquareClick={handleSquareClick}
              disabled={!isActive || loading || aiThinking || gameState?.turn === gameState?.ai_player}
              pieceStyle={pieceStyle}
              squareSize={dynamicSquare}
            />
          </div>

          {isActive && (
            <div style={{
              padding: '12px 14px',
              background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-md)',
            }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>
                操作说明
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.8 }}>
                {gameState?.opponent === AI_OPPONENT ? (
                  <>
                    <div>你执白，{getActiveCharacterName()}执黑</div>
                    <div>走完白方等 AI 应手</div>
                  </>
                ) : (
                  <>
                    <div>本地双人裁判模式</div>
                    <div>白方与黑方轮流走棋</div>
                  </>
                )}
              </div>
              <div className="mono" style={{ marginTop: 10, fontSize: 10, color: 'var(--ink-3)', letterSpacing: 0.5 }}>
                点击棋子选中，<br />再点击目标格移动。
              </div>
            </div>
          )}

          {gameState?.move_history && gameState.move_history.length > 0 && (
            <div style={{
              padding: '12px 14px',
              background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-md)',
              maxHeight: 200, overflowY: 'auto',
            }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>
                走棋记录
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.9 }}>
                {gameState.move_history.map((m: ChessMoveEntry, i) => (
                  <span key={i} style={{ marginRight: 6 }}>
                    {i % 2 === 0 && (
                      <span style={{ color: 'var(--ink-4)', marginRight: 2 }}>
                        {Math.floor(i / 2) + 1}.
                      </span>
                    )}
                    {m.san}{' '}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* right: companion sidebar */}
        <CompanionSidebar
          activityId="chess"
          sessionId={gameState?.session_id ?? null}
          sessionActive={isActive}
          sessionFinished={isFinished}
        />
      </div>

      {showDebug && gameState && (
        <div className="mono" style={{
          padding: '8px 12px', background: 'var(--paper-2)',
          border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
          fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: 0.5,
        }}>
          session_id: {gameState.session_id ?? '—'} · FEN: {gameState.fen} · sq: {dynamicSquare}
        </div>
      )}
    </div>
  );
}
