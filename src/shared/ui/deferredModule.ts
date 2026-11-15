/** Code-only resource: preload never mounts a component or starts its effects. */
export function deferredModule<T>(loader: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  let value: T;
  let ready = false;
  const preload = () => {
    if (!pending) pending = loader().then(result => {
      value = result;
      ready = true;
      return result;
    });
    return pending;
  };
  return {
    preload,
    peek(): T | undefined { return ready ? value : undefined; },
  };
}
