export function activate(host) {
  const mounts = new Map();
  const cleanups = [];
  const drag = new Map();
  const idToClass = {
    'chat.ribbon': 'design-fixture-ribbon',
    'chat.header': 'design-fixture-header',
    'chat.transcript': 'design-fixture-transcript',
    'chat.composer': 'design-fixture-composer',
    'chat.sidebar.flow': 'design-fixture-flow',
    'chat.sidebar.garden': 'design-fixture-garden',
    'chat.sidebar.diary': 'design-fixture-diary',
    'chat.sidebar.status': 'design-fixture-status'
  };
  const attach = (id) => {
    const mount = document.createElement('div');
    mount.className = 'design-fixture-mount ' + idToClass[id];
    mount.dataset.designComponent = id;
    host.layers.components.appendChild(mount);
    host.components.attach(id, mount);
    mounts.set(id, mount);
    const down = (event) => {
      if (event.target !== mount) return;
      drag.set(id, { x: event.clientX, y: event.clientY, left: mount.offsetLeft, top: mount.offsetTop });
      mount.setPointerCapture?.(event.pointerId);
    };
    const move = (event) => {
      const state = drag.get(id);
      if (!state) return;
      mount.style.left = `${state.left + event.clientX - state.x}px`;
      mount.style.top = `${state.top + event.clientY - state.y}px`;
      host.geometry.flush();
    };
    const up = () => drag.delete(id);
    mount.addEventListener('pointerdown', down);
    mount.addEventListener('pointermove', move);
    mount.addEventListener('pointerup', up);
    mount.addEventListener('pointercancel', up);
    cleanups.push(() => {
      mount.removeEventListener('pointerdown', down);
      mount.removeEventListener('pointermove', move);
      mount.removeEventListener('pointerup', up);
      mount.removeEventListener('pointercancel', up);
      host.components.detach(id);
      mount.remove();
    });
  };
  ['chat.ribbon', 'chat.header', 'chat.transcript', 'chat.composer', 'chat.sidebar.flow', 'chat.sidebar.garden', 'chat.sidebar.diary', 'chat.sidebar.status'].forEach(attach);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, innerWidth)} ${Math.max(1, innerHeight)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;';
  host.layers.overlay.appendChild(svg);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'var(--accent)');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '7 8');
  svg.appendChild(line);
  cleanups.push(() => svg.remove());

  const decorationRoot = document.createElement('div');
  decorationRoot.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  host.layers.overlay.appendChild(decorationRoot);
  const pixels = [];
  for (let i = 0; i < 72; i += 1) {
    const pixel = document.createElement('span');
    pixel.className = 'design-fixture-decoration';
    pixel.style.left = `${72 + (i % 12) * 9}px`;
    pixel.style.top = `${112 + Math.floor(i / 12) * 9}px`;
    pixel.style.opacity = `${0.25 + (i % 5) * 0.12}`;
    decorationRoot.appendChild(pixel);
    pixels.push(pixel);
  }
  cleanups.push(() => decorationRoot.remove());

  const center = (id) => {
    const rect = host.geometry.get(id);
    return rect ? { x: rect.rect.left + rect.rect.width / 2, y: rect.rect.top + rect.rect.height / 2 } : null;
  };
  const updateLine = () => {
    const a = center('chat.sidebar.flow');
    const b = center('chat.sidebar.garden');
    const c = center('chat.sidebar.status');
    if (!a || !b || !c) return;
    line.setAttribute('d', `M ${a.x} ${a.y} C ${a.x + 60} ${a.y + 30}, ${b.x - 40} ${b.y - 30}, ${b.x} ${b.y} S ${c.x - 50} ${c.y - 20}, ${c.x} ${c.y}`);
  };
  ['chat.sidebar.flow', 'chat.sidebar.garden', 'chat.sidebar.diary', 'chat.sidebar.status', 'chat.header', 'chat.transcript'].forEach(id => {
    cleanups.push(host.geometry.observe(id, updateLine));
  });
  const resize = () => { svg.setAttribute('viewBox', `0 0 ${Math.max(1, innerWidth)} ${Math.max(1, innerHeight)}`); host.geometry.flush(); updateLine(); };
  addEventListener('resize', resize);
  cleanups.push(() => removeEventListener('resize', resize));

  const onSession = () => {
    const count = Math.min(pixels.length, Math.max(3, Math.floor(host.signals.chat.get().elapsedMs / 12000)));
    pixels.forEach((pixel, index) => { pixel.style.transform = index < count ? 'scale(1)' : 'scale(.35)'; });
  };
  cleanups.push(host.signals.chat.subscribe(onSession));
  cleanups.push(host.signals.nativeWindow.subscribe(() => {
    const motion = host.signals.nativeWindow.get();
    mounts.forEach((mount, id) => {
      if (id === 'chat.sidebar.flow' || id === 'chat.sidebar.garden') mount.style.translate = `${motion.velocity.x * 0.04}px ${motion.velocity.y * 0.04}px`;
    });
  }));

  let frame = 0;
  const animate = () => {
    updateLine();
    frame = requestAnimationFrame(animate);
  };
  frame = requestAnimationFrame(animate);
  cleanups.push(() => cancelAnimationFrame(frame));
  onSession();
  return () => cleanups.splice(0).reverse().forEach(cleanup => cleanup());
}
