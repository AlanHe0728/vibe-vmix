'use strict';

const card = document.getElementById('promotionCard');
const rows = document.getElementById('promotionRows');
const artHost = document.getElementById('promotionDesign');
// The card moves the artwork and the separately laid-out contestant rows together.
const art = FBPMotionScene.attach(artHost, { staticArtwork: true });
const rosterBindings = {
  'promotion.rank': 'rank',
  'promotion.name': 'name',
  'promotion.program': 'title',
  'promotion.score': 'score',
};
const params = new URLSearchParams(location.search);
const workspacePreview = params.get('workspacePreview') === '1';
const workspaceOrigin =
  workspacePreview && document.referrer ? new URL(document.referrer).origin : '';
const query = new URLSearchParams({ layout: '1' });
if (workspacePreview && params.has('round')) query.set('round', params.get('round'));
const output =
  (workspacePreview ? '/api/stage/promotion-preview?' : '/api/stage/promotion?') + query;
const layers = { list: card };
let referencePlayer;
if (workspacePreview) {
  const reference = document.createElement('div');
  reference.id = 'promotionBackdrop';
  reference.className = 'stage-media';
  reference.setAttribute('aria-hidden', 'true');
  card.before(reference);
  layers.background = reference;
  referencePlayer = StageMedia.mount(reference, { fit: 'contain' });
}
let layout, live, design, eventLogo, motion;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let cardVisible = false;
let cardAnimation;
const runningParts = new Map();
let cardDesign = '';
let displayedDesign;
let pageIdentity;
let draft = {},
  presentation = {};
const headings = { rank: '名次', name: '姓名', title: '节目', score: '分数' };
const widths = {
  rank: 'calc(64px * var(--promotion-scale))',
  name: 'minmax(0, 1fr)',
  title: 'minmax(0, 1.45fr)',
  score: 'minmax(calc(102px * var(--promotion-scale)), .55fr)',
};
let etag = '',
  signature = '';
