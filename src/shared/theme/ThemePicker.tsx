import { useEffect, useState } from 'react';
import { getCurrentThemeId, getDayNight, listThemes, setSlotTheme, setTheme, subscribe } from './registry';
import type { ThemeRecord } from './types';

interface ThemePickerProps {
  onChange?: (id: string) => void;
  slot?: 'day' | 'night';
}

export function ThemePicker({ onChange, slot }: ThemePickerProps) {
  const [themes, setThemes] = useState<ThemeRecord[]>([]);
  const [current, setCurrent] = useState(() => {
    if (slot) {
      const dn = getDayNight();
      return slot === 'day' ? dn.day : dn.night;
    }
    return getCurrentThemeId();
  });

  useEffect(() => {
    let active = true;
    listThemes().then(result => { if (active) setThemes(result); });
    return subscribe(() => {
      if (!active) return;
      if (slot) {
        const dn = getDayNight();
        setCurrent(slot === 'day' ? dn.day : dn.night);
      } else {
        setCurrent(getCurrentThemeId());
      }
    });
  }, [slot]);

  const choose = async (id: string) => {
    if (slot) {
      await setSlotTheme(slot, id);
      const dn = getDayNight();
      setCurrent(slot === 'day' ? dn.day : dn.night);
    } else {
      await setTheme(id);
      setCurrent(getCurrentThemeId());
    }
    onChange?.(id);
  };

  return (
    <select
      value={current}
      onChange={event => choose(event.target.value).catch(console.warn)}
      style={{
        width: 210, padding: '6px 9px',
        border: '1px solid var(--paper-edge)', borderRadius: 4,
        background: 'var(--paper-2)', color: 'var(--ink-2)',
        fontFamily: 'inherit', fontSize: 11,
      }}
    >
      {(['light', 'dark'] as const).map(base => {
        const options = themes.filter(record => record.manifest.base === base);
        return options.length > 0 ? (
          <optgroup key={base} label={base === 'light' ? '亮色主题' : '暗色主题'}>
            {options.map(record => (
              <option key={record.manifest.id} value={record.manifest.id}>
                {record.manifest.name}{record.source === 'disk' && !['paper', 'dark'].includes(record.manifest.id) ? ' · Mod' : ''}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
      {themes.filter(record => !record.manifest.base).map(record => (
        <option key={record.manifest.id} value={record.manifest.id}>{record.manifest.name} · Mod</option>
      ))}
    </select>
  );
}
