import { useCallback, useEffect, useRef, useState } from 'react';
import { controlComputerUse, getComputerUseStatus, type ComputerUseControl, type ComputerUseStatus } from '../api/computer-use';

export function useComputerUse() {
  const [status, updateStatus] = useState<ComputerUseStatus | null>(null);
  const revision = useRef(0);
  const setStatus = useCallback((value: ComputerUseStatus | null) => {
    revision.current += 1;
    updateStatus(value);
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number;
    const update = async () => {
      const version = revision.current;
      try {
        const next = await getComputerUseStatus();
        if (active && version === revision.current) updateStatus(next);
      } catch {
        if (active && version === revision.current) updateStatus(null);
      } finally {
        if (active) timer = window.setTimeout(update, 750);
      }
    };
    void update();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  const control = useCallback(async (action: ComputerUseControl) => {
    setStatus(await controlComputerUse(action));
  }, [setStatus]);
  return { status, control, setStatus };
}
