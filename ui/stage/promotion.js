'use strict';

const background = document.getElementById('promotionBackdrop');
const backdrop = StageMedia.mount(background, { fit: 'contain' });
const card = document.getElementById('promotionCard');
const rows = document.getElementById('promotionRows');
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
let layout, live;
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
    if (workspaceOrigin && parent !== window) {
      parent.postMessage(
        { type: 'preview-geometry', module: 'stage-promotion', boxes },
        workspaceOrigin,
      );
    }
  }
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
  } = StagePromotionLayout.grid(entries.length, position);
  const page = Math.min(live.page, pageCount - 1);
  const current = entries.slice(page * pageSize, (page + 1) * pageSize);
  const groupCount = Math.max(1, Math.ceil(current.length / rowsPerGroup));
  card.style.setProperty('--promotion-scale', scale);
  card.style.setProperty('--promotion-header-height', headerHeight + 'px');
  card.style.setProperty('--promotion-row-height', rowHeight + 'px');
  card.style.setProperty('--promotion-padding-top', paddingTop + 'px');
  card.style.setProperty('--promotion-padding-bottom', paddingBottom + 'px');
  const nextSignature = JSON.stringify([columns, current, title, page, pageCount, groupCount]);
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
    group.append(buildRow(null, visible));
    for (const entry of current.slice(index * groupSize, (index + 1) * groupSize))
      group.append(buildRow(entry, visible));
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
      ({ live, layout } = await response.json());
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
window.addEventListener('pagehide', backdrop.stop);
