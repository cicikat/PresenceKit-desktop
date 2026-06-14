import { useState, useEffect, useCallback } from 'react';
import {
  gomokuApi,
  type GomokuState,
  type GomokuCell,
  type GomokuLastMove,
  type GomokuOpponent,
  type GomokuAiStyle,
} from '../../../shared/api/activity-api';
import { ActivityCompanionPanel } from './ActivityCompanionPanel';

const BOARD_SIZE = 15;
const CELL = 34;
const PAD = 17;
const BOARD_PX = (BOARD_SIZE - 1) * CELL + PAD * 2;

const AI_STYLE_LABELS: Record<GomokuAiStyle, string> = {
  balanced: '均衡',
  gentle:   '温和',
  serious:  '认真',
  teaching: '教学',
};

function normalizeGomokuState(
  raw: Omit<GomokuState, 'session_id'> & { session_id?: string | null },
  previous?: GomokuState | null,
): GomokuState {
  return {
    session_id: raw.session_id ?? previous?.session_id ?? null,
    board: raw.board,
    current_turn: raw.current_turn,
    winner: raw.winner ?? null,
    status: raw.status,
    last_move: raw.last_move ?? null,
    opponent: raw.opponent ?? previous?.opponent ?? null,
    ai_player: raw.ai_player ?? previous?.ai_player ?? null,
    ai_style: raw.ai_style ?? previous?.ai_style ?? null,
  };
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

function Select({ value, onChange, children, disabled }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        fontFamily: 'inherit', fontSize: 12, padding: '5px 8px',
        borderRadius: 'var(--radius-sm)', border: '1px solid var(--paper-edge)',
        background: 'var(--paper-2)', color: 'var(--ink)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >{children}</select>
  );
}