function fitCanvas() {
  document.body.style.setProperty('--preview-scale', Math.min(innerWidth / 1920, innerHeight / 1080));
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

function buildRow(entry, columns) {
  const row = document.createElement('div');
  row.className = 'lu-row' + (entry ? '' : ' row-heading');
  if (entry) row.dataset.podium = String(entry.rank >= 1 && entry.rank <= 3);
  for (const key of columns) {
    const cell = document.createElement('span');
    cell.className = (entry && key === 'rank' ? 'lu-rn' : 'lu-name') + ' ' + key;
    cell.textContent = entry ? (entry[key] ?? '—') : headings[key];
    row.append(cell);
  }
  return row;
}

function animateOutput() {
  return !workspacePreview && motion !== false && !reducedMotion.matches;
}

function authoredTrack(template, show) {
  const track = template?.motion?.[show ? 'enter' : 'exit'];
  if (!track) return null;
  // The importer normalizes omitted motion to two neutral one-millisecond frames.
  const neutral =
    track.duration === 1 &&
    track.frames.length === 2 &&
    track.frames.every(
      (p, index) =>
        p.x === 0 && p.y === 0 && p.sx === 1 && p.sy === 1 && p.rotation === 0 &&
        p.opacity === (show || index === 0 ? 1 : 0),
    );
  return neutral ? null : track;
}

function cardTrack(show, template, position) {
  const track = authoredTrack(template, show);
  if (track) {
    const sx = position.promotionListWidth / template.scene.width;
    const { scale } = StagePromotionLayout.grid(0, position, template);
    const frames = track.frames.map((p) =>
      FBPMotionScene.keyframe({ ...p, x: p.x * sx, y: p.y * scale }),
    );
    return { frames, duration: track.duration, easing: 'linear' };
  }
  const held = { opacity: 1, transform: 'none' };
  if (show) {
    // Reveal the finished layout through one mask. Even the plate and its rules
    // stay behind the leading edge, while the letterforms keep their proportions.
    const bottom = 'calc(100% - var(--promotion-header-height, 96px))';
    const header = `inset(0 0 ${bottom} 0)`;
    return {
      frames: [
        { ...held, clipPath: `inset(0 100% ${bottom} 0)`, offset: 0, easing: 'cubic-bezier(.32,0,.18,1)' },
        { ...held, clipPath: header, offset: 360 / 920 },
        { ...held, clipPath: header, offset: 420 / 920, easing: 'cubic-bezier(.35,0,.22,1)' },
        { ...held, clipPath: 'inset(0)' },
      ],
      duration: 920,
      easing: 'linear',
    };
  }
  return {
    frames: [held, { opacity: 0, transform: 'translateY(-10px)' }],
    duration: 360,
    easing: 'cubic-bezier(.4,0,1,1)',
  };
}

// Animate complete text rows. Only the decorative backgrounds have a cut edge.
function builtInParts(show) {
  const header = document.querySelector('.promotion-header');
  const groups = Array.from(rows.children, (group) =>
    Array.from(group.querySelectorAll('.lu-row:not(.row-heading)')),
  );
  const last = Math.max(0, ...groups.map((group) => group.length - 1));
  const interval = show ? Math.min(72, 504 / Math.max(last, 1)) : Math.min(32, 160 / Math.max(last, 1));
  const full = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
  const appear = { opacity: 0, transform: 'translateY(4px)', filter: 'blur(2px)' };
  const leave = { opacity: 0, transform: 'translateY(-4px) scale(.992)', filter: 'blur(1.6px)' };
  const headOff = { ...appear, backgroundSize: '0% 100%' };
  const headOn = { ...full, backgroundSize: '100% 100%' };
  const parts = [{
    node: header,
    frames: show ? [headOff, headOn] : [headOn, headOff],
    delay: show ? 0 : last * interval + 75,
    duration: show ? 440 : 200,
  }];
  for (const label of rows.querySelectorAll('.row-heading, .promotion-empty')) {
    parts.push({ node: label, frames: show ? [appear, full] : [full, leave],
      delay: show ? 220 : last * interval, duration: 200 });
  }
  for (const group of groups) {
    group.forEach((node, i) => {
      parts.push({ node, frames: show ? [appear, full] : [full, leave],
        delay: show ? 330 + i * interval : (last - i) * interval,
        duration: show ? 370 : 180 });
    });
  }
  return parts;
}

function setCardVisible(show, position) {
  const changed = cardVisible !== show;
  const animate = animateOutput();
  const template = show ? design : displayedDesign;
  card.classList.toggle('promotion-motion', animate && (show || cardVisible || Boolean(cardAnimation)));
  const designKey = design
    ? JSON.stringify([design.id, design.revision, position.promotionListWidth, position.promotionListHeight])
    : '';
  if (!changed && (cardDesign === designKey || !show) && (!cardAnimation || animate)) return;

  // On reversal sample each strip separately, including the ones still in their delay.
  const interrupted = new Map();
  for (const [node, animation] of runningParts) {
    const style = getComputedStyle(node);
    const pose = { transform: style.transform, opacity: style.opacity, filter: style.filter };
    if (node === card) pose.clipPath = style.clipPath === 'none' ? 'inset(0)' : style.clipPath;
    else pose.backgroundSize = style.backgroundSize;
    interrupted.set(node, pose);
    animation.cancel();
  }
  runningParts.clear();
  cardAnimation = null;
  cardVisible = show;
  cardDesign = designKey;
  card.classList.toggle('promotion-intro', Boolean(show && changed && animate && !template && !interrupted.size));

  let parts = [];
  let easing = show ? 'cubic-bezier(.20,.72,.22,1)' : 'cubic-bezier(.38,0,.74,.48)';
  if (template) {
    const track = cardTrack(show, template, position);
    const end = track.frames.at(-1);
    card.style.transform = end.transform;
    card.style.opacity = end.opacity;
    parts = [{ node: card, frames: track.frames, duration: track.duration, delay: 0 }];
    easing = track.easing;
  } else {
    card.style.transform = 'none';
    card.style.opacity = '1';
    if (animate && changed) parts = builtInParts(show);
  }
  function finish() {
    card.classList.remove('promotion-intro');
    if (!show) {
      card.classList.remove('promotion-motion');
      card.hidden = true;
      art.setVisible(false, false);
    }
  }
  if (!animate || !changed) return finish();

  let endTime = 0;
  for (const part of parts) {
    const { node, delay, duration } = part;
    let frames = part.frames;
    const current = interrupted.get(node);
    if (current) {
      if (node === card && show && frames[0].clipPath) frames = [current, frames.at(-1)];
      else {
        frames[0] = { offset: 0, ...current };
        if (node === card && !show) frames.at(-1).clipPath = current.clipPath;
      }
    }
    const animation = node.animate(frames, { delay, duration, easing, fill: 'both' });
    runningParts.set(node, animation);
    if (delay + duration >= endTime) {
      endTime = delay + duration;
      cardAnimation = animation;
    }
  }
  const last = cardAnimation;
  last.onfinish = () => {
    if (cardAnimation !== last) return;
    finish();
    for (const animation of runningParts.values()) animation.cancel();
    runningParts.clear();
    cardAnimation = null;
  };
}

function render() {
  const visible = (layer) =>
    (!presentation.only || presentation.only === layer) && !presentation.hidden?.includes(layer);
  const content =
    live ||
    (workspacePreview && layout && {
      listVisible: true,
      columns: { name: true },
      entries: [],
      page: 0,
      title: '晋级名单',
    });
  const show = Boolean(content?.listVisible && visible('list'));
  referencePlayer?.set(content?.backgroundVisible && visible('background') ? content.background : '');
  if (workspacePreview) layers.background.classList.toggle('default-reference',
    !content?.background && visible('background'));
  if (layout) {
    if (!animateOutput()) {
      rows.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    }
    const position = { ...StagePromotionLayout.defaults, ...layout, ...draft };
    const boxes = {};
    for (const [key, layer] of Object.entries(layers)) {
      const prefix = key === 'list' ? 'promotionList' : 'promotionBackground';
      const x = position[prefix + 'X'];
      const y = position[prefix + 'Y'];
      const width = key !== 'list' ? position[prefix + 'Width']
        : !show && !workspacePreview && !card.hidden ? card.offsetWidth
        : StagePromotionLayout.listWidth(position, design, content?.columns);
      const height = position[prefix + 'Height'];
      layer.style.left = x + 'px';
      if (key === 'list') {
        layer.style.width = width + 'px';
        layer.style.maxHeight = height + 'px';
      } else {
        layer.style.top = y + 'px';
        const { promotionBackgroundWidth, promotionBackgroundHeight } =
          StagePromotionLayout.defaults;
        layer.style.transform = `scale(${width / promotionBackgroundWidth}, ${height / promotionBackgroundHeight})`;
      }
      boxes[key] = { x, y, width, height };
    }
    if (show) {
      // Measure newly mounted template text at its real layout size.
      card.hidden = false;
      renderList(content, position);
      displayedDesign = design;
    }
    const listBox = boxes.list;
    listBox.height = card.offsetHeight || listBox.height;
    listBox.y = StagePromotionLayout.listTop(
      position, workspacePreview ? design : displayedDesign, listBox.height,
    );
    card.style.top = listBox.y + 'px';
    setCardVisible(show, position);
    if (workspaceOrigin && parent !== window) {
      parent.postMessage(
        { type: 'preview-geometry', module: 'stage-promotion', boxes },
        workspaceOrigin,
      );
    }
  }
}

function designedRow(entry, columns, design, scale) {
  const row = document.createElement('div');
  row.className = 'design-row' + (entry ? '' : ' row-heading');
  if (entry && design.roster.repeatArt) {
    const plate = design.elements.find(
      (item) =>
        item.type === 'image' &&
        !item.bind &&
        item.x === 0 &&
        item.y === 0 &&
        item.width === design.scene.width &&
        item.height === design.scene.height,
    );
    if (plate)
      Object.assign(row.style, {
        backgroundImage: 'url(' + JSON.stringify(plate.src) + ')',
        backgroundSize: '100% ' + design.scene.height * scale + 'px',
        backgroundPosition: '0 ' + -design.roster.top * scale + 'px',
        backgroundRepeat: 'no-repeat',
      });
  }
  const authored = design.elements.filter(({ bind }) => Object.hasOwn(rosterBindings, bind));
  const visible = authored.filter(({ bind }) => columns.includes(rosterBindings[bind]));
  const redistribute = authored.length !== visible.length;
  const totalWidth = visible.reduce((total, { width }) => total + width, 0);
  let nextLeft = 0;
  for (const item of visible) {
    const key = rosterBindings[item.bind];
    const cell = document.createElement('div');
    const span = document.createElement('span');
    cell.className = 'promotion-cell ' + key;
    const width = (100 * item.width) / (redistribute ? totalWidth : design.scene.width);
    const font = item.latinFont && ['score', 'rank'].includes(key) ? item.latinFont : item.font;
    Object.assign(cell.style, {
      left: (redistribute ? nextLeft : (100 * item.x) / design.scene.width) + '%',
      width: width + '%',
      top: (item.y - design.roster.top) * scale + 'px',
      height: item.height * scale + 'px',
      color: item.color,
      opacity: item.opacity ?? 1,
      justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[item.align],
      fontFamily: JSON.stringify(font) + ', "Microsoft YaHei", sans-serif',
      fontWeight: item.weight,
      fontSize: (entry ? item.fontSize : item.fontSize * 0.72) * scale + 'px',
    });
    span.textContent = entry ? (entry[key] ?? '—') : headings[key];
    cell.append(span);
    row.append(cell);
    nextLeft += width;
  }
  return row;
}

function renderList(live, position) {
  const { columns, entries, title } = live;
  const {
    scale,
    headerHeight,
    rowHeight,
    paddingTop,
    paddingBottom,
    rowsPerGroup,
    pageSize,
    pageCount,
  } = StagePromotionLayout.grid(entries.length, position, design, columns);
  const page = Math.min(live.page, pageCount - 1);
  const current = entries.slice(page * pageSize, (page + 1) * pageSize);
  const groupCount = Math.max(1, Math.ceil(current.length / rowsPerGroup));
  card.classList.toggle('designed-roster', Boolean(design));
  card.dataset.compact = String(columns.name && !columns.title && !columns.score);
  card.style.height = design ? position.promotionListHeight + 'px' : '';
  rows.style.gap = design ? design.roster.gap * scale + 'px' : '';
  if (design) {
    const elements = design.elements.filter(
      ({ bind }) => !Object.hasOwn(rosterBindings, bind) && (workspacePreview || bind !== 'event.logo'),
    );
    artHost.style.transform = `scale(${position.promotionListWidth / design.scene.width}, ${scale})`;
    art.load(FBPMotionScene.stageScene(design, elements), design.revision);
    art.update({
      'promotion.title': title || '晋级名单',
      'promotion.page': pageCount > 1 ? `${page + 1} / ${pageCount}` : '',
      'event.logo': workspacePreview && /\.(?:png|jpe?g|webp)$/i.test(eventLogo) ? '/assets/' + eventLogo : '',
    });
    art.setVisible(true, false);
  } else art.load(null);
  card.style.setProperty('--promotion-scale', scale);
  card.style.setProperty('--promotion-header-height', headerHeight + 'px');
  card.style.setProperty('--promotion-row-height', rowHeight + 'px');
  card.style.setProperty('--promotion-padding-top', paddingTop + 'px');
  card.style.setProperty('--promotion-padding-bottom', paddingBottom + 'px');
  const nextSignature = JSON.stringify([
    columns,
    current,
    title,
    page,
    pageCount,
    groupCount,
    design?.id,
    design?.revision,
    design && scale,
  ]);
  const nextPage = JSON.stringify([live.id, page]);
  // A take animates the header and rows together. Page turns reveal only the new rows.
  const revealRows = animateOutput() && cardVisible && nextPage !== pageIdentity;
  pageIdentity = nextPage;
  if (nextSignature === signature) {
    if (revealRows) animateRows();
    return;
  }
  signature = nextSignature;
  document.getElementById('promotionTitle').textContent = title || '晋级名单';
  document.getElementById('promotionPage').textContent =
    pageCount > 1 ? `${page + 1} / ${pageCount}` : '';
  const visible = Object.keys(headings).filter((key) => columns[key]);
  const groupSize = Math.ceil(current.length / groupCount);
  rows.style.setProperty('--groups', groupCount);
  rows.replaceChildren();
  if (!visible.length) return;
  if (!current.length) {
    const empty = document.createElement('div');
    empty.className = 'promotion-empty';
    empty.textContent = '暂无晋级选手';
    rows.append(empty);
    return;
  }
  for (let index = 0; index < groupCount; index++) {
    const group = document.createElement('div');
    group.className = 'promotion-group';
    group.style.setProperty('--columns', visible.map((key) => widths[key]).join(' '));
    const makeRow = (entry) =>
      design ? designedRow(entry, visible, design, scale) : buildRow(entry, visible);
    if (!design || design.roster.headings) group.append(makeRow(null));
    for (const entry of current.slice(index * groupSize, (index + 1) * groupSize))
      group.append(makeRow(entry));
    rows.append(group);
  }
  if (revealRows) animateRows();
}

function animateRows() {
  for (const group of rows.children) {
    const entries = group.querySelectorAll(':scope > :not(.row-heading)');
    entries.forEach((row, index) => {
      row.animate(
        [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, delay: Math.min(index * 72, 504), easing: 'ease-out', fill: 'backwards' },
      );
    });
  }
}

if (workspaceOrigin && parent !== window)
  window.addEventListener('message', (event) => {
    if (
      event.source !== parent ||
      event.origin !== workspaceOrigin ||
      event.data?.type !== 'preview-layout' ||
      event.data.module !== 'stage-promotion'
    )
      return;
    draft = event.data.layout || {};
    presentation = event.data.presentation || {};
    render();
  });

async function pollPromotion() {
  try {
    const response = await fetch(output, {
      cache: 'no-store',
      headers: etag ? { 'If-None-Match': etag } : {},
    });
    if (response.ok) {
      ({ live, layout, design, eventLogo, motion } = await response.json());
      render();
      etag = response.headers.get('ETag') || '';
    } else if (response.status !== 304) throw Error('晋级模块已断开');
  } catch (_) {
    // Keep displaying the last saved frame during a temporary connection interruption.
    etag = '';
  }
  setTimeout(pollPromotion, 300);
}
// Start polling with a fresh snapshot once the local faces are ready, so opening
// an on-air page doesn't swap typefaces halfway through its first take.
if (document.fonts) {
  Promise.allSettled([
    document.fonts.load('600 52px "Roster Serif"', '晋级名单'),
    document.fonts.load('600 43px "Roster Sans"', '姓名'),
  ]).then(pollPromotion);
} else pollPromotion();
reducedMotion.addEventListener('change', render);
window.addEventListener('pagehide', () => {
  referencePlayer?.stop();
  art.load(null);
});
