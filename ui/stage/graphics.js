'use strict';
const $ = (id) => document.getElementById(id);
const preview = new URLSearchParams(location.search).has('preview');
const workspacePreview = new URLSearchParams(location.search).get('workspacePreview') === '1';
const workspaceOrigin = document.referrer ? new URL(document.referrer).origin : '';
let latestState,
  draftTemplate = '',
  draftStyle = {},
  draftBranding = {},
  draftProgram = null,
  draftCaptionTemplate,
  previewPresentation = { mode: 'live', only: '', hidden: [] };
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
    draftBranding = event.origin === location.origin ? event.data.branding || {} : {};
    draftProgram = event.origin === location.origin ? event.data.program || null : null;
    draftCaptionTemplate = event.data.captionTemplateId;
    draftTemplate = event.origin === location.origin ? event.data.templateId || '' : '';
    previewPresentation = event.data.presentation || { mode: 'live', only: '', hidden: [] };
    if (latestState) render(latestState);
  });
if (preview) document.body.classList.add('preview');
let etag = '',
  templates,
  cue = null,
  transitionTimer,
  animation,
  captionAnimation,
  captionEffect,
  captionOnAir,
  captionDisplay,
  captionUsesLatin = false;
let captionDesignPlayer,
  captionDesignActive = false;
const transitionMedia = StageMedia.mount($('transitionMedia'), { fit: 'contain' });
const captionBackground = StageMedia.mount($('captionBackground'), { fit: 'contain' });
const eventMedia = StageMedia.mount($('eventMedia'), { fit: 'fill' });
const channelMedia = StageMedia.mount($('channelMedia'), { fit: 'fill' });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function fontFamily(key, filename, preset) {
  if (/^[a-f0-9]{32}\.(ttf|otf|woff2?)$/i.test(filename)) {
    const name = 'StageImported-' + filename.split('.')[0];
    if (!document.getElementById(name)) {
      const sheet = document.createElement('style');
      sheet.id = name;
      sheet.textContent =
        '@font-face{font-family:' +
        name +
        ';src:url("/assets/' +
        filename +
        '");font-display:swap}';
      document.head.append(sheet);
    }
    return name + ', sans-serif';
  }
  const family = key === 'template' ? preset.font : key;
  return ['serif', 'sans-serif'].includes(family)
    ? family
    : JSON.stringify(family) + ', sans-serif';
}
function stopTransition() {
  clearTimeout(transitionTimer);
  animation?.cancel();
  animation = null;
  transitionMedia.stop();
  $('wipe').hidden = true;
  $('wipe').style.transform = '';
  $('transition').classList.remove('playing');
}
function completeTransition() {
  stopTransition();
  if (latestState) render(latestState);
}
function transition(state) {
  const value = state.transition;
  if (cue === value.cue) return;
  const resume = cue === null;
  cue = value.cue;
  stopTransition();
  const elapsed = resume ? Math.max(0, Date.now() - value.at) : 0;
  if (!value.at || (!value.asset && elapsed >= value.duration)) return;
  $('transition').classList.add('playing');
  if (value.asset && StageMedia.isMotion(value.asset)) {
    transitionMedia.set(value.asset, {
      loop: false,
      cue,
      at: value.at,
      resume,
      end: completeTransition,
      error: completeTransition,
    });
    return;
  }
  if (state.style.motion && !reduced) {
    $('wipe').hidden = false;
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
    $('wipe').hidden = false;
    $('wipe').style.transform = 'translateX(0)';
  }
  if (value.duration) transitionTimer = setTimeout(completeTransition, value.duration - elapsed);
}
function clearCaption() {
  captionEffect?.cancel();
  captionEffect = null;
  captionAnimation?.cancel();
  $('caption').classList.remove('visible');
  $('captionText').textContent = '';
  captionBackground.stop();
  if (captionDesignActive) {
    captionDesignPlayer.load(null);
    $('captionDesign').hidden = true;
    $('caption').classList.remove('designed-caption');
    captionDesignActive = false;
  }
}

