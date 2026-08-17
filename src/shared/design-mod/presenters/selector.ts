/** Creates a narrow snapshot subscription so unrelated presenter fields do not redraw a Mod consumer. */
export function selectPresenterSnapshot<TSnapshot, TSelected>(
  getSnapshot: () => TSnapshot,
  subscribe: (listener: () => void) => () => void,
  selector: (snapshot: TSnapshot) => TSelected,
  listener: () => void,
  equal: (first: TSelected, second: TSelected) => boolean = Object.is,
): () => void {
  let current = selector(getSnapshot());
  return subscribe(() => {
    const next = selector(getSnapshot());
    if (equal(current, next)) return;
    current = next;
    listener();
  });
}
