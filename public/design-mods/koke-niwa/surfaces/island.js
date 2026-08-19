const PX = 3;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function activate(host) {
  const root = document.createElement('section');
  root.className = 'koke-island-root';
  const art = document.createElement('div');
  art.className = 'koke-bell-art';
  const canvas = document.createElement('canvas');
  canvas.className = 'koke-bell-canvas';
  art.appendChild(canvas);
  const actions = document.createElement('div');
  actions.className = 'koke-bell-actions';
  const preferences = document.createElement('button');
  preferences.className = 'koke-bell-action';
  preferences.type = 'button';
  preferences.textContent = '·';
  preferences.title = 'Preferences';
  preferences.setAttribute('aria-label', 'Open preferences');
  const close = document.createElement('button');
  close.className = 'koke-bell-action';
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Close sidebar';
  close.setAttribute('aria-label', 'Close sidebar');
  actions.append(preferences, close);
  const strip = document.createElement('button');
  strip.className = 'koke-bell-strip';
  strip.type = 'button';
  strip.textContent = '↘';
  strip.title = 'Open flow';
  strip.setAttribute('aria-label', 'Open flow');
  root.append(art, actions, strip);
  host.layers.components.appendChild(root);
  const context = canvas.getContext('2d');
  let snapshot = null;
  let disposed = false;

  const drawBell = () => {
    if (!context) return;
    const dpi = snapshot?.surface.bounds.dpi || 1;
    const width = 52;
    const height = 82;
    canvas.width = width * PX * dpi;
    canvas.height = height * PX * dpi;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpi, 0, 0, dpi, 0, 0);
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#565c55';
    context.fillRect(22, 8, 8, 5);
    context.fillRect(18, 13, 16, 4);
    context.fillStyle = '#3a3f3b';
    context.fillRect(12, 20, 28, 28);
    context.fillRect(8, 28, 36, 10);
    context.fillStyle = '#f2c46d';
    context.fillRect(18, 24, 16, 18);
    context.fillStyle = '#1d3320';
    context.fillRect(21, 27, 10, 12);
    context.fillStyle = '#6fa352';
    context.fillRect(10, 47, 32, 4);
    context.fillRect(21, 51, 10, 20);
    context.fillStyle = '#f2c46d';
    context.fillRect(24, 69, 4, 9);
    context.fillRect(21, 76, 10, 3);
  };

  const request = (command, params) => {
    root.dataset.ack = 'pending';
    void host.commands.request(command, params).then(() => {
      if (!disposed) root.dataset.ack = 'true';
    }).catch(() => {
      if (!disposed) root.dataset.ack = 'error';
    });
  };
  preferences.onclick = () => request('openPreferences', {});
  close.onclick = () => request('closeSidebar', {});
  strip.onclick = () => request('setSidebarTab', { tab: 'flow' });

  const render = () => {
    snapshot = host.snapshot.get();
    if (!snapshot) return;
    const velocity = snapshot.window?.paused ? { x: 0, y: 0 } : (snapshot.nativeWindow?.velocity ?? { x: 0, y: 0 });
    const x = Number(velocity.x ?? 0);
    const y = Number(velocity.y ?? 0);
    art.style.transform = `rotate(${clamp(x * 0.08 + y * 0.025, -12, 12)}deg)`;
    root.dataset.paused = snapshot.window.paused ? 'true' : 'false';
    drawBell();
  };
  const stop = host.snapshot.subscribe(render);
  render();
  return () => {
    disposed = true;
    stop();
    preferences.onclick = null;
    close.onclick = null;
    strip.onclick = null;
    root.remove();
  };
}
