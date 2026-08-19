const PX = 3;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

export function activate(host) {
  const root = document.createElement('div');
  root.className = 'koke-halo-root';
  const canvas = document.createElement('canvas');
  canvas.className = 'koke-halo-canvas';
  root.appendChild(canvas);
  host.layers.components.appendChild(root);
  const context = canvas.getContext('2d');
  const particles = Array.from({ length: 5 }, (_, index) => {
    const seed = hash(`koke-halo-${index}`);
    return { x: 0.15 + (seed % 70) / 100, y: 0.14 + ((seed >>> 8) % 58) / 100, phase: (seed >>> 16) % 628 / 100, drift: 0.000025 + ((seed >>> 22) % 7) * 0.000004 };
  });
  let snapshot = null;
  let frame = 0;
  let disposed = false;

  const resize = () => {
    if (!snapshot) return;
    const dpi = snapshot.surface.bounds.dpi || 1;
    const width = Math.max(1, snapshot.surface.bounds.width);
    const height = Math.max(1, snapshot.surface.bounds.height);
    canvas.width = Math.round(width * dpi);
    canvas.height = Math.round(height * dpi);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  };

  const paint = time => {
    frame = 0;
    if (disposed || !context || !snapshot || snapshot.window.paused) return;
    const width = Math.max(1, snapshot.surface.bounds.width);
    const height = Math.max(1, snapshot.surface.bounds.height);
    const dpi = snapshot.surface.bounds.dpi || 1;
    const aura = Number(snapshot.presenters?.status?.telemetry?.moodAura ?? 20) / 100;
    const originX = snapshot.surface.bounds.x;
    const originY = snapshot.surface.bounds.y;
    context.setTransform(dpi, 0, 0, dpi, 0, 0);
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
    particles.forEach((particle, index) => {
      const wave = Math.sin(time * particle.drift + particle.phase);
      const x = clamp(width * particle.x + wave * 18, PX, width - PX * 2);
      const y = clamp(height * particle.y + Math.cos(time * particle.drift * 0.7 + particle.phase) * 12, PX, height - PX * 2);
      const nearMain = snapshot.main && x + originX >= snapshot.main.bounds.x - 32 && x + originX <= snapshot.main.bounds.x + snapshot.main.bounds.width + 32;
      context.fillStyle = nearMain ? `rgba(242,196,109,${0.30 + aura * 0.42})` : `rgba(111,163,82,${0.18 + aura * 0.24})`;
      context.fillRect(Math.round(x / PX) * PX, Math.round(y / PX) * PX, PX, PX);
      if (index % 2 === 0) context.fillRect(Math.round(x / PX) * PX - PX, Math.round(y / PX) * PX + PX, PX, PX);
    });
    frame = requestAnimationFrame(paint);
  };

  const render = () => {
    snapshot = host.snapshot.get();
    if (!snapshot) return;
    resize();
    root.dataset.paused = snapshot.window.paused ? 'true' : 'false';
    if (!snapshot.window.paused && !frame) frame = requestAnimationFrame(paint);
  };

  const stop = host.snapshot.subscribe(render);
  render();
  return () => {
    disposed = true;
    stop();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    canvas.remove();
    root.remove();
  };
}
