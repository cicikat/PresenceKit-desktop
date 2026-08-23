const PX = 3;
const PLANT_UNITS = 64;
const EDGE_CAP = 512;
const MOSS = ['#1d3320', '#2e4f2c', '#4a7a3a', '#6fa352'];
const STONE = ['#3a3f3b', '#565c55'];
const FLOWERS = ['#e8e4d0', '#7a6a9e'];
const DIRECTIONS = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) result = Math.imul(result ^ String(value).charCodeAt(index), 16777619);
  return result >>> 0;
}

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = Math.imul(value ^ value >>> 15, 1 | value);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function addCell(cells, x, y, color, kind = 'stem') {
  if (x < 1 || y < 1 || x >= PLANT_UNITS - 1 || y >= PLANT_UNITS - 1) return;
  const key = `${x}:${y}`;
  if (!cells.some(cell => cell.key === key)) cells.push({ key, x, y, color, kind });
}

function createPlant(params, ticks) {
  const cells = [];
  const rng = random(params.seed);
  let x = Math.floor(PLANT_UNITS / 2);
  let y = PLANT_UNITS - 5;
  let direction = 0;
  const steps = clamp(Math.floor(ticks), 0, params.maxTicks);
  for (let tick = 0; tick < steps; tick += 1) {
    const turn = rng() < 0.42 ? (rng() < 0.5 ? -1 : 1) : 0;
    direction = (direction + turn + DIRECTIONS.length) % DIRECTIONS.length;
    const vector = DIRECTIONS[direction];
    x = clamp(x + vector.x, 2, PLANT_UNITS - 3);
    y = clamp(y + vector.y, 2, PLANT_UNITS - 3);
    addCell(cells, x, y, params.stem, 'stem');
    if (tick % 3 === 0) {
      addCell(cells, x - vector.y, y + vector.x, params.leaf, 'leaf');
      if (rng() < 0.55) addCell(cells, x + vector.y, y - vector.x, params.leaf, 'leaf');
    }
    if (rng() < params.branchChance) {
      const branchDirection = (direction + (rng() < 0.5 ? 2 : -2) + DIRECTIONS.length) % DIRECTIONS.length;
      const branch = DIRECTIONS[branchDirection];
      let branchX = x;
      let branchY = y;
      const branchLength = 2 + Math.floor(rng() * 4);
      for (let branchTick = 0; branchTick < branchLength; branchTick += 1) {
        branchX = clamp(branchX + branch.x, 2, PLANT_UNITS - 3);
        branchY = clamp(branchY + branch.y, 2, PLANT_UNITS - 3);
        addCell(cells, branchX, branchY, params.leaf, 'leaf');
      }
    }
  }
  const bloom = steps >= params.maxTicks;
  if (bloom) {
    for (let petal = 0; petal < params.petalCount; petal += 1) {
      const angle = (Math.PI * 2 * petal) / params.petalCount;
      const petalX = x + Math.round(Math.cos(angle) * params.petalLen);
      const petalY = y + Math.round(Math.sin(angle) * params.petalLen);
      addCell(cells, petalX, petalY, params.bloom, 'bloom');
      addCell(cells, x + Math.round(Math.cos(angle) * (params.petalLen - 1)), y + Math.round(Math.sin(angle) * (params.petalLen - 1)), params.bloom, 'bloom');
    }
    addCell(cells, x, y, '#f2c46d', 'center');
  }
  return cells;
}

function configureCanvas(canvas, width, height, dpi) {
  const scale = Math.max(1, finite(dpi, 1));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  return context;
}

function drawPlant(buffer, visible, params, ticks, dpi) {
  const size = PLANT_UNITS * PX;
  const bufferContext = configureCanvas(buffer, size, size, dpi);
  if (!bufferContext) return;
  createPlant(params, ticks).forEach(cell => {
    bufferContext.fillStyle = cell.color;
    const width = cell.kind === 'center' ? PX * 2 : PX;
    bufferContext.fillRect(cell.x * PX, cell.y * PX, width, width);
  });
  const visibleContext = configureCanvas(visible, size, size, dpi);
  if (!visibleContext) return;
  visibleContext.drawImage(buffer, 0, 0, size, size);
}

