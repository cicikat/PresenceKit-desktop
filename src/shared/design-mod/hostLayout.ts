export type DesignModHostPhase = 'builtin-default' | 'loading' | 'activating' | 'active' | 'error';

export interface DesignModHostSizeContract {
  width: '100%';
  height: '100%';
  minWidth: 0;
  minHeight: 0;
}

export interface DesignModHostLayoutState {
  phase: DesignModHostPhase;
  defaultShellVisible: boolean;
  defaultShellInteractive: boolean;
  modLayerVisible: boolean;
  modLayerInteractive: boolean;
  size: DesignModHostSizeContract;
}

const HOST_SIZE: DesignModHostSizeContract = Object.freeze({
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
});

/**
 * The default React tree remains mounted in every phase. Only the visible and
 * interactive layer changes after a Mod has completed activation.
 */
export function getDesignModHostLayoutState(phase: DesignModHostPhase): DesignModHostLayoutState {
  const modLayerVisible = phase === 'active';
  return {
    phase,
    defaultShellVisible: !modLayerVisible,
    defaultShellInteractive: !modLayerVisible,
    modLayerVisible,
    modLayerInteractive: modLayerVisible,
    size: HOST_SIZE,
  };
}
