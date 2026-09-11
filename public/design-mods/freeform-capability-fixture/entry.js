export function activate(host) {
  const cleanups = [];
  const stage = document.createElement('div');
  stage.className = 'fixture-stage';
  host.layers.components.appendChild(stage);
  const create = (className, parent = stage) => {
    const element = document.createElement('div');
    element.className = className;
    parent.appendChild(element);
    return element;
  };
  const mount = (id, parent, className = '') => {
    const panel = create(`fixture-node ${className}`, parent);
    panel.dataset.designPrimitive = id;
    const content = create('fixture-node__content', panel);
    host.components.attach(id, content);
    cleanups.push(() => host.components.detach(id));
    return panel;
  };
  const ribbon = create('fixture-ribbon');
  host.components.attach('chat.ribbon', ribbon);
  cleanups.push(() => host.components.detach('chat.ribbon'));
  const workspace = create('fixture-workspace');
  const main = create('fixture-main', workspace);
  const header = mount('chat.header', main, 'fixture-header');
  mount('chat.transcript', main, 'fixture-transcript');
  mount('chat.composer', main, 'fixture-composer');
  const aside = create('fixture-aside', workspace);
  for (const capability of ['flow', 'status']) {
    host.components.setComposition(capability, 'subregions');
  }
  for (const capability of ['garden', 'diary']) host.components.setComposition(capability, 'official-renderer');
  const cards = [
    ['chat.sidebar.flow.now', 'fixture-now'],
    ['chat.sidebar.status.mood', 'fixture-mood'],
    ['chat.sidebar.status.activity', 'fixture-activity'],
    ['chat.sidebar.garden', 'fixture-garden'],
    ['chat.sidebar.diary', 'fixture-diary'],
    ['chat.sidebar.flow.timeline', 'fixture-timeline'],
    ['chat.sidebar.status.timeline', 'fixture-telemetry'],
  ].map(([id, className]) => mount(id, aside, className));
  // Connect real panel edges without native windows or a permanent animation loop.
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('fixture-connections');
  svg.setAttribute('aria-hidden', 'true');
  workspace.appendChild(svg);
  const paths = cards.map(card => {
    const path = document.createElementNS(ns, 'path');
    svg.appendChild(path);
    const enter = () => path.classList.add('is-active');
    const leave = () => path.classList.remove('is-active');
    card.addEventListener('pointerenter', enter);
    card.addEventListener('pointerleave', leave);
    card.addEventListener('focusin', enter);
    card.addEventListener('focusout', leave);
    cleanups.push(() => {
      card.removeEventListener('pointerenter', enter); card.removeEventListener('pointerleave', leave);
      card.removeEventListener('focusin', enter); card.removeEventListener('focusout', leave);
    });
    return path;
  });
  const draw = () => {
    const box = workspace.getBoundingClientRect();
    const origin = header.getBoundingClientRect();
    const rail = aside.getBoundingClientRect();
    const railX = main.getBoundingClientRect().right - box.left + 12;
    const startX = origin.right - box.left;
    const startY = origin.top - box.top + origin.height / 2;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const endX = rect.left - box.left;
      const endY = rect.top - box.top + Math.min(rect.height / 2, 28);
      const visible = origin.width > 0 && endY >= rail.top - box.top && endY <= rail.bottom - box.top;
      paths[index].setAttribute('d', visible && rect.height > 0 ? `M ${startX} ${startY} H ${railX} V ${endY} H ${endX}` : '');
    });
  };
  const observer = new ResizeObserver(draw);
  observer.observe(workspace); observer.observe(header); cards.forEach(card => observer.observe(card));
  aside.addEventListener('scroll', draw, { passive: true });
  cleanups.push(() => { observer.disconnect(); aside.removeEventListener('scroll', draw); });
  draw();
  return () => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); stage.remove(); };
}