function GomokuBoard({
  board,
  lastMove,
  onPlace,
  disabled,
}: {
  board: GomokuCell[][];
  lastMove: GomokuLastMove | null;
  onPlace: (row: number, col: number) => void;
  disabled: boolean;
}) {
  return (
    <div style={{
      position: 'relative',
      width: BOARD_PX, height: BOARD_PX,
      background: 'var(--goban-bg)',
      border: '2px solid var(--goban-line)',
      borderRadius: 'var(--radius-sm)',
      userSelect: 'none',
      flexShrink: 0,
    }}>
      <svg
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        width={BOARD_PX} height={BOARD_PX}
      >
        {Array.from({ length: BOARD_SIZE }).map((_, i) => (
          <g key={i}>
            <line
              x1={PAD} y1={PAD + i * CELL}
              x2={PAD + (BOARD_SIZE - 1) * CELL} y2={PAD + i * CELL}
              stroke="var(--goban-line)" strokeWidth={0.8}
            />
            <line
              x1={PAD + i * CELL} y1={PAD}
              x2={PAD + i * CELL} y2={PAD + (BOARD_SIZE - 1) * CELL}
              stroke="var(--goban-line)" strokeWidth={0.8}
            />
          </g>
        ))}
        {[[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]].map(([r,c]) => (
          <circle key={`${r}-${c}`}
            cx={PAD + c * CELL} cy={PAD + r * CELL}
            r={3} fill="var(--goban-line)"
          />
        ))}
        {lastMove && (
          <circle
            cx={PAD + lastMove.x * CELL} cy={PAD + lastMove.y * CELL}
            r={5} fill="none" stroke="red" strokeWidth={1.5}
          />
        )}
      </svg>

      {Array.from({ length: BOARD_SIZE }).map((_, row) =>
        Array.from({ length: BOARD_SIZE }).map((_, col) => {
          const stone = board[row]?.[col] ?? null;
          return (
            <div
              key={`${row}-${col}`}
              onClick={() => {
                if (disabled || stone) return;
                onPlace(row, col);
              }}
              style={{
                position: 'absolute',
                left: PAD + col * CELL - CELL / 2,
                top: PAD + row * CELL - CELL / 2,
                width: CELL, height: CELL,
                cursor: disabled || !!stone ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {stone && (
                <div style={{
                  width: CELL - 6, height: CELL - 6,
                  borderRadius: '50%',
                  background: stone === 'black'
                    ? 'radial-gradient(circle at 35% 35%, var(--stone-black-core), var(--stone-black-edge))'
                    : 'radial-gradient(circle at 35% 35%, var(--stone-white-core), var(--stone-white-edge))',
                  border: stone === 'black' ? '1px solid var(--stone-black-border)' : '1px solid var(--stone-white-border)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.45)',
                }} />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export function GomokuPage() {
  const [gameState, setGameState] = useState<GomokuState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected options (shown in pre-game panel; after start, read from gameState)
  const [selectedOpponent, setSelectedOpponent] = useState<GomokuOpponent>('yexuan_ai');
  const [selectedStyle, setSelectedStyle] = useState<GomokuAiStyle>('balanced');

  const refreshState = useCallback(async () => {
    try {
      const s = await gomokuApi.state();
      if ('active' in s && s.active === false) {
        setGameState(null);
      } else {
        setGameState(s as GomokuState);
      }
    } catch {
      setGameState(null);
    }
  }, []);

  useEffect(() => { refreshState(); }, [refreshState]);

  const handleStart = async () => {
    setLoading(true); setError(null);
    const ai_style = selectedOpponent === 'yexuan_ai' ? selectedStyle : undefined;
    console.log('[gomoku] start invoke', { opponent: selectedOpponent, ai_style });
    try {
      const s = await gomokuApi.start({ opponent: selectedOpponent, ai_style });
      console.log('[gomoku] start result', s);
      const normalized = normalizeGomokuState(s);
      console.log('[gomoku] start backend state', {
        opponent: normalized.opponent,
        ai_player: normalized.ai_player,
        ai_style: normalized.ai_style,
        current_turn: normalized.current_turn,
      });
      if (selectedOpponent === 'yexuan_ai' && normalized.opponent !== 'yexuan_ai') {
        setError('AI 对局启动失败：后端返回了本地双人模式（payload 未传达）');
        return;
      }
      setGameState(normalized);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const handlePlace = async (row: number, col: number) => {
    if (!gameState || gameState.status !== 'active' || loading || !gameState.session_id) return;
    const session_id = gameState.session_id;
    setLoading(true); setError(null);
    console.log('[gomoku] move invoke', { session_id, x: col, y: row, opponent: gameState.opponent });
    try {
      const s = await gomokuApi.move({ session_id, x: col, y: row });
      setGameState(prev => {
        const next = normalizeGomokuState(s, prev);
        console.log('[gomoku] backend state after move', {
          opponent: next.opponent,
          ai_player: next.ai_player,
          current_turn: next.current_turn,
          last_move: next.last_move,
        });
        return next;
      });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    if (!gameState?.session_id) { setGameState(null); return; }
    setLoading(true); setError(null);
    try {
      await gomokuApi.close(gameState.session_id);
      setGameState(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const isActive = gameState?.status === 'active';
  const isFinished = gameState?.status === 'completed' || !!gameState?.winner;
  const isAIMode = gameState?.opponent === 'yexuan_ai';
  // In AI mode: user plays black, AI plays white — disable board when it's white's turn
  const boardDisabled = !isActive || loading || (isAIMode && gameState?.current_turn === 'white');

  const emptyBoard: GomokuCell[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '28px 32px', gap: 20, overflowY: 'auto',
      background: 'var(--paper)', color: 'var(--ink)',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
          五子棋
        </div>
        {gameState?.status && (
          <StatusTag text={gameState.status} ok={isActive} />
        )}
        {gameState?.winner && (
          <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, letterSpacing: 0.5 }}>
            {gameState.winner === 'black' ? '黑棋' : '白棋'} 获胜！
          </span>
        )}
      </div>

      {/* mode banner */}
      <div className="mono" style={{
        fontSize: 10.5, letterSpacing: 0.4,
        padding: '5px 10px', borderRadius: 'var(--radius-sm)',
        display: 'inline-block', alignSelf: 'flex-start',
        ...(gameState
          ? isAIMode
            ? { background: 'oklch(0.96 0.04 280)', border: '1px solid oklch(0.82 0.08 280)', color: 'oklch(0.38 0.12 280)' }
            : { background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', color: 'var(--ink-3)' }
          : { background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', color: 'var(--ink-3)' }
        ),
      }}>
        {gameState
          ? isAIMode
            ? '叶瑄执白。你落子后，他会自动回应一手。'
            : '本地双人裁判模式：黑白轮流落子。'
          : selectedOpponent === 'yexuan_ai'
            ? '叶瑄执白。你落子后，他会自动回应一手。'
            : '本地双人裁判模式：黑白轮流落子。'
        }
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

      {/* pre-game settings */}
      {!isActive && !isFinished && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          padding: '14px 16px', background: 'var(--paper-2)',
          border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-md)',
          alignSelf: 'flex-start',
        }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-3)', fontWeight: 600 }}>
            对局设置
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>对手</label>
            <Select value={selectedOpponent} onChange={v => setSelectedOpponent(v as GomokuOpponent)} disabled={loading}>
              <option value="yexuan_ai">叶瑄 AI（推荐）</option>
              <option value="human">本地双人</option>
            </Select>
          </div>
          {selectedOpponent === 'yexuan_ai' && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>风格</label>
              <Select value={selectedStyle} onChange={v => setSelectedStyle(v as GomokuAiStyle)} disabled={loading}>
                <option value="balanced">均衡</option>
                <option value="gentle">温和</option>
                <option value="serious">认真</option>
                <option value="teaching">教学</option>
              </Select>
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            <Btn variant="solid" onClick={handleStart} disabled={loading}>
              {loading ? '准备中…' : '开始棋局'}
            </Btn>
          </div>
        </div>
      )}

      {/* in-game controls */}
      {(isActive || isFinished) && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {isFinished && (
            <Btn variant="solid" onClick={handleStart} disabled={loading}>再来一局</Btn>
          )}
          <Btn onClick={handleClose} disabled={loading}>结束棋局</Btn>
          {isActive && (
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', letterSpacing: 0.8 }}>
              {isAIMode && gameState?.current_turn === 'white' && loading
                ? '叶瑄思考中…'
                : `当前回合：${gameState?.current_turn === 'black' ? '⚫ 黑棋' : '⚪ 白棋'}`
              }
            </span>
          )}
        </div>
      )}

      {/* board + right column */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <GomokuBoard
          board={gameState?.board ?? emptyBoard}
          lastMove={gameState?.last_move ?? null}
          onPlace={handlePlace}
          disabled={boardDisabled}
        />

        {/* right column: info panel + companion chat */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 300, flexShrink: 0 }}>
          {/* info panel */}
          {(isActive || isFinished) && (
            <div style={{
              padding: '14px 16px',
              background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-md)',
              width: '100%',
            }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>
                对局信息
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.9 }}>
                <div>对手：{gameState?.opponent === 'yexuan_ai' ? '叶瑄 AI' : '本地双人'}</div>
                {gameState?.opponent === 'yexuan_ai' && (
                  <>
                    <div>AI 执：白棋</div>
                    <div>风格：{AI_STYLE_LABELS[gameState.ai_style as GomokuAiStyle] ?? gameState.ai_style ?? '—'}</div>
                  </>
                )}
                <div>黑棋先手</div>
              </div>
              {isActive && (
                <div className="mono" style={{ marginTop: 12, fontSize: 10, letterSpacing: 0.8, color: 'var(--ink-3)' }}>
                  {gameState?.opponent === 'yexuan_ai' ? '点击棋盘落黑棋' : '点击棋盘落子'}
                </div>
              )}
            </div>
          )}

          <ActivityCompanionPanel
            sessionId={gameState?.session_id ?? null}
            sessionActive={isActive}
            sessionFinished={isFinished}
          />
        </div>
      </div>
    </div>
  );
}
