/* ---------- 编辑模式 / 位置 / 缩放 / 拖拽 ---------- */
var EDIT = (function () {
  try {
    return new URLSearchParams(location.search).get('edit') === '1';
  } catch (e) {
    return false;
  }
})();
var POS_DEF = {
  sb: { x: 423, y: 96, s: 1 },
  clk: { x: 960, y: 400, s: 1 },
  rst: { x: 960, y: 918, s: 1 },
  card: { x: 960, y: 500, s: 1 },
  ply: { x: 390, y: 918, s: 1 },
  goal: { x: 960, y: 500, s: 1 },
  sub: { x: 960, y: 500, s: 1 },
  logo: { x: 1760, y: 96, s: 1 },
  lineup: { x: 960, y: 540, s: 1 },
};
var DRAG = {},
  SCALE = {},
  PENDING = {};
function editValueMatches(actual, expected) {
  if (actual === expected) return true;
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object')
    return false;
  var keys = Object.keys(expected);
  return (
    keys.length === Object.keys(actual).length &&
    keys.every(function (k) {
      return (
        Object.prototype.hasOwnProperty.call(actual, k) && editValueMatches(actual[k], expected[k])
      );
    })
  );
}
function saveEdit(id, o) {
  if (id === 'lineup' && luIsAll()) {
    var mapped = {};
    Object.keys(o).forEach(function (k) {
      mapped[k.replace(/^lineup_/, 'lineup_all_')] = o[k];
    });
    o = mapped;
  }
  PENDING[id] = o;
  $('saveStatus').textContent = '保存中…';
  return post(o)
    .then(function () {
      $('saveStatus').textContent = '已保存';
    })
    .catch(function () {
      delete PENDING[id];
      DRAG[id] = false;
      applyPos(id, id);
      updateSelUI();
    })
    .then(function () {
      DRAG[id] = false;
    });
}
function applyPos(key, id) {
  if (DRAG[id]) return;
  if (PENDING[id]) {
    var waiting = Object.keys(PENDING[id]).some(function (k) {
      return !editValueMatches(S[k], PENDING[id][k]);
    });
    if (waiting) return;
    delete PENDING[id];
  }
  var p = POS_DEF[key];
  if (key === 'lineup' && luIsAll()) {
    key = 'lineup_all';
    p = { x: PACKAGE.positions.lineup_all[0], y: PACKAGE.positions.lineup_all[1], s: 1 };
  }
  var st = S[key + '_pos'];
  if (st && typeof st === 'object' && isFinite(+st.x) && isFinite(+st.y)) {
    p = { x: +st.x, y: +st.y, s: p.s };
  }
  var sc = isFinite(+S[key + '_scale']) ? Math.max(0.3, Math.min(3, +S[key + '_scale'])) : p.s;
  SCALE[id] = sc;
  var el = $(id);
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  el.style.transform = 'translate(-50%,-50%) scale(' + sc + ')';
  var h = el.querySelector('.rsz');
  if (h) h.style.transform = 'scale(' + 1 / sc + ')';
}
function makeDrag(key, id) {
  var el = $(id);
  el.addEventListener('pointerdown', function (e) {
    if (!EDIT) return;
    if (e.target.classList.contains('rsz')) return;
    e.preventDefault();
    selectEl(id);
    var s = {
      x: parseFloat(el.style.left) || POS_DEF[key].x,
      y: parseFloat(el.style.top) || POS_DEF[key].y,
    };
    var ox = e.clientX,
      oy = e.clientY,
      moved = false;
    DRAG[id] = true;
    FBPEditor.drag(true);
    if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
    function mv(ev) {
      moved = true;
      var dx = ev.clientX - ox,
        dy = ev.clientY - oy;
      s.x += dx;
      s.y += dy;
      ox = ev.clientX;
      oy = ev.clientY;
      var shown = FBPEditor.snap(s.x, s.y);
      el.style.left = shown.x + 'px';
      el.style.top = shown.y + 'px';
      FBPEditor.notify();
    }
    function up() {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      FBPEditor.drag(false);
      if (moved) {
        var o = {};
        o[key + '_pos'] = {
          x: Math.round(parseFloat(el.style.left)),
          y: Math.round(parseFloat(el.style.top)),
        };
        saveEdit(id, o).then(FBPEditor.notify);
      } else DRAG[id] = false;
    }
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}
function makeResize(key, id) {
  var el = $(id),
    handle = el.querySelector('.rsz');
  if (!handle) return;
  handle.addEventListener('pointerdown', function (e) {
    if (!EDIT) return;
    e.preventDefault();
    e.stopPropagation();
    DRAG[id] = true;
    selectEl(id);
    FBPEditor.drag(true);
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    var dx = e.clientX - cx,
      dy = e.clientY - cy,
      startDist = Math.sqrt(dx * dx + dy * dy) || 1,
      startScale = SCALE[id] || 1;
    function mv(ev) {
      var ddx = ev.clientX - cx,
        ddy = ev.clientY - cy,
        d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      var ns = Math.max(0.3, Math.min(3, (startScale * d) / startDist));
      SCALE[id] = ns;
      el.style.transform = 'translate(-50%,-50%) scale(' + ns + ')';
      handle.style.transform = 'scale(' + 1 / ns + ')';
      if (scSlider && id === selectedId) {
        scSlider.value = ns;
        scVal.textContent = ns.toFixed(2);
      }
      FBPEditor.notify();
    }
    function up() {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      FBPEditor.drag(false);
      var o = {};
      o[key + '_scale'] = Math.round((SCALE[id] || 1) * 100) / 100;
      saveEdit(id, o).then(FBPEditor.notify);
    }
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}
function enterEdit() {
  if (!EDIT) return;
  document.body.classList.add('edit');
  Object.keys(POS_DEF).forEach(function (key) {
    $(key).classList.add('on');
  });
}
function resetPos() {
  post({ posreset_tick: Date.now() }).catch(function () {});
}
function goPanel() {
  window.open(new URL('/control/panel.html', STATE_URL).href, '_blank');
}

/* ---------- 选中 + 无极缩放滑杆（编辑模式） ---------- */
var selectedId = null,
  scSlider = null,
  scVal = null;
function selectEl(id) {
  if (!EDIT) return;
  if (selectedId && selectedId !== id) {
    var ex = $(selectedId);
    if (ex) ex.classList.remove('sel');
  }
  selectedId = id;
  if ($(id)) $(id).classList.add('sel');
  updateSelUI();
}
function clearSel() {
  if (selectedId) {
    var ex = $(selectedId);
    if (ex) ex.classList.remove('sel');
  }
  selectedId = null;
  updateSelUI();
}
function updateSelUI() {
  if (!$('selLabel') || !scSlider || !scVal) return;
  if (selectedId) {
    $('selLabel').textContent = selectedId.toUpperCase();
    var v = SCALE[selectedId] || 1;
    scSlider.value = v;
    scVal.textContent = v.toFixed(2);
  } else {
    $('selLabel').textContent = '无';
  }
  FBPEditor.notify();
}
function initSlider() {
  scSlider = $('scSlider');
  scVal = $('scVal');
  if (!scSlider) return;
  var slidingId = null;
  function begin() {
    if (!slidingId && selectedId) {
      slidingId = selectedId;
      DRAG[slidingId] = true;
    }
  }
  scSlider.addEventListener('pointerdown', begin);
  scSlider.addEventListener('input', function () {
    begin();
    if (!slidingId) return;
    var ns = parseFloat(scSlider.value);
    SCALE[slidingId] = ns;
    var el = $(slidingId);
    el.style.transform = 'translate(-50%,-50%) scale(' + ns + ')';
    var h = el.querySelector('.rsz');
    if (h) h.style.transform = 'scale(' + 1 / ns + ')';
    scVal.textContent = ns.toFixed(2);
    FBPEditor.notify();
  });
  function finish() {
    if (!slidingId) return;
    var id = slidingId;
    slidingId = null;
    var o = {};
    o[id + '_scale'] = Math.round((SCALE[id] || 1) * 100) / 100;
    saveEdit(id, o).then(FBPEditor.notify);
  }
  scSlider.addEventListener('change', finish);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  scSlider.addEventListener('blur', finish);
}
function resetSelScale() {
  if (!selectedId) return;
  var id = selectedId,
    s = POS_DEF[id].s;
  SCALE[id] = s;
  DRAG[id] = true;
  $(id).style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  var h = $(id).querySelector('.rsz');
  if (h) h.style.transform = 'scale(1)';
  if (scSlider) scSlider.value = s;
  if (scVal) scVal.textContent = s.toFixed(2);
  var o = {};
  o[id + '_scale'] = s;
  saveEdit(id, o);
}