function drawFlower(canvas, color, dpi = 1) {
  const width = 12 * PX;
  const context = configureCanvas(canvas, width, width, dpi);
  if (!context) return;
  context.fillStyle = color;
  [[5, 1], [8, 4], [5, 7], [2, 4], [4, 3], [6, 3], [4, 5], [6, 5]].forEach(([x, y]) => context.fillRect(x * PX, y * PX, PX, PX));
  context.fillStyle = '#f2c46d';
  context.fillRect(5 * PX, 4 * PX, 2 * PX, 2 * PX);
}

function gardenProgress(garden) {
  const slot = garden?.slots?.[0];
  if (!slot) return 0.08;
  const raw = finite(slot.stage_progress, finite(slot.growth, 0));
  if (raw >= 0 && raw <= 1) return clamp(raw, 0, 1);
  const span = finite(slot.stage_max, 1) - finite(slot.stage_min, 0);
  if (span > 0) return clamp((raw - finite(slot.stage_min, 0)) / span, 0, 1);
  return clamp(raw / 100, 0, 1);
}

function edgePoint(segment, progress) {
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * progress,
    y: segment.start.y + (segment.end.y - segment.start.y) * progress,
  };
}

function drawEdgeCell(context, edge, cell, index) {
  if (cell.kind === 'empty') return;
  const segments = [edge.edges.top, edge.edges.right, edge.edges.bottom, edge.edges.left].filter(Boolean);
  const segment = segments[index % segments.length];
  const segmentIndex = Math.floor(index / segments.length);
  const segmentCount = Math.ceil(edge.rect.width + edge.rect.height) / PX;
  const point = edgePoint(segment, ((segmentIndex + 0.5) * PX) / Math.max(PX, segmentCount));
  const distance = cell.kind === 'leaf' ? PX * 2 : PX;
  const x = Math.round((point.x + segment.normal.x * distance) / PX) * PX;
  const y = Math.round((point.y + segment.normal.y * distance) / PX) * PX;
  context.fillStyle = cell.color;
  context.fillRect(x, y, PX, PX);
  if (cell.kind === 'leaf') context.fillRect(x + segment.normal.x * PX, y + segment.normal.y * PX, PX, PX);
}

function createErrorBadge(node, message, retry) {
  const old = node.querySelector('.koke-node__error');
  if (!message) {
    node.dataset.error = 'false';
    old?.remove();
    return;
  }
  const badge = old || document.createElement('button');
  badge.className = 'koke-node__error';
  badge.type = 'button';
  badge.textContent = '!';
  badge.title = String(message);
  badge.setAttribute('aria-label', String(message));
  badge.onclick = event => { event.stopPropagation(); retry(); };
  if (!old) node.appendChild(badge);
  node.dataset.error = 'true';
}

function setupDrag(node, scene) {
  let drag = null;
  const down = event => {
    if (event.target?.closest?.('button,input,textarea,select')) return;
    drag = { x: event.clientX, y: event.clientY, offset: { ...scene.transform.get().dragOffset } };
    scene.capturePointer(event.pointerId);
    scene.beginDrag();
  };
  const move = event => {
    if (!drag) return;
    scene.moveDrag({ x: drag.offset.x + event.clientX - drag.x, y: drag.offset.y + event.clientY - drag.y });
  };
  const up = () => { drag = null; scene.endDrag(); };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  return () => {
    node.removeEventListener('pointerdown', down);
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', up);
    node.removeEventListener('pointercancel', up);
  };
}

