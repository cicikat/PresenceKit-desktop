import { useEffect, useState } from 'react';
import type { DesignPresenter } from './base';

export function usePresenterSnapshot<TSnapshot extends { updatedAt: number }, TCommands>(
  presenter: DesignPresenter<TSnapshot, TCommands>,
  consumerId: string,
): TSnapshot {
  const [snapshot, setSnapshot] = useState(() => presenter.get());
  useEffect(() => {
    setSnapshot(presenter.get());
    const unsubscribe = presenter.subscribe(() => setSnapshot(presenter.get()));
    const release = presenter.acquire(consumerId);
    return () => { unsubscribe(); release(); };
  }, [consumerId, presenter]);
  return snapshot;
}
