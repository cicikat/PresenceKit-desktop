/* SubGarden — 陪伴花园 panel (Phase 2d.5c) */

import { useState, useEffect } from 'react';
import { Tag, Btn, MicroLabel } from './UIKit';
import { loadGardenState } from '../../../shared/api/backend';
import { waterGarden } from '../../../shared/api/runtimeSettings';
import type { GardenState, GardenSlot } from '../../../shared/api/types';
import { normalizeGardenState } from '../../../shared/api/stateResponseNormalization';
import { chatThemeFontSize } from '../../../shared/chatAppearance';

const FLOWER_COLOR: Record<string, string> = {
  calm:    'var(--flower-calm)',
  bright:  'var(--flower-bright)',
  low:     'var(--flower-low)',
  yandere: 'var(--flower-yandere)',
  adrift:  'var(--flower-adrift)',
};

const FLOWER_HUE: Record<string, number> = {
  calm:    85,
  bright:  55,
  low:     230,
  yandere: 20,
  adrift:  295,
};

export function SubGarden() {
  const [data, setData] = useState<GardenState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [watering, setWatering] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const result = normalizeGardenState(await loadGardenState());
      if (!result) throw new Error('花园状态响应格式无效');
      setData(result);
      setError(null);
    } catch (e: any) {
      console.error('loadGardenState failed:', e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const h = setInterval(fetchData, 30_000);
    return () => clearInterval(h);
  }, []);

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(11), color: 'var(--on-forest-2)', letterSpacing: 1.2 }}>加载中…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
      }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(11), color: 'var(--on-forest-2)', letterSpacing: 1.2, textAlign: 'center' }}>
          {error || '无数据'}
        </span>
        <Btn onClick={() => { setLoading(true); fetchData(); }}>重试</Btn>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 14px 18px', overflowY: 'auto', height: '100%' }}>
      <div className="serif" style={{
        fontSize: chatThemeFontSize(12.5), color: 'var(--on-forest-2)',
        marginBottom: 12, lineHeight: 1.6, fontStyle: 'italic',
      }}>
        每种心情都让对应的植物多长出一点。它在你不看的时候，也在生长。
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Btn onClick={async () => {
          if (watering) return;
          setWatering(true); setActionStatus(null);
          try { await waterGarden(); await fetchData(); setActionStatus('已经浇过了。'); }
          catch (e) { setActionStatus(`浇水失败：${String(e)}`); }
          finally { setWatering(false); }
        }}>{watering ? '浇水中…' : '给花园浇水'}</Btn>
        <MicroLabel style={{ color: 'var(--on-forest-2)' }}>
          收获 {data.harvest_count ?? 0} · 花瓶 {data.vase_count ?? 0}
        </MicroLabel>
      </div>
      {actionStatus && <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', marginBottom: 10 }}>{actionStatus}</div>}      <div style={{ display: 'grid', gap: 10 }}>
        {(data.slots ?? []).map(slot => (
          <SlotCard key={slot.slot_key} slot={slot} />
        ))}
      </div>
    </div>
  );
}