function runCaptionEffect(effect, entering, duration) {
  const layer = $('captionLayer');
  let current;
  if (captionEffect && effect !== 'cut') {
    const style = getComputedStyle(layer);
    current = { opacity: style.opacity, clipPath: style.clipPath };
  }
  captionEffect?.cancel();
  const playback = StageCaptions.animateTransition(layer, effect, entering, duration, current);
  captionEffect = playback;
  if (playback) {
    playback.onfinish = () => {
      if (captionEffect !== playback) return;
      playback.cancel();
      captionEffect = null;
      if (!entering) clearCaption();
    };
  }
  return Boolean(playback);
}

function placeCaptionLayer(state, template, bounds) {
  const element = $('caption');
  const draftApplies =
    workspacePreview && (draftCaptionTemplate ?? template?.id ?? '') === (template?.id || '');
  element.style.left =
    ((draftApplies ? draftStyle.captionX : undefined) ??
      template?.position?.x ??
      state.style.captionX) + 'px';
  element.style.top =
    ((draftApplies ? draftStyle.captionY : undefined) ??
      template?.position?.y ??
      state.style.captionY) + 'px';
  element.style.width = bounds ? bounds.width + 'px' : '';
  element.style.height = bounds ? bounds.height + 'px' : '';
}

function renderDesignedCaption(state, template, body, visible, layout) {
  const design =
    visible && template?.designId && state.stageDesigns?.find(({ id }) => id === template.designId);
  const animate = !layout && !reduced && !$('transition').classList.contains('playing');
  if (!design) {
    if (captionDesignActive && !visible) {
      captionDesignPlayer.setVisible(false, animate);
      return true;
    }
    if (captionDesignActive) clearCaption();
    return false;
  }
  if (!captionDesignActive) {
    clearCaption();
    captionDesignActive = true;
    $('captionDesign').hidden = false;
    $('caption').classList.add('designed-caption');
  }
  captionDesignPlayer ??= FBPMotionScene.attach($('captionDesign'));
  placeCaptionLayer(state, template, design.scene);
  captionDesignPlayer.load(FBPMotionScene.stageScene(design), design.revision);
  captionDesignPlayer.update({
    'caption.text': body,
    'event.logo': /\.(?:png|jpe?g|webp)$/i.test(state.eventAsset)
      ? '/assets/' + state.eventAsset
      : '',
  });
  $('caption').classList.add('visible');
  captionDesignPlayer.setVisible(true, animate);
  return true;
}

function renderCaption(state, preset) {
  const active = state.captionLive;
  const body = active && StageCaptions.lines(active.caption)[active.index];
  const visible = Boolean(state.layers.caption && body);
  const wasOnAir = captionOnAir;
  captionOnAir = visible;
  const layout = workspacePreview && previewPresentation.mode === 'layout';
  const stored = state.captionTemplates.find(({ id }) => id === active?.template?.id);
  const template = visible
    ? stored || active?.template
    : StageCaptions.forProgram(state, state.live);
  if (renderDesignedCaption(state, template, body, visible, layout)) return;
  if (!visible && wasOnAir) {
    if (
      !layout &&
      !reduced &&
      !$('transition').classList.contains('playing') &&
      runCaptionEffect(captionDisplay.exit, false, captionDisplay.exitDuration)
    )
      return;
    clearCaption();
  }
  if (!visible && captionEffect) return;
  const element = $('caption');
  const box = $('captionBox');
  const text = $('captionText');
  const appearance = { ...state.style, ...template?.appearance };
  const root = $('canvas');
  for (const key of ['accent', 'background', 'foreground'])
    root.style.setProperty('--' + key, appearance[key] || preset[key]);
  const separateLatin = Boolean(appearance.latinFont || appearance.latinFontAsset);
  const chineseFont = fontFamily(appearance.font, appearance.fontAsset, preset);
  root.style.setProperty('--font', chineseFont);
  root.style.setProperty(
    '--font-latin',
    separateLatin
      ? fontFamily(appearance.latinFont, appearance.latinFontAsset, preset)
      : chineseFont,
  );
  const defaultSize = preset.id === 'lyrics' || template ? 38 : 29;
  box.style.fontSize = (template?.appearance?.fontSize || defaultSize) + 'px';
  box.style.setProperty('--caption-fill', template?.appearance?.background || 'transparent');
  root.classList.toggle('no-motion', !appearance.motion);
  const bounds = template && StageCaptions.bounds(template);
  box.classList.toggle('caption-template', Boolean(template));
  box.classList.toggle('caption-footage', Boolean(template?.background));
  placeCaptionLayer(state, template, bounds);
  box.style.maxWidth = template ? '' : state.style.lowerWidth + 'px';
  function place(node, geometry) {
    node.style.left = geometry ? geometry.x - bounds.x + 'px' : '';
    node.style.top = geometry ? geometry.y - bounds.y + 'px' : '';
    node.style.width = geometry ? geometry.width + 'px' : '';
    node.style.height = geometry ? geometry.height + 'px' : '';
  }
  place(box, template?.textBox);
  const backdrop = $('captionBackground');
  const placeMedia = (size) =>
    place(backdrop, template && StageCaptions.backgroundPlacement(template, size));
  const effects = StageCaptions.captionTransition(appearance);
  if (visible) captionDisplay = effects;
  captionBackground.set(visible ? template?.background || '' : '', { onDimensions: placeMedia });
  placeMedia(captionBackground.size?.());
  const content = visible ? body : '';
  if (text.textContent !== content || captionUsesLatin !== separateLatin) {
    const switching = visible && wasOnAir && appearance.motion && !reduced;
    captionAnimation?.cancel();
    StageCaptions.setCaptionText(text, content, separateLatin);
    captionUsesLatin = separateLatin;
    if (switching)
      captionAnimation = text.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 150 });
  }
  element.classList.toggle('visible', visible);
  if (visible && wasOnAir === false) {
    runCaptionEffect(!layout && !reduced ? effects.enter : 'cut', true, effects.enterDuration);
  }
}

