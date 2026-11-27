'use strict';

const awardStage = document.getElementById('awardStage');
const renderer = StageAwardRenderer.create(document.getElementById('awardGraphic'));
function resizeAwardStage() {
  awardStage.style.setProperty('--stage-scale', Math.min(innerWidth / 1920, innerHeight / 1080));
}
resizeAwardStage();
window.addEventListener('resize', resizeAwardStage);

function connectPreview() {
  awardStage.classList.add('with-reference');
  if (window.parent === window) return;
  let endTimer;
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== location.origin) return;
    const { type, cue } = event.data || {};
    if (type !== 'award-still' && type !== 'award-preview') return;
    clearTimeout(endTimer);
    if (!cue) return renderer.render(null);
    if (type === 'award-still') return renderer.still({ ...cue, startedAt: Date.now(), exitAt: 0 });
    renderer.render(cue);
    const exit = cue.exitAt || cue.startedAt + 3200 + cue.holdSeconds * 1000;
    endTimer = setTimeout(() => {
      renderer.render(null);
      parent.postMessage({ type: 'award-preview-ended', startedAt: cue.startedAt }, location.origin);
    }, Math.max(0, exit + 800 - Date.now()));
  });
  parent.postMessage({ type: 'award-preview-ready' }, location.origin);
}

async function connectProgram() {
  let etag = '';
  async function poll() {
    try {
      const response = await fetch('/api/stage/award', {
        cache: 'no-store',
        headers: etag ? { 'If-None-Match': etag } : {},
      });
      if (response.ok) {
        const { cue } = await response.json();
        renderer.render(cue);
        etag = response.headers.get('ETag') || '';
      }
    } catch {
      // The current cue continues on its original clock, including its scheduled exit.
    }
    setTimeout(poll, 100);
  }
  await poll();
}

if (new URLSearchParams(location.search).get('workspacePreview') === '1') connectPreview();
else connectProgram();
