import { createElement, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { deferredModule } from './deferredModule';
import { LoadingSurface } from '../window/LoadingSurface';

/** Render preloaded code synchronously; cold loads update without Suspense's reveal delay. */
export function deferredComponent<P extends object>(loader: () => Promise<{ default: ComponentType<P> }>, fallback: ReactNode = <LoadingSurface />) {
  const resource = deferredModule(loader);
  function DeferredView(props: P) {
    const [loaded, setLoaded] = useState(() => resource.peek());
    const [failure, setFailure] = useState<{ error: unknown } | null>(null); // TODO: type — normalize import failures at the shared boundary.
    const module = resource.peek() ?? loaded;
    useEffect(() => {
      if (module) return;
      let disposed = false;
      void resource.preload().then(value => {
        if (!disposed) setLoaded(value);
      }, error => {
        if (!disposed) setFailure({ error });
      });
      return () => { disposed = true; };
    }, [module]);
    if (failure) throw failure.error;
    return module ? createElement(module.default, props) : fallback;
  }
  return {
    preload: resource.preload,
    Component: DeferredView,
  };
}