function render(state) {
  latestState = state;
  if (workspacePreview)
    state = {
      ...state,
      ...draftBranding,
      style: {
        ...state.style,
        ...draftStyle,
        captionX: state.style.captionX,
        captionY: state.style.captionY,
      },
    };
  if (workspacePreview) {
    const config = previewPresentation,
      layers = { ...state.layers };
    const layout = config.mode === 'layout';
    for (const key of ['channel', 'event', 'caption'])
      layers[key] =
        (layout || layers[key]) &&
        (!config.only || config.only === key) &&
        !(config.hidden || []).includes(key);
    state = { ...state, layers };
    if (layout) {
      const item = draftProgram || state.live || state.programs[0];
      const active = !draftProgram && latestState.layers.caption ? state.captionLive : null;
      const previewCaption =
        draftCaptionTemplate !== undefined
          ? state.captionTemplates.find(({ id }) => id === draftCaptionTemplate)
          : draftProgram
            ? StageCaptions.forProgram(state, item)
            : StageCaptions.layoutTemplate(latestState);
      state = {
        ...state,
        captionLive: {
          caption: active?.caption || item?.caption || '歌词字幕 · 排版预览示例',
          index: active?.index ?? 0,
          template: previewCaption || null,
        },
      };
    }
  }
  const template =
    templates.find((item) => item.id === (draftTemplate || state.templateId)) || templates[0];
  const style = state.style,
    root = $('canvas');
  root.dataset.template = template.id;
  root.style.setProperty('--logo-size', style.logoSize + 'px');
  for (const [key, player] of [
    ['channel', channelMedia],
    ['event', eventMedia],
  ]) {
    const element = $(key);
    const src = state[key + 'Asset'];
    element.style.left = style[key + 'X'] + 'px';
    element.style.top = style[key + 'Y'] + 'px';
    element.style.width = style[key + 'Width'] + 'px';
    element.style.height = style[key + 'Height'] + 'px';
    element.classList.toggle('visible', Boolean(state.layers[key] && src));
    player.set(state.layers[key] ? src : '');
  }
  transition(state);
  renderCaption(state, template);
  if (workspacePreview && workspaceOrigin && parent !== window) {
    const boxes = {};
    for (const key of ['channel', 'event', 'caption']) {
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
    eventMedia.stop();
    channelMedia.stop();
    clearCaption();
    captionOnAir = undefined;
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
window.addEventListener('pagehide', () => {
  stopTransition();
  eventMedia.stop();
  channelMedia.stop();
  clearCaption();
});
