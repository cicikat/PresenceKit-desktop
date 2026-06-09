import { useState, useEffect, useCallback } from 'react';
import { chessApi, type ChessState, type ChessMoveResult, type ChessTurn } from '../../../shared/api/activity-api';

const SQUARE = 54; // px per square
const BOARD_PX = SQUARE * 8;

// piece notation → Unicode
const PIECE_UNICODE: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

// row/col → UCI square name (e.g. 0,0 → "a8")
function toSquareName(row: number, col: number): string {
  return String.fromCharCode(97 + col) + String(8 - row);
}

function StatusTag({ text, ok }: { text: string; ok?: boolean }) {
  return (
    <span className="mono" style={{
      display: 'inline-block', padding: '2px 7px',
      fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
      background: ok ? 'oklch(0.38 0.13 145)' : 'var(--ink)',
      color: ok ? 'oklch(0.97 0.04 145)' : 'var(--paper)',
      borderRadius: 3, textTransform: 'uppercase',
    }}>{text}</span>
  );
}

function Btn({ children, onClick, variant = 'ghost', disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: 'inherit', fontSize: 12.5,
      padding: '7px 14px', borderRadius: 5,
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
}: {
  board: (string | null)[][];
  selected: [number, number] | null;
  legalTargets: string[];
  onSquareClick: (row: number, col: number) => void;
  disabled: boolean;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(8, ${SQUARE}px)`,
      gridTemplateRows: `repeat(8, ${SQUARE}px)`,
      border: '2px solid var(--paper-edge)',
      borderRadius: 4,
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

          let bg = isLight ? '#f0d9b5' : '#b58863';
          if (isSelected) bg = '#f6f669';
          else if (isTarget) bg = isLight ? '#cdd16f' : '#aaa23a';

          return (
            <div
              key={`${row}-${col}`}
              onClick={() => !disabled && onSquareClick(row, col)}
              style={{
                width: SQUARE, height: SQUARE,
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
                  fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: isLight ? '#b58863' : '#f0d9b5', lineHeight: 1,
                }}>{8 - row}</span>
              )}
              {row === 7 && (
                <span style={{
                  position: 'absolute', bottom: 2, right: 3,
                  fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: isLight ? '#b58863' : '#f0d9b5', lineHeight: 1,
                }}>{String.fromCharCode(97 + col)}</span>
              )}

              {/* piece */}
              {piece && (
                <span style={{
                  fontSize: SQUARE - 14,
                  lineHeight: 1,
                  userSelect: 'none',
                  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
                }}>
                  {PIECE_UNICODE[piece] ?? piece}
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

type PageState = ChessState | (ChessMoveResult & { session_id: string | null; move_history: string[] });

export function ChessPage() {
  const [gameState, setGameState] = useState<ChessState | null>(null);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [legalTargets, setLegalTargets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    try {
      const s = await chessApi.state();
      setGameState(s);
    } catch {
      setGameState(null);
    }
  }, []);

  useEffect(() => { refreshState(); }, [refreshState]);

  const handleStart = async () => {
    setLoading(true); setError(null);
    setSelected(null); setLegalTargets([]);
    try {
      const s = await chessApi.start();
      setGameState(s);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    setLoading(true); setError(null);
    setSelected(null); setLegalTargets([]);
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
    if (!gameState || gameState.status !== 'active' || loading) return;

    const piece = gameState.board[row]?.[col] ?? null;
    const sqName = toSquareName(row, col);

    if (!selected) {
      // first click — select a piece (only white pieces = user's side)
      if (piece && piece === piece.toUpperCase()) {
        setSelected([row, col]);
        // fetch legal moves for this piece
        try {
          const { legal_moves } = await chessApi.legalMoves(gameState.session_id!);
          const fromSq = toSquareName(row, col);
          const targets = legal_moves
            .filter(m => m.startsWith(fromSq))
            .map(m => m.slice(2, 4));
          setLegalTargets(targets);
        } catch {
          setLegalTargets([]);
        }
      }
      return;
    }

    // second click — either move or reselect
    const fromSq = toSquareName(selected[0], selected[1]);
    if (legalTargets.includes(sqName)) {
      const uci = fromSq + sqName;
      setSelected(null); setLegalTargets([]);
      setLoading(true); setError(null);
      try {
        const result = await chessApi.move(gameState.session_id!, uci);
        setGameState(prev => prev ? {
          ...prev,
          ...result,
          move_history: [...(prev.move_history ?? []), uci, ...(result.ai_move ? [result.ai_move] : [])],
        } : null);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }
    } else if (piece && piece === piece.toUpperCase()) {
      // reselect another white piece
      setSelected([row, col]);
      try {
        const { legal_moves } = await chessApi.legalMoves(gameState.session_id!);
        const targets = legal_moves
          .filter(m => m.startsWith(sqName))
          .map(m => m.slice(2, 4));
        setLegalTargets(targets);
      } catch {
        setLegalTargets([]);
      }
    } else {
      setSelected(null); setLegalTargets([]);
    }
  };

  const isActive = gameState?.status === 'active';
  const isFinished = !isActive && !!gameState?.session_id;

  const emptyBoard: (string | null)[][] = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R'],
  ];

  const displayBoard = gameState?.board ?? emptyBoard;

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
          border: '1px solid oklch(0.80 0.10 20)', borderRadius: 5,
          fontSize: 11, color: 'oklch(0.40 0.14 20)', letterSpacing: 0.5,
        }}>
          {error}
        </div>
      )}

      {/* controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {!isActive && !isFinished && (
          <Btn variant="solid" onClick={handleStart} disabled={loading}>
            {loading ? '准备中…' : '开始对局'}
          </Btn>
        )}
        {(isActive || isFinished) && (
          <>
            {isFinished && <Btn variant="solid" onClick={handleStart} disabled={loading}>再来一局</Btn>}
            <Btn onClick={handleClose} disabled={loading}>结束对局</Btn>
          </>
        )}
        {isActive && (
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', letterSpacing: 0.8 }}>
            回合：{gameState?.turn === 'white' ? '♔ 白方（你）' : '♚ 黑方（叶瑄）'}
            {loading && ' · 等待中…'}
          </span>
        )}
      </div>

      {/* board + info */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ChessBoard
          board={displayBoard}
          selected={selected}
          legalTargets={legalTargets}
          onSquareClick={handleSquareClick}
          disabled={!isActive || loading || gameState?.turn !== 'white'}
        />

        {/* side panel */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          minWidth: 160, maxWidth: 220,
        }}>
          {isActive && (
            <div style={{
              padding: '12px 14px',
              background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', borderRadius: 8,
            }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>
                操作说明
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.8 }}>
                <div>你: ♔ 白方</div>
                <div>叶瑄: ♚ 黑方</div>
              </div>
              <div className="mono" style={{ marginTop: 10, fontSize: 10, color: 'var(--ink-3)', letterSpacing: 0.5 }}>
                点击棋子选中，<br />再点击目标格移动。
              </div>
            </div>
          )}

          {/* move history */}
          {gameState?.move_history && gameState.move_history.length > 0 && (
            <div style={{
              padding: '12px 14px',
              background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', borderRadius: 8,
              maxHeight: 200, overflowY: 'auto',
            }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>
                走棋记录
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.9 }}>
                {gameState.move_history.map((m, i) => (
                  <span key={i} style={{ marginRight: 6 }}>
                    {i % 2 === 0 && (
                      <span style={{ color: 'var(--ink-4)', marginRight: 2 }}>
                        {Math.floor(i / 2) + 1}.
                      </span>
                    )}
                    {m}{' '}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
