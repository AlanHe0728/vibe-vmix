/* Logo / 队徽 */
function onLogoFile(ev, key) {
  var f = ev.target.files && ev.target.files[0];
  if (!f) return;
  var r = new FileReader();
  FBPAssets.pending(key, f.name);
  r.onload = function () {
    var o = {};
    o[key] = r.result;
    o[key + '_filename'] = f.name;
    if (key === 'logo_data') o.logo_show = true;
    sendState(o).then(function (res) {
      if (res) log('已上传并显示: ' + f.name, true);
      else FBPAssets.failed(key);
    });
  };
  r.onerror = function () {
    FBPAssets.failed(key);
    log('图片读取失败', false);
  };
  r.readAsDataURL(f);
}
function clearLogoKey(key) {
  var o = {};
  o[key] = '';
  o[key + '_filename'] = '';
  if (key === 'logo_data') o.logo_show = false;
  sendState(o).then(function (res) {
    if (res) log('已清除: ' + key, true);
  });
}
function resetAllPos() {
  editorOpen();
}
function editorOpen() {
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'open-preview' }, '*');
    return;
  }
  var u = (serverBase || DEFAULT_BASE) + '/control/preview.html';
  window.open(u, '_blank');
  log('已打开 位置/大小 编辑器: ' + u, true);
}
/* 主题 / 皮肤 */
function writeTheme() {
  sendState({
    theme_skin: $('theme_skin').value,
    theme_accent: $('theme_accent').value,
    theme_bg: FBPAssets.background($('theme_bg').value),
    theme_font: $('theme_font').value,
  }).then(function (res) {
    if (res) log('已应用主题（皮肤/颜色/背景/字体）', true);
  });
}
function defaultTheme() {
  $('theme_skin').value = 'dark';
  $('theme_accent').value = PACKAGE.accent;
  $('theme_bg').value = '';
  $('theme_font').value = PACKAGE.font;
  FBPWidgets.sync();
  sendState({
    theme_skin: 'dark',
    theme_accent: PACKAGE.accent,
    theme_bg: '',
    theme_font: PACKAGE.font,
  }).then(function (res) {
    if (res) log('已恢复默认主题', true);
  });
}
/* 自定义：动画/图片/字体 */
function applyCustom() {
  var incoming = Number($('wipe_in').value),
    outgoing = Number($('wipe_out').value);
  if (
    !Number.isFinite(incoming) ||
    incoming < 0.1 ||
    incoming > 5 ||
    !Number.isFinite(outgoing) ||
    outgoing < 0.1 ||
    outgoing > 5
  ) {
    log('入退场时间请输入 0.1–5 秒', false);
    return;
  }
  var o = {
    motion: $('motion').value,
    animdur: parseFloat($('animdur').value) || 1,
    wipe_in: incoming,
    wipe_out: outgoing,
    hold_goal: $('hold_goal').value,
    hold_card: $('hold_card').value,
    hold_rst: $('hold_rst').value,
    hold_ply: $('hold_ply').value,
    hold_sub: $('hold_sub').value,
    font_family: $('font_family').value,
  };
  sendState(o).then(function (res) {
    if (res) log('已应用自定义效果（动画/停留/字体）', true);
  });
}
function defaultCustom() {
  $('wipe_in').value = String(PACKAGE.wipeIn);
  $('wipe_out').value = String(PACKAGE.wipeOut);
  $('motion').value = 'smooth';
  $('animdur').value = '1';
  $('animdurVal').textContent = '1.00×';
  $('hold_goal').value = '5.6';
  $('hold_card').value = '5';
  $('hold_rst').value = '4.5';
  $('hold_ply').value = '4.5';
  $('hold_sub').value = '5';
  $('font_family').value = '';
  FBPWidgets.sync();
  sendState({
    motion: 'smooth',
    animdur: 1,
    wipe_in: PACKAGE.wipeIn,
    wipe_out: PACKAGE.wipeOut,
    hold_goal: '5.6',
    hold_card: '5',
    hold_rst: '4.5',
    hold_ply: '4.5',
    hold_sub: 5,
    font_data: '',
    font_data_filename: '',
    font_family: '',
  }).then(function (res) {
    if (res) log('已恢复默认动画/字体设置', true);
  });
}
function onBgFile(ev) {
  var f = ev.target.files && ev.target.files[0];
  if (!f) return;
  var r = new FileReader();
  FBPAssets.pending('theme_bg', f.name);
  r.onload = function () {
    $('theme_bg').value = '';
    sendState({ theme_bg: r.result, theme_bg_filename: f.name }).then(function (res) {
      if (res) log('已设置背景图（显示在整屏图形下）', true);
      else FBPAssets.failed('theme_bg');
    });
  };
  r.onerror = function () {
    FBPAssets.failed('theme_bg');
    log('背景图读取失败', false);
  };
  r.readAsDataURL(f);
}
function clearBg() {
  $('theme_bg').value = '';
  sendState({ theme_bg: '', theme_bg_filename: '' }).then(function (res) {
    if (res) log('已清除背景图', true);
  });
}
function onFontFile(ev) {
  var f = ev.target.files && ev.target.files[0];
  if (!f) return;
  var r = new FileReader();
  FBPAssets.pending('font_data', f.name);
  r.onload = function () {
    var nm = $('font_family').value.trim() || 'CustomFont';
    sendState({ font_data: r.result, font_data_filename: f.name, font_family: nm }).then(
      function (res) {
        if (res) log('已上传自定义字体：' + f.name, true);
        else FBPAssets.failed('font_data');
      },
    );
  };
  r.onerror = function () {
    FBPAssets.failed('font_data');
    log('字体读取失败', false);
  };
  r.readAsDataURL(f);
}