function SlotCard({ slot }: { slot: GardenSlot }) {
  const color = FLOWER_COLOR[slot.slot_key] ?? 'var(--flower-default)';
  const hue = FLOWER_HUE[slot.slot_key];
  const isBloom = slot.stage === 'bloom';

  return (
    <div style={{
      padding: '12px 14px',
      background: 'oklch(0.27 0.04 168)',
      border: isBloom
        ? `1px solid ${color}66`
        : '1px solid var(--forest-line)',
      borderRadius: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <FlowerSVG flowerId={slot.flower_id} stage={slot.stage} color={color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
            <span className="serif" style={{ fontSize: chatThemeFontSize(15), fontWeight: 600, color: 'var(--on-forest)' }}>
              {slot.name}
            </span>
            <span className="serif" style={{ fontSize: chatThemeFontSize(12), color: 'var(--on-forest-2)', fontStyle: 'italic' }}>
              · {slot.en_name}
            </span>
            {isBloom && <Tag hue={hue} size="sm">盛开</Tag>}
          </div>
          <GrowthBar progress={slot.stage_progress} color={color} />
          <MicroLabel style={{ color: 'var(--on-forest-2)', marginTop: 4, fontSize: chatThemeFontSize(9.5), letterSpacing: 1.2 }}>
            {slot.slot_key.toUpperCase()} · {slot.stage.toUpperCase()}
          </MicroLabel>
        </div>
      </div>
    </div>
  );
}

function GrowthBar({ progress, color }: { progress: number; color: string }) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div style={{
      position: 'relative', height: 6,
      background: 'oklch(0.22 0.03 168)',
      border: '1px solid var(--forest-line)',
      borderRadius: 3, overflow: 'hidden',
    }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.5s ease' }} />
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${(i + 1) * 10}%`, width: 1,
          background: 'oklch(0.50 0.02 168 / 0.15)',
        }} />
      ))}
    </div>
  );
}

function FlowerSVG({ flowerId, stage, color }: { flowerId: string; stage: string; color: string }) {
  const stemH = stage === 'seed' ? 0 : stage === 'sprout' ? 12 : stage === 'budding' ? 24 : 36;
  const tipY = 54 - stemH;

  return (
    <svg width="48" height="60" viewBox="0 0 48 60" style={{ flexShrink: 0 }}>
      <rect x="4" y="54" width="40" height="4" rx="1" fill="oklch(0.28 0.04 60)" />
      {stemH > 0 && (
        <line x1="24" y1="54" x2="24" y2={tipY}
          stroke="oklch(0.55 0.10 145)" strokeWidth="1.6" strokeLinecap="round" />
      )}
      {(stage === 'budding' || stage === 'bloom') && (
        <path
          d={`M 24 ${54 - stemH * 0.45} q -8 -2 -10 -8 q 6 -1 10 8`}
          fill="oklch(0.52 0.10 145)"
        />
      )}
      {stage === 'seed' && (
        <ellipse cx="24" cy="51" rx="3.5" ry="2" fill={color} opacity="0.5" />
      )}
      {stage === 'sprout' && (
        <circle cx="24" cy={tipY} r="3.5" fill={color} opacity="0.7" />
      )}
      {(stage === 'budding' || stage === 'bloom') && (
        <FlowerHead flowerId={flowerId} stage={stage} tipY={tipY} color={color} />
      )}
    </svg>
  );
}

function FlowerHead({ flowerId, stage, tipY, color }: {
  flowerId: string; stage: string; tipY: number; color: string;
}) {
  if (stage === 'budding') {
    switch (flowerId) {
      case 'daisy':
        return <circle cx="24" cy={tipY} r="5" fill={color} opacity="0.85" />;
      case 'sunflower':
        return <circle cx="24" cy={tipY} r="6" fill={color} opacity="0.85" />;
      case 'bluebell':
        return (
          <path d={`M 24 ${tipY} q -3 1 -3 7 q 3 2 6 0 q 0 -6 -3 -7 z`}
            fill={color} opacity="0.85" />
        );
      case 'rose':
        return <ellipse cx="24" cy={tipY + 3} rx="4" ry="6" fill={color} opacity="0.85" />;
      case 'dandelion':
        return <circle cx="24" cy={tipY} r="5" fill={color} opacity="0.8" />;
      default:
        return <circle cx="24" cy={tipY} r="5" fill={color} opacity="0.85" />;
    }
  }

  // bloom
  switch (flowerId) {
    case 'daisy': {
      const petals = Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const px = 24 + Math.cos(a) * 9;
        const py = tipY + Math.sin(a) * 9;
        return (
          <ellipse key={i} cx={px} cy={py} rx="4" ry="2.5"
            transform={`rotate(${i * 45}, ${px}, ${py})`}
            fill={color} opacity="0.85" />
        );
      });
      return (
        <>
          {petals}
          <circle cx="24" cy={tipY} r="5" fill={color} />
          <circle cx="24" cy={tipY} r="2.5" fill="oklch(0.95 0.10 80)" />
        </>
      );
    }
    case 'sunflower': {
      const petals = Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const px = 24 + Math.cos(a) * 10;
        const py = tipY + Math.sin(a) * 10;
        return (
          <ellipse key={i} cx={px} cy={py} rx="4.5" ry="2.5"
            transform={`rotate(${i * 36}, ${px}, ${py})`}
            fill={color} opacity="0.9" />
        );
      });
      return (
        <>
          {petals}
          <circle cx="24" cy={tipY} r="7" fill={color} />
          <circle cx="24" cy={tipY} r="4.5" fill="oklch(0.25 0.04 60)" />
          <circle cx="22" cy={tipY - 1} r="0.8" fill="oklch(0.55 0.06 60)" />
          <circle cx="25.5" cy={tipY + 1} r="0.8" fill="oklch(0.55 0.06 60)" />
          <circle cx="23" cy={tipY + 2.5} r="0.8" fill="oklch(0.55 0.06 60)" />
        </>
      );
    }
    case 'bluebell':
      return (
        <path
          d={`M 24 ${tipY} q -6 3 -6 12 q 6 4 12 0 q 0 -9 -6 -12 z`}
          fill={color} opacity="0.85"
        />
      );
    case 'rose':
      return (
        <>
          <circle cx="24" cy={tipY} r="9" fill={color} opacity="0.22" />
          <circle cx="24" cy={tipY} r="6.5" fill={color} opacity="0.42" />
          <circle cx="24" cy={tipY} r="4.5" fill={color} opacity="0.68" />
          <circle cx="24" cy={tipY} r="2.5" fill={color} />
        </>
      );
    case 'dandelion': {
      const rays = Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const x2 = 24 + Math.cos(a) * 12;
        const y2 = tipY + Math.sin(a) * 12;
        return (
          <g key={i}>
            <line x1="24" y1={tipY} x2={x2} y2={y2}
              stroke={color} strokeWidth="0.8" opacity="0.8" />
            <circle cx={x2} cy={y2} r="1.5" fill={color} opacity="0.9" />
          </g>
        );
      });
      return (
        <>
          {rays}
          <circle cx="24" cy={tipY} r="2.5" fill={color} />
        </>
      );
    }
    default:
      return <circle cx="24" cy={tipY} r="6" fill={color} />;
  }
}
