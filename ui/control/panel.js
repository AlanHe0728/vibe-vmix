FBPDesk.init();
FBPEvents.init();
initPanelLayout();
FBPMatchTiming.init();
FBPRosterPicker.init();
FBPChoices.init();
FBPAssets.init();
initPersist();
FBPLinks.init();
connect();
updateSingleUrl();
observeRemoteStatus();

/* 若用 file:// 直接打开本面板，给出明确指引 */
(function () {
  var served = location.protocol === 'http:' || location.protocol === 'https:';
  var b = document.getElementById('servedBanner');
  if (!served && b) {
    b.innerHTML =
      '⚠️ 本控制面板需通过<b>服务器</b>访问（不要直接双击文件）。<br>' +
      '请先双击 <code>control\\启动控制面板.bat</code>，然后在浏览器地址栏输入：<b>' +
      DEFAULT_BASE +
      '/control/panel.html</b>';
    b.classList.remove('hidden');
  }
})();
