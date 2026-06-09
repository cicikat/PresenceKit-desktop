import type { ActivityTab } from './ActivityRibbon';

interface ActivityCard {
  tab: ActivityTab;
  title: string;
  subtitle: string;
  icon: string;
}

const CARDS: ActivityCard[] = [
  { tab: 'reading', title: '一起看书', subtitle: '载入 PDF 或文本，逐页阅读。', icon: '📖' },
  { tab: 'gomoku',  title: '五子棋',   subtitle: '15×15 棋盘，五子连线获胜。', icon: '⚫' },
  { tab: 'chess',   title: '国际象棋', subtitle: '标准规则，点选移动棋子。',   icon: '♟' },
];

export function ActivityHomePage({ onSelect }: { onSelect: (tab: ActivityTab) => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '40px 40px', gap: 32,
      background: 'var(--paper)', color: 'var(--ink)',
      overflowY: 'auto',
    }}>
      <div>
        <div className="serif" style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5, marginBottom: 6 }}>
          一起做事
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: 1.2, fontWeight: 600 }}>
          ACTIVITIES · 选择一项活动开始
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {CARDS.map(card => (
          <button
            key={card.tab}
            onClick={() => onSelect(card.tab)}
            style={{
              width: 200, padding: '22px 20px',
              background: 'var(--paper-2)',
              border: '1px solid var(--paper-edge)',
              borderRadius: 10,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'box-shadow 0.15s, border-color 0.15s',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 2px var(--accent)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--paper-edge)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: 32, lineHeight: 1 }}>{card.icon}</div>
            <div>
              <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                {card.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.55 }}>
                {card.subtitle}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
