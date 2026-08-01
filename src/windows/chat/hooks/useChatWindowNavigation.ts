import { useCallback, useEffect, useState } from 'react';
import { wsClient } from '../../../shared/api/ws';

type DreamContext = {
  mode: 'single' | 'group';
  groupId: string | null;
  roster: Record<string, { label: string; avatarDataUrl: string | null }>;
};

export function useChatWindowNavigation() {
  const [specOpen, setSpecOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [dreamWindowOpen, setDreamWindowOpen] = useState(false);
  const [dreamContext, setDreamContext] = useState<DreamContext>({ mode: 'single', groupId: null, roster: {} });
  const [dreamAfterglow, setDreamAfterglow] = useState(false);
  const [groupView, setGroupView] = useState<null | 'list' | string>(null);
  const [yandereOpen, setYandereOpen] = useState(false);

  const toggleDreamWindow = useCallback(() => {
    if (dreamWindowOpen) {
      setDreamWindowOpen(false);
      return;
    }
    setDreamAfterglow(false);
    setDreamContext({ mode: 'single', groupId: null, roster: {} });
    setDreamWindowOpen(true);
  }, [dreamWindowOpen]);

  useEffect(() => wsClient.on('dream_invite', () => {
    setDreamAfterglow(false);
    setDreamContext({ mode: 'single', groupId: null, roster: {} });
    setDreamWindowOpen(true);
  }), []);

  const closeDream = useCallback(() => {
    setDreamWindowOpen(false);
    setDreamAfterglow(true);
  }, []);

  const closeDreamAfterglow = useCallback(() => setDreamAfterglow(false), []);

  const openYandere = useCallback(() => {
    setPrefsOpen(false);
    setYandereOpen(true);
  }, []);

  const openGroupDream = useCallback((groupId: string, roster: DreamContext['roster']) => {
    setDreamAfterglow(false);
    setDreamContext({ mode: 'group', groupId, roster });
    setDreamWindowOpen(true);
  }, []);

  return {
    specOpen, setSpecOpen, prefsOpen, setPrefsOpen, dreamWindowOpen, dreamContext,
    dreamAfterglow, groupView, setGroupView, yandereOpen, setYandereOpen,
    toggleDreamWindow, closeDream, closeDreamAfterglow, openYandere, openGroupDream,
  };
}
