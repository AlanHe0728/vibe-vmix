var PACKAGE = window.FBPPackage;
var STATE_URL = FBP.url;
function $(id) {
  return document.getElementById(id);
}
var S = {};
var ONLY = new URLSearchParams(location.search).get('only');
if (['sb', 'clk', 'rst', 'card', 'ply', 'goal', 'sub', 'lineup'].indexOf(ONLY) >= 0) {
  document.querySelectorAll('#canvas>.pos').forEach(function (el) {
    if (el.id !== ONLY) el.classList.add('isolated-out');
  });
}
function fitBroadcastText() {
  fitScoreboardWidth();
  document
    .querySelectorAll(
      '.nm,.cd-name,.ply-name,.gd-who .n,.lu-name,.lu-team-name,.swap-name,.rst-main,.lu-head .tm',
    )
    .forEach(function (el) {
      if (!el.getClientRects().length) return;
      el.style.fontSize = '';
      var size = parseFloat(getComputedStyle(el).fontSize),
        min = el.classList.contains('nm') ? 17 : 16;
      while (el.scrollWidth > el.clientWidth + 1 && size > min) {
        size--;
        el.style.fontSize = size + 'px';
      }
    });
}
if (document.fonts) document.fonts.addEventListener('loadingdone', fitBroadcastText);

function field(n, d) {
  if (S.hasOwnProperty(n) && S[n] !== undefined && S[n] !== null && S[n] !== '') return S[n];
  return d;
}
function setVar(name, h) {
  if (/^#[0-9a-fA-F]{6}$/.test(h || '')) document.documentElement.style.setProperty(name, h);
}
function setCss(name, v) {
  if (v !== undefined && v !== null) document.documentElement.style.setProperty(name, v);
}
/* ---------- 主题 / 皮肤（颜色、皮肤、背景、字体可定制） ---------- */
var PANEL_SKINS = {
  dark: '#263137',
  glass: 'rgba(38,49,55,.95)',
  deep: '#1c2529',
  cyan: '#234c53',
  night: '#314450',
};
function applyTheme() {
  var font = field('theme_font', 'Bahnschrift, Segoe UI, Microsoft YaHei, sans-serif');
  document.body.style.fontFamily = font;
  var accent = field('theme_accent', '#FFD400');
  if (/^#[0-9a-fA-F]{6}$/.test(accent)) {
    setVar('--gold', accent);
    setVar('--clockAcc', accent);
  }
  var skin = field('theme_skin', 'dark');
  setCss('--panel', PANEL_SKINS[skin] || PANEL_SKINS.dark);
  var bg = (field('theme_bg', '') || '').trim();
  document.body.style.background = /^data:image\//i.test(bg)
    ? 'url(' + JSON.stringify(bg) + ') center / cover no-repeat'
    : bg || 'transparent';
  injectFont();
  var m = field('motion', 'smooth');
  setCss('--ease', MOTION_EASE[m] || MOTION_EASE.smooth);
  var wipeEase =
    m === 'smooth' || m === 'apple' || !MOTION_EASE[m] ? FBPMotion.smooth : MOTION_EASE[m];
  setCss('--wipe-ease-in', wipeEase);
  setCss('--wipe-ease-out', wipeEase);
  var d = +field('animdur', 1);
  if (!(d > 0)) d = 1;
  d = Math.max(0.4, Math.min(2.5, d));
  setCss('--animdur', d);
  setCss('--wipe-in', wipeSeconds('in') + 's');
  setCss('--wipe-out', wipeSeconds('out') + 's');
}
var MOTION_EASE = {
  smooth: 'cubic-bezier(.23,1,.32,1)',
  lively: 'cubic-bezier(.16,1,.3,1)',
  soft: 'cubic-bezier(.4,0,.2,1)',
  linear: 'linear',
};
function injectFont() {
  var data = (field('font_data', '') || '').trim(),
    fam = (field('font_family', '') || '').trim() || 'CustomFont';
  var st = document.getElementById('customFontStyle');
  if (data && data.indexOf('data:') === 0) {
    if (!st) {
      st = document.createElement('style');
      st.id = 'customFontStyle';
      document.head.appendChild(st);
    }
    var fmt = '';
    if (/font\/woff2/.test(data)) fmt = "format('woff2')";
    else if (/ttf|opentype|font\/ttf|font\/otf/.test(data)) fmt = "format('truetype')";
    st.textContent =
      "@font-face{font-family:'" +
      fam +
      "';src:url('" +
      data +
      "') " +
      fmt +
      ';font-weight:normal;font-style:normal;}';
    document.body.style.fontFamily = fam + ', Bahnschrift, Segoe UI, Microsoft YaHei, sans-serif';
  } else if (st) {
    st.textContent = '';
  }
}
function post(o) {
  return FBP.post(o).catch(function (e) {
    console.error(e);
    if (EDIT) {
      $('saveStatus').textContent = '保存失败：' + e.message;
    }
    throw e;
  });
}
function truthy(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}
