'use strict';

(() => {
  if (!window.workspaceWindow?.customTitleBar || !window.chrome?.webview) return;
  document.documentElement.classList.add('native-window');
  const controls = document.createElement('div');
  controls.className = 'native-window-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', '窗口控制');
  for (const [action, label] of [
    ['minimize', '最小化'],
    ['maximize', '最大化'],
    ['close', '关闭窗口'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.windowAction = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    const icon = document.createElement('span');
    icon.className = 'window-' + action + '-icon';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    button.onclick = () => window.chrome.webview.postMessage({ type: 'window-command', action });
    controls.append(button);
  }
  document.querySelector('body > header').append(controls);
  window.chrome.webview.addEventListener('message', (event) => {
    if (event.data?.type !== 'window-state') return;
    const maximized = event.data.maximized;
    controls.dataset.maximized = String(maximized);
    const button = controls.querySelector('[data-window-action="maximize"]');
    button.title = maximized ? '还原' : '最大化';
    button.setAttribute('aria-label', button.title);
  });
  function syncTheme() {
    window.chrome.webview.postMessage({
      type: 'window-theme',
      theme: window.operatorTheme.get(),
    });
  }
  window.addEventListener('operator-theme-change', syncTheme);
  syncTheme();
})();
