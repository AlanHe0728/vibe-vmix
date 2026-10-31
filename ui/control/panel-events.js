/* ---------- 发球 ---------- */
function restart(type) {
  sendState({
    restart_type: type,
    restart_team: $('restart_team').value,
    restart_player: $('restart_player').value,
    restart_side: $('restart_side').value,
    restart_num: $('restart_num').value,
    restart_name: $('restart_name').value,
    restart_text: $('restart_text').value,
    restart_color: $('restart_color').value,
    restart_trigger: type,
    restart_tick: nTick(),
  });
}

/* ---------- 红黄牌 ---------- */
function card(type) {
  sendState({
    card_type: type,
    card_num: $('card_num').value,
    card_name: $('card_name').value,
    card_team: $('card_team').value,
    card_reason: $('card_reason').value,
    card_trigger: type,
    card_side: $('card_side').value,
    card_tick: nTick(),
  });
}

/* ---------- 球员条 ---------- */
function writePlayer() {
  sendState({
    player_name: $('player_name').value,
    player_num: $('player_num').value,
    player_team: $('player_team').value,
    player_pos: $('player_pos').value,
    player_event: $('player_event').value,
    player_title: $('player_event').value.trim() || '球员信息',
    player_color: $('player_color').value,
    player_side: $('player_side').value,
    player_trigger: 'show',
    player_tick: nTick(),
  });
}

/* ---------- 进球 ---------- */
function writeGoal() {
  var side = $('goal_side').value,
    sync = $('goal_sync').checked;
  var patch = {
    goal_team: $('goal_team').value,
    goal_name: $('goal_name').value,
    goal_num: $('goal_num').value,
    goal_color: $('goal_color').value,
    goal_scoreHome: $('goal_scoreHome').value,
    goal_scoreAway: $('goal_scoreAway').value,
    goal_side: side,
    goal_trigger: 'goal',
  };
  if (sync) {
    // Explicit, one-use opt-in; score deltas are applied atomically by the server.
    patch[side === 'home' ? 'scoreHome_delta' : 'scoreAway_delta'] = 1;
    patch.score_trigger = 'flash';
    patch.score_tick = nTick();
  }
  patch.goal_tick = nTick();
  return sendState(patch).then(function (res) {
    if (res) $('goal_sync').checked = false;
    return res;
  });
}
/* Quick scoring is independent of every animation and uses atomic server deltas. */
function quickScore(side) {
  if (side !== 'home' && side !== 'away') return Promise.resolve(null);
  var patch = {};
  patch[side === 'home' ? 'scoreHome_delta' : 'scoreAway_delta'] = 1;
  return sendState(patch);
}
function quickGoal(side) {
  return quickScore(side);
}
function quickResetScore() {
  $('scoreHome').value = 0;
  $('scoreAway').value = 0;
  $('goal_scoreHome').value = 0;
  $('goal_scoreAway').value = 0;
  return sendState({ scoreHome: 0, scoreAway: 0, goal_scoreHome: 0, goal_scoreAway: 0 });
}

/* ---------- D200 内容准备与外部比分同步 ---------- */
function executeSubstitution() {
  return panelAPI()
    .status()
    .then(function (s) {
      if (!s.onfield || !Array.isArray(s.onfield.home) || !Array.isArray(s.onfield.away))
        throw Error(
          '当前服务是旧版本，请关闭原控制服务，再启动工作副本的启动控制面板.bat，刷新面板后执行换人。',
        );
      FBPLinks.liveRoster(s.onfield);
      var patch = FBPLinks.substitutionPatch(true);
      if (!patch) return;
      return sendState(patch);
    })
    .catch(function (e) {
      $('writeStatus').textContent = e.message;
      $('sub_match_hint').textContent = e.message;
      log(e.message, false);
    });
}
function prepareD200(group) {
  if (group === 'sub') {
    var sub = FBPLinks.substitutionPatch(false);
    return sub ? sendState(sub) : Promise.resolve(null);
  }
  var fields = {
    card: ['type', 'side', 'num', 'name', 'team', 'reason'],
    player: ['side', 'name', 'num', 'team', 'pos', 'event', 'color'],
    goal: ['side', 'name', 'num', 'team', 'color'],
    restart: ['type', 'side', 'num', 'name', 'team', 'player', 'text', 'color'],
    xiH: ['team', 'subtitle', 'color', 'players'],
    xiA: ['team', 'subtitle', 'color', 'players'],
    subH: ['team', 'subtitle', 'color', 'players'],
    subA: ['team', 'subtitle', 'color', 'players'],
  };
  var patch = {};
  Object.keys(fields).forEach(function (prefix) {
    if (group !== 'all' && group !== prefix) return;
    fields[prefix].forEach(function (key) {
      var id = prefix + '_' + key;
      patch[id] = $(id).value;
    });
  });
  if (group === 'all' || group === 'player')
    patch.player_title = $('player_event').value.trim() || '球员信息';
  return sendState(patch).then(function (res) {
    if (res) log('内容已保存', true);
    return res;
  });
}
var REMOTE_SCORES = {};
function observeRemoteStatus() {
  panelAPI()
    .status()
    .then(function (s) {
      renderLiveStatus(s);
      if (WRITE_COUNT) return;
      FBPLinks.liveRoster(s.onfield);
      FBPChoices.render(s.controls);
      if (s.controls) renderMatchStatus(s.controls.status);
      [
        { key: 'scoreHome', value: s.score.home },
        { key: 'scoreAway', value: s.score.away },
      ].forEach(function (item) {
        if (REMOTE_SCORES[item.key] === item.value) return;
        if (FBPLinks.remoteScore(item.key === 'scoreHome' ? 'home' : 'away', item.value))
          REMOTE_SCORES[item.key] = item.value;
      });
    })
    .catch(function () {
      $('liveClockState').textContent = '状态同步中断';
    })
    .then(function () {
      setTimeout(observeRemoteStatus, 1000);
    });
}
