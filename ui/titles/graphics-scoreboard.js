/* ================= 比分条时钟 ================= */
var CB = { mode: 'up', running: false, accMs: 0, base: 0 };
function sbMs() {
  return FBP.clock(CB);
}
function timeText(ms) {
  var t = Math.floor(Math.max(0, ms) / 1000),
    m = Math.floor(t / 60),
    s = t % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
function fitClock(el, max, min) {
  el.style.fontSize = max + 'px';
  while (el.scrollWidth > el.clientWidth && max > min) el.style.fontSize = --max + 'px';
}
function sbTick() {
  var c = $('sbClock');
  c.textContent = timeText(sbMs());
  c.classList.toggle('paused', !CB.running);
  fitClock(c, 25, 14);
}
function sbBoot() {
  sbTick();
  setInterval(sbTick, 250);
}
var SB_STATUS = { running: '进行中', paused: '比赛暂停', half: '中场休息', over: '比赛结束' };
function sbSetStatus(st) {
  var b = $('sbBadge');
  b.classList.remove('in-bar');
  if (st === 'running') {
    b.classList.remove('show', 'over');
  } else {
    b.classList.add('show');
    b.classList.toggle('over', st === 'over');
    $('sbBadgeTx').textContent = SB_STATUS[st] || st;
    if (b.getBoundingClientRect().top < 4) b.classList.add('in-bar');
  }
}
function setLogo(imgId, data) {
  var img = $(imgId);
  var d = (data || '').trim();
  if (d && d.indexOf('data:') === 0) {
    img.src = d;
    img.classList.remove('empty');
  } else {
    img.removeAttribute('src');
    img.classList.add('empty');
  }
}
var SB_MEASURE = document.createElement('canvas').getContext('2d');
function fitScoreboardWidth() {
  var wrap = $('sb').querySelector('.sb-wrap'),
    logos = truthy(field('sb_logos_show', true)),
    mid = logos ? 136 : 102,
    lane = logos ? 257 : 102;
  wrap.classList.toggle('without-logos', !logos);
  var scoreWidth = 0;
  $('sbMid')
    .querySelectorAll('.sc > span')
    .forEach(function (el) {
      var style = getComputedStyle(el);
      SB_MEASURE.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      scoreWidth += SB_MEASURE.measureText(el.textContent).width;
    });
  mid = Math.min(800, Math.max(mid, Math.ceil(scoreWidth + 18)));
  ['sbHome', 'sbAway'].forEach(function (id) {
    var el = $(id);
    el.style.fontSize = '';
    var style = getComputedStyle(el);
    SB_MEASURE.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
    var spacing = parseFloat(style.letterSpacing) || 0,
      text = el.textContent;
    lane = Math.max(
      lane,
      Math.ceil(
        SB_MEASURE.measureText(text).width +
          Math.max(0, Array.from(text).length - 1) * spacing +
          32 +
          (logos ? 42 : 0),
      ),
    );
  });
  lane = Math.min(lane, (1824 - mid) / 2);
  wrap.style.setProperty('--sb-width', lane * 2 + mid + 'px');
  wrap.style.setProperty('--sb-mid', mid + 'px');
}
function sbApply() {
  setVar('--home', field('colorHome', '#C8102E'));
  setVar('--away', field('colorAway', '#00529F'));
  $('sbHome').textContent = field('teamHome', '主队');
  $('sbAway').textContent = field('teamAway', '客队');
  $('sbH').textContent = field('scoreHome', '0');
  $('sbA').textContent = field('scoreAway', '0');
  $('sbPeriod').textContent = field('period', '上半场');
  setLogo('sbLogoH', field('homeLogo', ''));
  setLogo('sbLogoA', field('awayLogo', ''));
  sbSetStatus(field('status', 'running'));
  $('sb').classList.toggle('on', truthy(field('scoreboard_show', true)));
}

/* ================= 计时器（正计/倒计） ================= */
var CC = { mode: 'down', running: false, accMs: 0, base: 0 };
function ckMs() {
  return FBP.clock(CC);
}
function ckTick() {
  var ms = ckMs();
  var done = CC.mode === 'down' && CC.accMs > 0 && ms <= 0;
  var el = $('clkTime');
  el.textContent = timeText(ms);
  fitClock(el, 76, 24);
  el.classList.toggle('paused', !CC.running);
  el.classList.toggle('done', done);
  $('clkMode').textContent = CC.mode === 'down' ? '倒计时' : '正计时';
}
function ckBoot() {
  ckTick();
  setInterval(ckTick, 200);
}
function ckApply() {
  setVar('--clockAcc', field('clock_color', '#FFD400'));
  $('clkLabel').textContent = field('clock_label', '中场休息');
  $('clkSub').textContent = field('clock_sub', 'COUNTDOWN');
  setGraphicVisible('clk', truthy(field('clock_show', false)));
}
