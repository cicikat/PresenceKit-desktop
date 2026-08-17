export function activate(host) {
  const root = document.createElement('section');
  root.className = 'design-fixture-island';
  const title = document.createElement('div');
  title.className = 'design-fixture-island__title';
  title.textContent = host.surfaceId === 'top-island' ? 'FLOW / PRESENTER' : 'STATUS / PRESENTER';
  const body = document.createElement('div');
  body.className = 'design-fixture-island__body';
  const actions = document.createElement('div');
  actions.className = 'design-fixture-island__actions';
  const ack = document.createElement('span');
  ack.className = 'design-fixture-island__ack';
  ack.textContent = 'ready';
  const makeButton = (text, command, params) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.onclick = () => host.commands.request(command, params).then(() => { ack.textContent = 'ack'; }).catch(error => { ack.textContent = error.message; });
    return button;
  };
  actions.append(makeButton('flow', 'setSidebarTab', { tab: 'flow' }), makeButton('prefs', 'openPreferences', {}));
  root.append(title, body, actions, ack);
  host.layers.components.appendChild(root);
  const render = () => {
    const snapshot = host.snapshot.get();
    if (!snapshot) return;
    const presenter = host.surfaceId === 'top-island' ? snapshot.presenters.flow : snapshot.presenters.status;
    const text = presenter && typeof presenter === 'object' ? presenter : {};
    body.textContent = host.surfaceId === 'top-island'
      ? String(text.narrative || text.focus?.label || 'waiting for flow')
      : `${String(text.mood?.label || 'mood')} · ${String(text.presence?.id || 'presence')}`;
    root.dataset.paused = snapshot.window.paused ? 'true' : 'false';
  };
  const stop = host.snapshot.subscribe(render);
  render();
  return () => { stop(); root.remove(); };
}
