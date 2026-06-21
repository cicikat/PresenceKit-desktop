export type HudPillTone =
  | 'emotion'
  | 'boundary'
  | 'intimacy'
  | 'obsession'
  | 'scene'
  | 'neutral';

interface HudPillProps {
  value: string;
  tone?: HudPillTone;
  labelMap?: Record<string, string>;
}

export function HudPill({ value, tone = 'emotion', labelMap }: HudPillProps) {
  const display = (labelMap ? (labelMap[value] ?? value) : value) || '—';
  return (
    <span className={`dream-hud__pill dream-hud__pill--${tone}`}>
      {display}
    </span>
  );
}
