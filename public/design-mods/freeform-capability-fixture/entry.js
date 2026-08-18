export function activate(host) {
  const cleanups = [];
  const nodes = new Map();
  const edgeState = new Map();
  const growth = { value: 0, cap: 96, disposed: false };

  ['flow', 'garden', 'diary'].forEach(capability => host.components.setComposition(capability, 'subregions'));
  host.components.setComposition('status', 'subregions');

  const mountPrimitive = (id, className, options) => {
    const node = document.createElement('section');
    node.className = `fixture-node ${className}`;
    node.dataset.designPrimitive = id;
    const content = document.createElement('div');
    content.className = 'fixture-node__content';
    node.appendChild(content);
    const scene = host.scene.create(node, { sourcePrimitive: id, pointerMode: 'auto', ...options });
    host.components.attach(id, content);
    const pointer = { x: 0, y: 0, drag: null };
    const down = event => {
      if (event.target.closest?.('button,input,textarea,select')) return;
      pointer.drag = { x: event.clientX, y: event.clientY, offset: { ...scene.transform.get().dragOffset } };
      scene.capturePointer(event.pointerId); scene.beginDrag();
    };
    const move = event => {
      if (!pointer.drag) return;
      scene.moveDrag({ x: pointer.drag.offset.x + event.clientX - pointer.drag.x, y: pointer.drag.offset.y + event.clientY - pointer.drag.y });
    };
    const up = () => { pointer.drag = null; scene.endDrag(); };
    node.addEventListener('pointerdown', down); node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
    nodes.set(id, scene);
    cleanups.push(() => {
      node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up);
      host.components.detach(id); scene.dispose(); nodes.delete(id);
    });
  };

  mountPrimitive('chat.sidebar.flow.now', 'fixture-flow-now', { id: 'flow-now', layer: 'components', anchor: { kind: 'viewport', x: .16, y: .09 }, basePosition: { x: -90, y: 0 }, size: { width: 180, height: 118 }, visualTransform: 'perspective(720px) rotateY(-5deg)', zIndex: 4 });
  mountPrimitive('chat.sidebar.garden.summary', 'fixture-garden-summary', { id: 'garden-summary', layer: 'components', anchor: { kind: 'viewport', x: .5, y: .08 }, basePosition: { x: -95, y: 0 }, size: { width: 190, height: 86 }, visualTransform: 'rotate(-2deg)', zIndex: 4 });
  mountPrimitive('chat.sidebar.diary.identity', 'fixture-diary-identity', { id: 'diary-identity', layer: 'components', anchor: { kind: 'viewport', x: .82, y: .1 }, basePosition: { x: -90, y: 0 }, size: { width: 180, height: 72 }, visualTransform: 'perspective(680px) rotateY(6deg)', zIndex: 4 });
  mountPrimitive('chat.sidebar.flow.timeline', 'fixture-flow-timeline', { id: 'flow-timeline', layer: 'components', anchor: { kind: 'viewport', x: .04, y: .54 }, basePosition: { x: 0, y: -90 }, size: { width: 176, height: 180 }, zIndex: 3 });
  mountPrimitive('chat.sidebar.garden.visual', 'fixture-garden-visual', { id: 'garden-visual', layer: 'components', anchor: { kind: 'viewport', x: .95, y: .55 }, basePosition: { x: -188, y: -112 }, size: { width: 188, height: 224 }, visualTransform: 'perspective(760px) rotateX(3deg) rotateY(-4deg)', zIndex: 3 });
  mountPrimitive('chat.sidebar.diary.entries', 'fixture-diary-entries', { id: 'diary-entries', layer: 'components', anchor: { kind: 'viewport', x: .52, y: .92 }, basePosition: { x: -130, y: -92 }, size: { width: 260, height: 184 }, zIndex: 3 });
  mountPrimitive('chat.sidebar.status.mood', 'fixture-status-mood', { id: 'status-mood', layer: 'components', anchor: { kind: 'viewport', x: .5, y: .18 }, basePosition: { x: -104, y: 0 }, size: { width: 208, height: 112 }, visualTransform: 'rotate(1deg)', zIndex: 5 });
  mountPrimitive('chat.sidebar.status.activity', 'fixture-status-activity', { id: 'status-activity', layer: 'components', anchor: { kind: 'viewport', x: .08, y: .82 }, basePosition: { x: 0, y: -54 }, size: { width: 264, height: 108 }, visualTransform: 'rotate(-1deg)', zIndex: 5 });
  mountPrimitive('chat.sidebar.status.timeline', 'fixture-status-timeline', { id: 'status-timeline', layer: 'components', anchor: { kind: 'viewport', x: .92, y: .82 }, basePosition: { x: -264, y: -82 }, size: { width: 264, height: 220 }, visualTransform: 'rotate(1deg)', zIndex: 5 });

  const canvas = document.createElement('canvas');
  canvas.className = 'fixture-edge-ornaments'; host.layers.overlay.appendChild(canvas);
  const draw = () => {
    const page = edgeState.get('page'); const flow = edgeState.get('chat.sidebar.flow.now');
    const viewport = host.signals.viewport.get(); const dpi = viewport.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(viewport.width * dpi)); canvas.height = Math.max(1, Math.round(viewport.height * dpi));
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    const context = canvas.getContext('2d'); if (!context) return;
    context.scale(dpi, dpi); context.clearRect(0, 0, viewport.width, viewport.height);
    growth.value = Math.min(growth.cap, Math.max(growth.value, Math.floor(host.signals.chat.get().elapsedMs / 3000)));
    if (page?.visible) {
      context.fillStyle = 'color-mix(in oklch, var(--accent) 78%, transparent)';
      for (let i = 0; i < growth.value; i += 1) context.fillRect(14 + (i * 13) % Math.max(16, viewport.width - 28), 8 + Math.floor(i / Math.max(1, Math.floor(viewport.width / 13))) * 5, 3, 3);
    }
    if (flow?.visible) {
      context.fillStyle = 'color-mix(in oklch, var(--forest) 88%, transparent)';
      const edge = flow.edges.left;
      for (let i = 0; i < Math.min(18, growth.value); i += 1) {
        const ratio = (i + 1) / 19; const x = edge.start.x + (edge.end.x - edge.start.x) * ratio;
        const y = edge.start.y + (edge.end.y - edge.start.y) * ratio;
        context.fillRect(x - 5, y - 2, 4, 4);
      }
    }
  };
  cleanups.push(host.edges.observeEdge('page', edge => { edgeState.set('page', edge); draw(); }));
  cleanups.push(host.edges.observeEdge('chat.sidebar.flow.now', edge => { edgeState.set('chat.sidebar.flow.now', edge); draw(); }));
  cleanups.push(host.signals.chat.subscribe(draw));
  cleanups.push(host.signals.nativeWindow.subscribe(() => {
    const velocity = host.signals.nativeWindow.get().velocity;
    nodes.get('chat.sidebar.garden.visual')?.setMotionOffset({ x: velocity.x * .035, y: velocity.y * .035 });
  }));
  host.geometry.flush(); draw();
  cleanups.push(() => { growth.disposed = true; growth.value = 0; canvas.remove(); edgeState.clear(); });
  return () => cleanups.splice(0).reverse().forEach(cleanup => cleanup());
}
