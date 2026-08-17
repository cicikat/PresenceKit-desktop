import { useEffect, useState } from 'react';
import { isDesignRuntimeActive, subscribeDesignMounts } from '../../../shared/design-mod/mounts';

export function useDesignRuntimeState(): boolean {
  const [value, setValue] = useState(isDesignRuntimeActive());
  useEffect(() => subscribeDesignMounts(() => setValue(isDesignRuntimeActive())), []);
  return value;
}
