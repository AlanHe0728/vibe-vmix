/* ================= 状态轮询 ================= */
var prev = {};
function applyState(s, initial) {
  if (initial) {
    Object.keys(s).forEach(function (k) {
      if (/_tick$/.test(k)) prev[k] = s[k];
    });
  }
  S = s || {};
  if (S.sb_clock_state) {
    CB = S.sb_clock_state;
    sbTick();
  }
  if (S.clock_state) {
    CC = S.clock_state;
    ckTick();
  }
  Object.keys(POS_DEF).forEach(function (key) {
    applyPos(key, key);
  });
  applyTheme();
  sbApply();
  ckApply();
  luApplyAll();
  logoApply();
  fitBroadcastText();
  if (WORKSPACE_PREVIEW) requestAnimationFrame(workspaceGeometry);

  if (S.score_tick !== undefined && S.score_tick !== prev.score_tick) {
    prev.score_tick = S.score_tick;
    var mid = $('sbMid');
    mid.classList.remove('flash');
    void mid.offsetWidth;
    mid.classList.add('flash');
  }
  if (S.restart_tick !== undefined && S.restart_tick !== prev.restart_tick) {
    prev.restart_tick = S.restart_tick;
    if (RST[S.restart_type]) rstShow(S.restart_type);
  }
  if (S.card_tick !== undefined && S.card_tick !== prev.card_tick) {
    prev.card_tick = S.card_tick;
    if (S.card_trigger === 'red' || S.card_trigger === 'yellow') cdShow(S.card_trigger);
  }
  if (S.sub_tick !== undefined && S.sub_tick !== prev.sub_tick) {
    prev.sub_tick = S.sub_tick;
    if (S.sub_trigger === 'show') subShow();
  }
  if (S.player_tick !== undefined && S.player_tick !== prev.player_tick) {
    prev.player_tick = S.player_tick;
    plyShow();
  }
  if (S.goal_tick !== undefined && S.goal_tick !== prev.goal_tick) {
    prev.goal_tick = S.goal_tick;
    goalShow();
  }
  if (S.clear_events_tick !== undefined && S.clear_events_tick !== prev.clear_events_tick) {
    prev.clear_events_tick = S.clear_events_tick;
    OVERLAP.forEach(function (id) {
      hideGraphic(id);
      if (AUTO[id]) clearTimeout(AUTO[id]);
      AUTO[id] = null;
    });
  }
  if (EDIT) {
    updateSelUI();
    FBPEditor.refresh();
  }
}
FBP.poll(applyState);

/* 初始化：比分时钟 / 计时器 / 显示 / 位置 / 拖拽 / 缩放 / 编辑 */
sbBoot();
ckBoot();
applyTheme();
sbApply();
ckApply();
luApplyAll();
logoApply();
fitBroadcastText();
Object.keys(POS_DEF).forEach(function (key) {
  applyPos(key, key);
  makeDrag(key, key);
});
Object.keys(POS_DEF).forEach(function (key) {
  var el = $(key);
  var h = document.createElement('div');
  h.className = 'rsz';
  el.appendChild(h);
  makeResize(key, key);
});
enterEdit();
initSlider();
clearSel();
FBPEditor.init();
