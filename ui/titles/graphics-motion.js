/* ---------- 重叠自动打断 ---------- */
var OVERLAP = ['goal', 'card', 'rst', 'ply', 'sub'];
function rect(el) {
  return el.getBoundingClientRect();
}
function intersects(a, b) {
  var ra = rect(a),
    rb = rect(b);
  return !(
    ra.right <= rb.left ||
    ra.left >= rb.right ||
    ra.bottom <= rb.top ||
    ra.top >= rb.bottom
  );
}
function interrupt(id) {
  if (EDIT) return;
  var el = $(id);
  OVERLAP.forEach(function (o) {
    if (o === id) return;
    var e = $(o);
    if (e.classList.contains('on') && intersects(e, el)) {
      hideGraphic(o, true);
      if (AUTO[o]) {
        clearTimeout(AUTO[o]);
        AUTO[o] = null;
      }
    }
  });
}

/* ---------- 通用：定时显示/退场 ---------- */
var AUTO = {};
function wipeSeconds(direction) {
  var n = Number(field('wipe_' + direction, direction === 'in' ? 0.45 : 0.28));
  if (!isFinite(n)) n = direction === 'in' ? 0.45 : 0.28;
  return Math.max(0.1, Math.min(5, n)) * Math.max(0.4, Math.min(2.5, +field('animdur', 1) || 1));
}
var WIPES = {};
function wipeEasing(direction) {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue('--wipe-ease-' + direction)
      .trim() || FBPMotion.smooth
  );
}
function wipeOptions(direction) {
  return { duration: wipeSeconds(direction) * 1000, easing: wipeEasing(direction) };
}
function replayWipe(id) {
  var el = $(id),
    style = getComputedStyle(el),
    current = style.clipPath,
    opacity = style.opacity;
  if (WIPES[id]) WIPES[id].cancel();
  delete WIPES[id];
  if (EDIT || matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  var closed = style.getPropertyValue('--wipe-closed').trim(),
    open = style.getPropertyValue('--wipe-open').trim(),
    incoming = wipeSeconds('in');
  if (id === 'sb') {
    // Scorebar retains its previous curve, one-sided wipe and fade.
    WIPES[id] = el.animate(
      [
        { clipPath: closed, opacity: 0.15 },
        { clipPath: open, opacity: 1 },
      ],
      { duration: incoming * 1000, easing: style.getPropertyValue('--ease').trim() },
    );
    return incoming;
  }
  var outgoing = wipeSeconds('out'),
    total = outgoing + incoming;
  // Replaying a visible graphic must close from the live mask first. Each phase
  // has a smooth rest at the seam; no instant reset to the fully closed mask.
  WIPES[id] = el.animate(
    [
      { clipPath: current, opacity: opacity, offset: 0, easing: wipeEasing('out') },
      { clipPath: closed, opacity: 1, offset: outgoing / total, easing: wipeEasing('in') },
      { clipPath: open, opacity: 1, offset: 1 },
    ],
    { duration: total * 1000, easing: 'linear' },
  );
  return total;
}
function hideGraphic(id, instant) {
  instant = instant === true;
  var el = $(id),
    animation = WIPES[id],
    from = null,
    style = getComputedStyle(el);
  // A hide during a repeated reveal closes the currently visible portion,
  // rather than cancelling back to the fully open panel for one frame.
  if (
    !instant &&
    animation &&
    animation.playState !== 'finished' &&
    !EDIT &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    from = { clipPath: style.clipPath, opacity: style.opacity };
  if (animation) animation.cancel();
  delete WIPES[id];
  if (instant) el.style.transition = 'none';
  el.classList.remove('on');
  if (instant) {
    void el.offsetWidth;
    el.style.transition = '';
  } else if (from)
    WIPES[id] = el.animate(
      [
        from,
        {
          clipPath: style.getPropertyValue('--wipe-closed').trim(),
          opacity: Number(style.getPropertyValue('--wipe-start-opacity')),
        },
      ],
      wipeOptions('out'),
    );
}
function setGraphicVisible(id, show) {
  var el = $(id);
  if (!show) {
    if (el.classList.contains('on')) hideGraphic(id);
    return;
  }
  if (!el.classList.contains('on') && WIPES[id]) {
    var animation = WIPES[id],
      style = getComputedStyle(el),
      from = { clipPath: style.clipPath, opacity: style.opacity },
      active = animation.playState !== 'finished';
    animation.cancel();
    delete WIPES[id];
    el.classList.add('on');
    if (active && !EDIT && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      WIPES[id] = el.animate(
        [from, { clipPath: style.getPropertyValue('--wipe-open').trim(), opacity: 1 }],
        wipeOptions('in'),
      );
  } else el.classList.add('on');
}
function showFor(id, defMs) {
  var el = $(id),
    was = el.classList.contains('on'),
    h = +field('hold_' + id, 0),
    ms = h > 0 ? h * 1000 : defMs;
  setGraphicVisible(id, true);
  var entrance = was ? replayWipe(id) : wipeSeconds('in');
  if (AUTO[id]) clearTimeout(AUTO[id]);
  AUTO[id] = setTimeout(
    function () {
      hideGraphic(id);
      AUTO[id] = null;
    },
    ms + (EDIT || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : entrance * 1000),
  );
}
