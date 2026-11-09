'use strict';
const byId = (id) => document.getElementById(id);
let model, active;
function output(module) {
  return (
    module.url +
    (module.id === 'stage'
      ? '/stage/graphics.html'
      : module.id === 'ae-live'
        ? '/ae/graphics.html'
        : '/titles/graphics.html')
  );
}
async function request(payload) {
  const response = await fetch(
    '/api/workspace',
    payload
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      : { cache: 'no-store' },
  );
  const body = await response.json();
  if (!response.ok) throw Error(body.error);
  return body;
}
function manage() {
  active = null;
  byId('moduleFrame').src = 'about:blank';
  byId('moduleView').hidden = true;
  byId('modules').hidden = false;
  document
    .querySelectorAll('#navigation button')
    .forEach((button) => button.setAttribute('aria-current', 'false'));
}
function open(module) {
  active = module;
  byId('modules').hidden = true;
  byId('moduleView').hidden = false;
  byId('moduleName').textContent = module.name;
  byId('moduleAddress').textContent = output(module);
  byId('moduleFrame').src =
    module.url +
    (module.id === 'stage'
      ? '/stage/control.html'
      : module.id === 'ae-live'
        ? '/ae/control.html'
        : '/control/panel.html');
  document
    .querySelectorAll('#navigation button')
    .forEach((button) =>
      button.setAttribute('aria-current', String(button.dataset.id === module.id)),
    );
}
function render() {
  byId('workspaceVersion').textContent = '本地制作 · ' + model.version;
  byId('catalog').replaceChildren();
  byId('navigation').replaceChildren();
  for (const module of model.modules) {
    const label = document.createElement('label');
    label.className = 'module-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'module';
    checkbox.value = module.id;
    checkbox.checked = module.enabled;
    const title = document.createElement('strong');
    title.textContent = module.name;
    const description = document.createElement('p');
    description.className = 'module-description';
    description.textContent = module.description;
    const features = document.createElement('div');
    features.className = 'features';
    module.features.forEach((feature) => {
      const span = document.createElement('span');
      span.textContent = feature;
      features.append(span);
    });
    const state = document.createElement('span');
    state.className = 'state-label';
    state.textContent = module.enabled ? '已加载 · 独立保存数据' : '未加载';
    label.append(checkbox, title, description, features, state);
    byId('catalog').append(label);
    if (module.enabled) {
      const button = document.createElement('button');
      button.textContent = module.name;
      button.dataset.id = module.id;
      button.onclick = () => open(module);
      byId('navigation').append(button);
    }
  }
}
byId('moduleForm').onsubmit = async (event) => {
  event.preventDefault();
  byId('apply').disabled = true;
  byId('notice').textContent = '正在切换模块…';
  try {
    model = await request({
      enabled: [...document.querySelectorAll('input[name=module]:checked')].map(
        (input) => input.value,
      ),
    });
    render();
    byId('notice').textContent = model.loaded.length
      ? '已应用。点击左侧模块开始操作。'
      : '全部模块已卸载，已保存数据保留。';
  } catch (error) {
    byId('notice').textContent = error.message;
  } finally {
    byId('apply').disabled = false;
  }
};
byId('manage').onclick = manage;
function openPreview(id) {
  const module = id || active?.id || 'all';
  if (window.chrome?.webview) window.chrome.webview.postMessage({ type: 'open-preview', module });
  else window.open('/workspace/preview.html?module=' + encodeURIComponent(module), '_blank');
}
byId('openPreview').onclick = () => openPreview();
document.querySelector('.brand').onclick = (event) => {
  event.preventDefault();
  manage();
};
byId('copyAddress').onclick = async () => {
  try {
    await navigator.clipboard.writeText(output(active));
    byId('copyAddress').textContent = '已复制';
  } catch (_) {
    byId('moduleAddress').textContent = '请手动复制：' + output(active);
  }
};
// Native file selection preserves the source project's dependencies in place.
window.addEventListener('message', (event) => {
  if (!active || event.source !== byId('moduleFrame').contentWindow || event.origin !== active.url)
    return;
  if (event.data?.type === 'open-preview') {
    openPreview(active.id);
    return;
  }
  if (['import-source', 'open-source'].includes(event.data?.type) && window.chrome?.webview)
    window.chrome.webview.postMessage(event.data);
});
window.addEventListener('native-source', (event) => {
  if (active)
    byId('moduleFrame').contentWindow.postMessage(
      { type: 'native-source', path: event.detail.path },
      active.url,
    );
});
request()
  .then((body) => {
    model = body;
    render();
  })
  .catch((error) => {
    byId('notice').textContent = error.message;
  });
