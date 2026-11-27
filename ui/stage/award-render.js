/* AE plates at 25 fps, with independently editable recipient text. */
(() => {
  const assetRoot = new URL('award-assets/', document.currentScript.src);
  const validIds = new Set(['champion', 'runner-up', 'third', 'popular', 'teacher-1', 'teacher-2']);
  const clamp = value => Math.max(0, Math.min(1, value));

  function create(element) {
    element.classList.add('award-layer');
    element.innerHTML = '<div class="award-panel"><canvas class="award-plate" width="470" height="210"></canvas><div class="award-recipient"></div></div>';
    const panel = element.querySelector('.award-panel');
    const ctx = element.querySelector('canvas').getContext('2d');
    const recipient = element.querySelector('.award-recipient');
    let cue = null;
    let fixedNow;
    let raf = 0;
    let previousTick = -1;
    let activeId = '';
    let sheets = {};
    let generation = 0;
    let previousName = null;

    function selectAward(id) {
      if (id === activeId) return;
      activeId = id;
      generation += 1;
      const currentGeneration = generation;
      // Drop references to the previous award; never display its pixels while loading.
      sheets = {};
      ctx.clearRect(0, 0, 470, 210);
      recipient.style.opacity = '0';
      for (const phase of ['in', 'loop', 'out']) {
        const image = new Image();
        sheets[phase] = image;
        image.onload = () => {
          if (currentGeneration === generation && fixedNow !== undefined) draw();
        };
        image.src = new URL(`${id}-${phase}.webp`, assetRoot).href;
      }
    }

    function paint(phase, frame, alpha) {
      const image = sheets[phase];
      if (!image || !image.complete || !image.naturalWidth || alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, frame % 10 * 470, Math.floor(frame / 10) * 210, 470, 210, 0, 0, 470, 210);
      ctx.globalAlpha = 1;
    }

    function draw() {
      if (!cue) { element.style.display = 'none'; return; }
      const rawNow = fixedNow === undefined ? Date.now() : fixedNow;
      const now = Math.floor(rawNow / 40) * 40;
      if (fixedNow === undefined && now === previousTick) {
        raf = requestAnimationFrame(draw);
        return;
      }
      previousTick = now;
      const start = Number(cue.startedAt);
      const elapsed = (now - start) / 1000;
      const naturalExit = start + (3.2 + Math.max(0, Number(cue.holdSeconds) || 0)) * 1000;
      const exit = Number(cue.exitAt) > 0 ? Number(cue.exitAt) : naturalExit;
      const exiting = now >= exit;
      const exitElapsed = (now - exit) / 1000;
      if (!Number.isFinite(start) || elapsed < 0 || (exiting && exitElapsed >= .8)) {
        element.style.display = 'none';
        if (elapsed < 0 && fixedNow === undefined) raf = requestAnimationFrame(draw);
        return;
      }
      element.style.display = '';
      const plateElapsed = exiting ? Math.max(0, (exit - start) / 1000) : elapsed;
      const phase = plateElapsed < 3.2 ? 'in' : 'loop';
      const frame = phase === 'in' ? Math.min(79, Math.floor(plateElapsed * 25)) : Math.floor((plateElapsed - 3.2) * 25) % 100;
      const reveal = clamp((plateElapsed - 2.5) / .6);
      const useExitPlate = exiting && reveal >= 1 && sheets.out.complete && sheets.out.naturalWidth;
      const transition = useExitPlate ? clamp(exitElapsed / .16) : 0;
      ctx.clearRect(0, 0, 470, 210);
      paint(phase, frame, 1 - transition);
      if (useExitPlate) paint('out', Math.min(19, Math.floor(exitElapsed * 25)), transition);
      panel.style.opacity = String(exiting && !useExitPlate ? clamp(1 - exitElapsed / .8) : 1);
      const plateReady = sheets[phase].complete && sheets[phase].naturalWidth;
      recipient.style.opacity = String(plateReady ? reveal * (exiting ? clamp(1 - exitElapsed / .8) : 1) : 0);
      if (fixedNow === undefined) raf = requestAnimationFrame(draw);
    }

    function setCue(nextCue, nowMs) {
      cancelAnimationFrame(raf);
      cue = nextCue;
      fixedNow = nowMs;
      previousTick = -1;
      if (cue) {
        const id = validIds.has(cue.awardId) ? cue.awardId : 'champion';
        selectAward(id);
        const name = cue.recipient || '';
        if (name !== previousName) {
          recipient.textContent = name;
          recipient.style.fontSize = `${Math.min(82, 270 / Math.max(1, Array.from(name).length))}px`;
          previousName = name;
        }
      }
      draw();
    }
    return {
      render(nextCue, nowMs) { setCue(nextCue, nowMs); },
      still(nextCue) { setCue(nextCue, Number(nextCue.startedAt) + 3200); },
      destroy() { cancelAnimationFrame(raf); generation += 1; sheets = {}; element.replaceChildren(); element.classList.remove('award-layer'); }
    };
  }
  window.StageAwardRenderer = { create };
})();
