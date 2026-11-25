'use strict';

const background = document.getElementById('promotionBackdrop');
const backdrop = StageMedia.mount(background, { fit: 'contain' });
const card = document.getElementById('promotionCard');
const rows = document.getElementById('promotionRows');
const artHost = document.getElementById('promotionDesign');
const art = FBPMotionScene.attach(artHost);
const rosterBindings = {
  'promotion.rank': 'rank',
  'promotion.name': 'name',
  'promotion.program': 'title',
  'promotion.score': 'score',
};
const params = new URLSearchParams(location.search);
const preview = params.has('preview');
const workspacePreview = params.get('workspacePreview') === '1';
const workspaceOrigin =
  workspacePreview && document.referrer ? new URL(document.referrer).origin : '';
const query = new URLSearchParams({ layout: '1' });
if (workspacePreview && params.has('round')) query.set('round', params.get('round'));
const output =
  (workspacePreview ? '/api/stage/promotion-preview?' : '/api/stage/promotion?') + query;
const layers = { list: card, background };
let layout, live, design, eventLogo;
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
if (preview) {
  document.body.classList.add('preview');
  const fit = () =>
    document.body.style.setProperty(
      '--preview-scale',
      Math.min(innerWidth / 1920, innerHeight / 1080),
    );
  fit();
  window.addEventListener('resize', fit);
}

function buildRow(entry, columns) {
  const row = document.createElement('div');
  row.className = 'lu-row' + (entry ? '' : ' row-heading');
  for (const key of columns) {
    const cell = document.createElement('span');
    cell.className = (entry && key === 'rank' ? 'lu-rn' : 'lu-name') + ' ' + key;
    cell.textContent = entry ? (entry[key] ?? '—') : headings[key];
    row.append(cell);
  }
  return row;
}

function render() {
  const visible = (layer) =>
    (!presentation.only || presentation.only === layer) && !presentation.hidden?.includes(layer);
  const content =
    live ||
    (layout && {
      listVisible: true,
      columns: { name: true },
      entries: [],
      page: 0,
      title: '晋级名单',
    });
  backdrop.set(content?.backgroundVisible && visible('background') ? content.background : '');
  card.hidden = !(content?.listVisible && visible('list'));
  if (layout) {
    const position = { ...StagePromotionLayout.defaults, ...layout, ...draft };
    const boxes = {};
    for (const [key, layer] of Object.entries(layers)) {
      const prefix = key === 'list' ? 'promotionList' : 'promotionBackground';
      const x = position[prefix + 'X'];
      const y = position[prefix + 'Y'];
      const width = position[prefix + 'Width'];
      const height = position[prefix + 'Height'];
      layer.style.left = x + 'px';
      layer.style.top = y + 'px';
      if (key === 'list') {
        layer.style.width = width + 'px';
        layer.style.maxHeight = height + 'px';
      } else {
        const { promotionBackgroundWidth, promotionBackgroundHeight } =
          StagePromotionLayout.defaults;
        layer.style.transform = `scale(${width / promotionBackgroundWidth}, ${height / promotionBackgroundHeight})`;
      }
      boxes[key] = { x, y, width, height };
    }
    if (!card.hidden) renderList(content, position);
    else art.setVisible(false, false);
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
  } = StagePromotionLayout.grid(entries.length, position, design);
  const page = Math.min(live.page, pageCount - 1);
  const current = entries.slice(page * pageSize, (page + 1) * pageSize);
  const groupCount = Math.max(1, Math.ceil(current.length / rowsPerGroup));
  card.classList.toggle('designed-roster', Boolean(design));
  card.style.height = design ? position.promotionListHeight + 'px' : '';
  rows.style.gap = design ? design.roster.gap * scale + 'px' : '';
  if (design) {
    const elements = design.elements.filter(({ bind }) => !Object.hasOwn(rosterBindings, bind));
    artHost.style.transform = `scale(${position.promotionListWidth / design.scene.width}, ${scale})`;
    art.load(FBPMotionScene.stageScene(design, elements), design.revision);
    art.update({
      'promotion.title': title || '晋级名单',
      'promotion.page': pageCount > 1 ? `${page + 1} / ${pageCount}` : '',
      'event.logo': /\.(?:png|jpe?g|webp)$/i.test(eventLogo) ? '/assets/' + eventLogo : '',
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
  if (nextSignature === signature) return;
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
      ({ live, layout, design, eventLogo } = await response.json());
      render();
      etag = response.headers.get('ETag') || '';
    } else if (response.status !== 304) throw Error('晋级模块已断开');
  } catch (_) {
    // Keep displaying the last saved frame during a temporary connection interruption.
    etag = '';
  }
  setTimeout(pollPromotion, 300);
}
pollPromotion();
window.addEventListener('pagehide', () => {
  backdrop.stop();
  art.load(null);
});
