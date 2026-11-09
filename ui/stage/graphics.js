'use strict';
const $ = (id) => document.getElementById(id);
const preview = new URLSearchParams(location.search).has('preview');
const workspacePreview = new URLSearchParams(location.search).get('workspacePreview') === '1';
const workspaceOrigin = document.referrer ? new URL(document.referrer).origin : '';
let latestState,
  draftStyle = {};
if (workspacePreview)
  window.addEventListener('message', (event) => {
    if (
      event.source !== parent ||
      event.origin !== workspaceOrigin ||
      event.data?.type !== 'preview-layout' ||
      event.data.module !== 'stage'
    )
      return;
    draftStyle = event.data.layout || {};
    if (latestState) render(latestState);
  });
if (preview) document.body.classList.add('preview');
let etag = '',
  templates,
  cue = null,
  transitionTimer,
  animation,
  captionAnimation;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function setText(id, value) {
  $(id).textContent = value || '';
}
function stopTransition() {
  clearTimeout(transitionTimer);
  animation?.cancel();
  animation = null;
  const video = $('transitionVideo');
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.style.display = 'none';
  $('transition').classList.remove('playing');
}
function transition(state) {
  const value = state.transition;
  if (cue === value.cue) return;
  const first = cue === null;
  cue = value.cue;
  const elapsed = Date.now() - value.at;
  if ((first && !value.at) || elapsed < 0 || elapsed >= value.duration) return;
  stopTransition();
  $('transition').classList.add('playing');
  const remaining = value.duration - elapsed;
  if (state.transitionAsset && /\.(webm|mp4)$/i.test(state.transitionAsset)) {
    const video = $('transitionVideo');
    video.src = '/assets/' + state.transitionAsset;
    video.style.display = 'block';
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration))
        video.currentTime = Math.min(elapsed / 1000, Math.max(0, video.duration - 0.05));
      video.play().catch(stopTransition);
    };
    video.onerror = stopTransition;
  } else if (state.style.motion && !reduced) {
    animation = $('wipe').animate(
      [
        { transform: 'translateX(-110%)', offset: 0 },
        { transform: 'translateX(0)', offset: 0.35 },
        { transform: 'translateX(0)', offset: 0.65 },
        { transform: 'translateX(110%)', offset: 1 },
      ],
      { duration: value.duration, easing: 'cubic-bezier(.25,.1,.25,1)' },
    );
    animation.currentTime = elapsed;
  } else {
    $('wipe').style.transform = 'translateX(0)';
  }
  transitionTimer = setTimeout(() => {
    stopTransition();
    $('wipe').style.transform = '';
  }, remaining);
}
function renderCaption(state) {
  const active = state.captionLive;
  const content = active ? StageCaptions.lines(active.caption)[active.index] || '' : '';
  const element = $('caption');
  const text = $('captionText');
  const visible = Boolean(state.layers.caption && content);
  if (text.textContent !== content) {
    const switching =
      visible && element.classList.contains('visible') && state.style.motion && !reduced;
    captionAnimation?.cancel();
    text.textContent = content;
    if (switching)
      captionAnimation = text.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: 150,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      });
  }
  element.classList.toggle('visible', visible);
}
function render(state) {
  latestState = state;
  if (workspacePreview) state = { ...state, style: { ...state.style, ...draftStyle } };
  const template = templates.find((item) => item.id === state.templateId) || templates[0];
  const style = state.style,
    root = $('canvas');
  root.dataset.template = template.id;
  root.classList.toggle('no-motion', !style.motion);
  for (const key of ['accent', 'background', 'foreground'])
    root.style.setProperty('--' + key, style[key] || template[key]);
  root.style.setProperty('--font', style.font === 'template' ? template.font : style.font);
  root.style.setProperty('--title-size', style.fontSize + 'px');
  root.style.setProperty('--logo-size', style.logoSize + 'px');
  for (const key of ['channel', 'event', 'sponsor']) {
    const element = $(key),
      image = element.querySelector('img'),
      src = state[key + 'Asset'] ? '/assets/' + state[key + 'Asset'] : '';
    if (src && image.getAttribute('src') !== src) image.src = src;
    else if (!src) image.removeAttribute('src');
    element.querySelector('span').textContent = state[key === 'event' ? 'eventName' : key + 'Name'];
    element.style.left = style[key + 'X'] + 'px';
    element.style.top = style[key + 'Y'] + 'px';
    element.classList.toggle('visible', state.layers[key]);
  }
  $('lower').style.left = style.lowerX + 'px';
  $('lower').style.top = style.lowerY + 'px';
  $('lower').style.width = style.lowerWidth + 'px';
  $('caption').style.left = style.captionX + 'px';
  $('caption').style.top = style.captionY + 'px';
  $('caption').style.bottom = 'auto';
  setText('eventName', state.eventName);
  setText('type', state.live?.type);
  setText('title', state.live?.title);
  setText('subtitle', [state.live?.performer, state.live?.subtitle].filter(Boolean).join(' · '));
  renderCaption(state);
  $('lower').classList.toggle('visible', Boolean(state.layers.lower && state.live));
  if (!Object.values(state.layers).some(Boolean) && cue !== null && state.transition.cue === cue)
    stopTransition();
  transition(state);
  if (workspacePreview && workspaceOrigin && parent !== window) {
    const boxes = {};
    for (const key of ['channel', 'event', 'sponsor', 'lower', 'caption']) {
      const rect = $(key).getBoundingClientRect();
      boxes[key] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    parent.postMessage({ type: 'preview-geometry', module: 'stage', boxes }, workspaceOrigin);
  }
}
async function poll() {
  try {
    const response = await fetch('/api/v1/state', {
      cache: 'no-store',
      headers: etag ? { 'If-None-Match': etag } : {},
    });
    if (response.ok) {
      const state = await response.json();
      etag = response.headers.get('ETag');
      render(state);
    } else if (response.status !== 304) throw Error('模块不可用');
  } catch (_) {
    // A stopped module must not leave stale graphics frozen on air.
    document.querySelectorAll('.layer').forEach((element) => element.classList.remove('visible'));
    stopTransition();
    etag = '';
  }
  setTimeout(poll, preview && document.hidden ? 2000 : 300);
}
fetch('/api/stage/templates')
  .then((response) => response.json())
  .then((body) => {
    templates = body.templates;
    poll();
  });
window.addEventListener('pagehide', stopTransition);
