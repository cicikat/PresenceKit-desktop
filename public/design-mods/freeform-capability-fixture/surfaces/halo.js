export function activate(host) {
  const root = document.createElement('div');
  root.className = 'design-fixture-halo';
  const ring = document.createElement('div');
  ring.className = 'design-fixture-halo__ring';
  const label = document.createElement('span');
  label.className = 'design-fixture-halo__label';
  label.textContent = 'OWNED HALO · PASSTHROUGH';
  root.append(ring, label);
  host.layers.components.appendChild(root);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('design-fixture-halo__links');
  const mainLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const rightLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const topLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  [mainLine, rightLine, topLine].forEach(line => { line.setAttribute('fill', 'none'); svg.appendChild(line); });
  host.layers.overlay.appendChild(svg);
  const render = () => {
    const snapshot = host.snapshot.get();
    if (!snapshot) return;
    const dpi = snapshot.main.bounds.dpi || 1;
    const origin = { x: snapshot.main.bounds.x - 240 * dpi, y: snapshot.main.bounds.y - 240 * dpi };
    const center = { x: (snapshot.main.bounds.x + snapshot.main.bounds.width / 2 - origin.x), y: (snapshot.main.bounds.y + snapshot.main.bounds.height / 2 - origin.y) };
    const main = { x: snapshot.main.bounds.x - origin.x, y: snapshot.main.bounds.y - origin.y, width: snapshot.main.bounds.width, height: snapshot.main.bounds.height };
    mainLine.setAttribute('d', `M ${center.x} ${center.y} L ${main.x} ${main.y}`);
    const point = id => snapshot.anchors[id];
    const right = point('chat.sidebar.flow');
    const top = point('chat.header');
    if (right) rightLine.setAttribute('d', `M ${center.x} ${center.y} L ${right.x - origin.x} ${right.y - origin.y}`);
    if (top) topLine.setAttribute('d', `M ${center.x} ${center.y} L ${top.x - origin.x} ${top.y - origin.y}`);
    const pointerX = snapshot.main.bounds.x + snapshot.pointer.x * dpi;
    const pointerY = snapshot.main.bounds.y + snapshot.pointer.y * dpi;
    root.dataset.nearMain = pointerX >= snapshot.main.bounds.x && pointerX <= snapshot.main.bounds.x + snapshot.main.bounds.width && pointerY >= snapshot.main.bounds.y && pointerY <= snapshot.main.bounds.y + snapshot.main.bounds.height ? 'true' : 'false';
    label.textContent = snapshot.window.paused ? 'OWNED HALO · PAUSED' : 'OWNED HALO · PASSTHROUGH';
  };
  const stop = host.snapshot.subscribe(render);
  render();
  return () => { stop(); root.remove(); svg.remove(); };
}
