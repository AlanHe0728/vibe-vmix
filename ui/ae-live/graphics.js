'use strict';
const frame = document.getElementById('frame');
let revision = 0;
const workspacePreview = new URLSearchParams(location.search).get('workspacePreview') === '1';
const workspaceOrigin = document.referrer ? new URL(document.referrer).origin : '';
let liveLayout = { x: 0, y: 0, scale: 1 },
  draftLayout = {};
function applyLayout() {
  const layout = { ...liveLayout, ...draftLayout };
  frame.style.transform = `translate(${layout.x}px, ${layout.y}px) scale(${layout.scale})`;
}
if (workspacePreview)
  window.addEventListener('message', (event) => {
    if (
      event.source !== parent ||
      event.origin !== workspaceOrigin ||
      event.data?.type !== 'preview-layout' ||
      event.data.module !== 'ae-live'
    )
      return;
    draftLayout = event.data.layout || {};
    applyLayout();
  });
async function poll() {
  try {
    const response = await fetch('/api/ae/output', { cache: 'no-store' });
    if (!response.ok) throw Error('unavailable');
    const state = await response.json();
    liveLayout = state.layout || liveLayout;
    applyLayout();
    frame.hidden = !state.visible || !state.connected || !state.frameRevision;
    if (!frame.hidden && state.frameRevision !== revision) {
      revision = state.frameRevision;
      const image = new Image();
      image.onload = () => {
        frame.src = image.src;
      };
      image.src = '/frame.png?revision=' + revision;
    }
  } catch (_) {
    frame.hidden = true;
    revision = 0;
  }
  setTimeout(poll, 150);
}
poll();