export function activate(host) {
  if (host.version !== 2 || host.surface !== 'main') throw new Error('Host API v2 required');
  const cleanups = [];
  const nodes = new Map();
  const edges = new Map();
  const edgeCells = new Map();
  const root = host.root;
  root.classList.add('koke-niwa-stage');
  const underlay = document.createElement('div');
  underlay.className = 'koke-washi-underlay';
  host.layers.underlay.appendChild(underlay);
  const edgeCanvas = document.createElement('canvas');
  edgeCanvas.className = 'koke-edge-ornaments';
  host.layers.overlay.appendChild(edgeCanvas);

  ['flow', 'garden', 'diary', 'status'].forEach(capability => host.components.setComposition(capability, 'official-renderer'));
  ['status', 'flow', 'garden', 'diary'].forEach(name => cleanups.push(host.presenters[name].acquire(`koke-niwa-${name}`)));

  // The chat shell is intentionally a single owned surface. Decorative nodes
  // below remain available as a visual fallback, but are hidden by the theme.
  const chatShell = document.createElement('section');
  chatShell.className = 'koke-chat-shell';
  const chatHeader = document.createElement('div');
  chatHeader.className = 'koke-chat-shell__header';
  const chatTranscript = document.createElement('div');
  chatTranscript.className = 'koke-chat-shell__transcript';
  const chatComposer = document.createElement('div');
  chatComposer.className = 'koke-chat-shell__composer';
  chatShell.append(chatHeader, chatTranscript, chatComposer);
  host.layers.components.appendChild(chatShell);
  host.components.attach('chat.header', chatHeader);
  host.components.attach('chat.transcript', chatTranscript);
  host.components.attach('chat.composer', chatComposer);
  cleanups.push(() => {
    host.components.detach('chat.header');
    host.components.detach('chat.transcript');
    host.components.detach('chat.composer');
    chatShell.remove();
  });

  const auxiliary = document.createElement('aside');
  auxiliary.className = 'koke-auxiliary-shell';
  const auxTabs = document.createElement('div');
  auxTabs.className = 'koke-auxiliary-shell__tabs';
  const auxBody = document.createElement('div');
  auxBody.className = 'koke-auxiliary-shell__body';
  auxiliary.append(auxTabs, auxBody);
  host.layers.components.appendChild(auxiliary);
  ['flow', 'garden', 'diary', 'status'].forEach(capability => {
    const region = document.createElement('div');
    region.className = `koke-auxiliary-shell__region koke-auxiliary-shell__region--${capability}`;
    auxBody.appendChild(region);
    host.components.attach(`chat.sidebar.${capability}`, region);
    cleanups.push(() => host.components.detach(`chat.sidebar.${capability}`));
  });
  cleanups.push(() => auxiliary.remove());

  const addNode = (sourcePrimitive, className, options, artFactory) => {
    const node = document.createElement('section');
    node.className = `koke-node koke-node--ornament ${className}`;
    node.dataset.designPrimitive = sourcePrimitive;
    const content = document.createElement('div');
    content.className = 'koke-node__content';
    node.appendChild(content);
    let art = null;
    if (artFactory) {
      art = artFactory(node);
      if (art) node.appendChild(art);
    }
    const scene = host.scene.create(node, { sourcePrimitive, pointerMode: 'auto', ...options });
    // Ornament nodes are visual-only; the official sidebar renderer owns the
    // capability mounts in the auxiliary shell above.
    cleanups.push(setupDrag(node, scene));
    const record = { node, content, scene, art };
    nodes.set(sourcePrimitive, record);
    cleanups.push(() => {
      host.components.detach(sourcePrimitive);
      scene.dispose();
      nodes.delete(sourcePrimitive);
    });
    return record;
  };

  const plantBuffer = document.createElement('canvas');
  const plantCanvas = document.createElement('canvas');
  const plant = addNode('chat.sidebar.garden.visual', 'koke-stone-group', {
    id: 'stone-group', layer: 'components', anchor: { kind: 'viewport', x: 0.85, y: 0.50 }, basePosition: { x: -110, y: -120 },
    size: { width: 220, height: 240 }, zIndex: 5,
  }, () => { plantCanvas.className = 'koke-node__art koke-node__plant'; return plantCanvas; });

  const lantern = addNode('chat.sidebar.status.mood', 'koke-lantern', {
    id: 'lantern', layer: 'components', anchor: { kind: 'viewport', x: 0.14, y: 0.28 }, basePosition: { x: -110, y: -75 },
    size: { width: 220, height: 150 }, zIndex: 5,
  }, node => {
    const art = document.createElement('div');
    art.className = 'koke-node__art koke-lantern__glow';
    const cap = document.createElement('div'); cap.className = 'koke-lantern__cap';
    const base = document.createElement('div'); base.className = 'koke-lantern__base';
    node.append(cap, base);
    return art;
  });
  const moss = addNode('chat.sidebar.status.activity', 'koke-moss-mat', {
    id: 'moss-mat', layer: 'components', anchor: { kind: 'viewport', x: 0.14, y: 0.60 }, basePosition: { x: -132, y: -54 },
    size: { width: 264, height: 108 }, zIndex: 4,
  });
  const sutra = addNode('chat.sidebar.status.timeline', 'koke-sutra-scroll', {
    id: 'sutra-scroll', layer: 'components', anchor: { kind: 'viewport', x: 0.16, y: 0.88 }, basePosition: { x: -132, y: -190 },
    size: { width: 264, height: 190 }, zIndex: 3,
  });
  const tanzaku = addNode('chat.sidebar.flow.now', 'koke-tanzaku', {
    id: 'tanzaku', layer: 'components', anchor: { kind: 'viewport', x: 0.50, y: 0.06 }, basePosition: { x: -60, y: 0 },
    size: { width: 120, height: 230 }, zIndex: 4,
  });
  const stream = addNode('chat.sidebar.flow.timeline', 'koke-stream', {
    id: 'stream', layer: 'components', anchor: { kind: 'viewport', x: 0.50, y: 0.93 }, basePosition: { x: -210, y: -55 },
    size: { width: 420, height: 110 }, zIndex: 3,
  });
  const sealCanvas = document.createElement('canvas'); sealCanvas.className = 'koke-node__art koke-node__flower koke-node__flower--seal';
  const seal = addNode('chat.sidebar.diary.identity', 'koke-seal', {
    id: 'seal', layer: 'components', anchor: { kind: 'viewport', x: 0.30, y: 0.10 }, basePosition: { x: -75, y: 0 },
    size: { width: 150, height: 64 }, visualTransform: 'rotate(-1.5deg)', zIndex: 4,
  }, () => sealCanvas);
  const letterCanvas = document.createElement('canvas'); letterCanvas.className = 'koke-node__art koke-node__flower koke-node__flower--letter';
  const letter = addNode('chat.sidebar.diary.entries', 'koke-letter-box', {
    id: 'letter-box', layer: 'components', anchor: { kind: 'viewport', x: 0.33, y: 0.70 }, basePosition: { x: -125, y: -85 },
    size: { width: 250, height: 170 }, visualTransform: 'perspective(720px) rotateY(2deg)', zIndex: 3,
  }, () => letterCanvas);
  const tagCanvas = document.createElement('canvas'); tagCanvas.className = 'koke-node__art koke-node__flower koke-node__flower--corner';
  const tag = addNode('chat.sidebar.garden.summary', 'koke-tag', {
    id: 'tag', layer: 'components', anchor: { kind: 'viewport', x: 0.85, y: 0.22 }, basePosition: { x: -95, y: -42 },
    size: { width: 190, height: 84 }, visualTransform: 'rotate(2deg)', zIndex: 4,
  }, () => tagCanvas);
  const basin = addNode('chat.sidebar.garden.controls', 'koke-basin', {
    id: 'basin', layer: 'components', anchor: { kind: 'viewport', x: 0.86, y: 0.82 }, basePosition: { x: -95, y: -45 },
    size: { width: 190, height: 90 }, zIndex: 3,
  });

  const plantParams = { internode: 3, branchAngle: Math.PI / 4, branchChance: 0.16, leafScale: 1, petalCount: 7, petalLen: 3, stem: MOSS[1], leaf: MOSS[3], bloom: FLOWERS[0], maxTicks: 70, seed: 17 };
  let plantTicks = 10;
  let flowerDpi = 1;
  let bloomCount = 0;

  const renderPlant = () => {
    const garden = host.presenters.garden.get().garden;
    const slot = garden?.slots?.[0];
    if (slot) plantParams.seed = hash(`${slot.flower_id}:${slot.slot_key}`);
    plantTicks = Math.max(plantTicks, 10 + Math.floor(gardenProgress(garden) * (plantParams.maxTicks - 10)));
    drawPlant(plantBuffer, plantCanvas, plantParams, plantTicks, flowerDpi);
    bloomCount = Math.max(bloomCount, Math.floor(gardenProgress(garden) * 5));
    drawFlower(tagCanvas, FLOWERS[bloomCount % FLOWERS.length], flowerDpi);
    tag.node.dataset.stage = slot?.stage || 'seed';
  };

  const renderDiary = () => {
    const diary = host.presenters.diary.get();
    const count = diary.entries?.length || 0;
    drawFlower(sealCanvas, FLOWERS[(count + 1) % FLOWERS.length], flowerDpi);
    drawFlower(letterCanvas, FLOWERS[count % FLOWERS.length], flowerDpi);
    letter.node.dataset.entries = String(count);
  };

  const renderStatus = () => {
    const status = host.presenters.status.get();
    const telemetry = status.telemetry || {};
    root.style.setProperty('--koke-mood-aura', String(clamp(finite(telemetry.moodAura, 20) / 100, 0, 1)));
    root.style.setProperty('--koke-breath', String(clamp(finite(telemetry.breath, 0.5), 0, 1)));
    root.style.setProperty('--koke-rhythm', String(clamp(finite(telemetry.rhythm, 0.5), 0, 1)));
    root.style.setProperty('--koke-mood-hue', `${finite(status.mood?.hue, 70)}deg`);
    createErrorBadge(lantern.node, status.errors?.mood, () => status.errors?.mood && host.presenters.status.commands.retryMood());
    createErrorBadge(moss.node, status.errors?.activity, () => status.errors?.activity && host.presenters.status.commands.retryActivity());
    createErrorBadge(sutra.node, status.errors?.sensor, () => status.errors?.sensor && host.presenters.status.commands.retrySensor());
  };

  const renderFlow = () => {
    const flow = host.presenters.flow.get();
    createErrorBadge(tanzaku.node, flow.error, () => flow.error && host.presenters.flow.commands.refresh());
    tanzaku.node.dataset.typing = flow.loading ? 'true' : 'false';
  };

  const renderGarden = () => {
    const garden = host.presenters.garden.get();
    renderPlant();
    createErrorBadge(tag.node, garden.error, () => garden.error && host.presenters.garden.commands.refresh());
  };

  const renderDiaryState = () => {
    const diary = host.presenters.diary.get();
    renderDiary();
    createErrorBadge(seal.node, diary.error, () => diary.error && host.presenters.diary.commands.refresh());
  };

  cleanups.push(host.presenters.status.subscribe(renderStatus));
  cleanups.push(host.presenters.flow.subscribe(renderFlow));
  cleanups.push(host.presenters.garden.subscribe(renderGarden));
  cleanups.push(host.presenters.diary.subscribe(renderDiaryState));

  const updateCompact = () => {
    const viewport = host.signals.viewport.get();
    const compact = finite(viewport.width, 0) < 900;
    root.dataset.compact = compact ? 'true' : 'false';
    stream.scene.update({ visible: !compact });
    letter.scene.update({ visible: !compact });
    flowerDpi = finite(viewport.devicePixelRatio, 1);
    renderPlant();
    renderDiary();
  };
  cleanups.push(host.signals.viewport.subscribe(updateCompact));
  cleanups.push(host.signals.nativeWindow.subscribe(() => {
    const velocity = host.signals.nativeWindow.get().velocity || { x: 0, y: 0 };
    lantern.scene.setMotionOffset({ x: clamp(finite(velocity.x) * 0.025, -4, 4), y: clamp(finite(velocity.y) * 0.025, -4, 4) });
    plant.scene.setMotionOffset({ x: clamp(finite(velocity.x) * 0.035, -5, 5), y: clamp(finite(velocity.y) * 0.035, -5, 5) });
  }));
  cleanups.push(host.signals.pointer.subscribe(() => {
    const pointer = host.signals.pointer.get();
    const viewport = host.signals.viewport.get();
    const glintX = clamp((finite(pointer.x) / Math.max(1, finite(viewport.width, 1)) - 0.14) * 24, -4, 4);
    const glintY = clamp((finite(pointer.y) / Math.max(1, finite(viewport.height, 1)) - 0.28) * 16, -4, 4);
    lantern.node.style.setProperty('--koke-glint-x', `${glintX}px`);
    lantern.node.style.setProperty('--koke-glint-y', `${glintY}px`);
  }));

  const drawEdges = () => {
    const viewport = host.signals.viewport.get();
    const width = Math.max(1, finite(viewport.width, 1));
    const height = Math.max(1, finite(viewport.height, 1));
    const dpi = Math.max(1, finite(viewport.devicePixelRatio, 1));
    const context = configureCanvas(edgeCanvas, width, height, dpi);
    if (!context) return;
    edges.forEach((edge, target) => {
      if (!edge.visible) return;
      const cells = edgeCells.get(target) || [];
      cells.forEach((cell, index) => drawEdgeCell(context, edge, cell, index));
      if (target === 'chat.sidebar.garden.visual') {
        const corners = [edge.corners.topLeft, edge.corners.topRight, edge.corners.bottomRight, edge.corners.bottomLeft];
        for (let index = 0; index < bloomCount; index += 1) {
          const corner = corners[index % corners.length];
          context.fillStyle = FLOWERS[index % FLOWERS.length];
          context.fillRect(Math.round(corner.x / PX) * PX, Math.round(corner.y / PX) * PX, PX, PX);
          context.fillRect(Math.round(corner.x / PX) * PX + PX, Math.round(corner.y / PX) * PX, PX, PX);
        }
      }
    });
  };

  const updateEdgeGrowth = () => {
    const chat = host.signals.chat.get();
    const target = clamp(Math.floor(finite(chat.sessionEntryCount, 0) * 4 + finite(chat.elapsedMs, 0) / 30000), 0, EDGE_CAP);
    edges.forEach((_, key) => {
      const cells = edgeCells.get(key) || [];
      while (cells.length < target) {
        const rng = random(hash(`edge:${key}:${cells.length}`));
        const chance = rng();
        cells.push({
          kind: chance < 0.65 ? 'moss' : chance < 0.85 ? 'empty' : chance < 0.95 ? 'leaf' : 'bud',
          color: chance >= 0.95 ? '#f2c46d' : MOSS[1 + Math.floor(rng() * 3)],
        });
      }
      edgeCells.set(key, cells);
    });
    drawEdges();
  };

  ['page', 'chat.sidebar.status.mood', 'chat.sidebar.garden.visual', 'chat.sidebar.flow.now'].forEach(target => {
    cleanups.push(host.edges.observeEdge(target, edge => { edges.set(target, edge); edgeCells.set(target, edgeCells.get(target) || []); updateEdgeGrowth(); }));
  });
  cleanups.push(host.signals.chat.subscribe(updateEdgeGrowth));
  cleanups.push(host.signals.viewport.subscribe(drawEdges));

  host.geometry.flush();
  updateCompact();
  renderStatus();
  renderFlow();
  renderGarden();
  renderDiaryState();
  updateEdgeGrowth();
  return () => {
    cleanups.splice(0).reverse().forEach(cleanup => cleanup?.());
    edgeCells.clear();
    edges.clear();
    edgeCanvas.remove();
    underlay.remove();
    root.classList.remove('koke-niwa-stage');
    root.style.removeProperty('--koke-mood-aura');
    root.style.removeProperty('--koke-breath');
    root.style.removeProperty('--koke-rhythm');
    root.style.removeProperty('--koke-mood-hue');
  };
}
