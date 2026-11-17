'use strict';
const byId = (id) => document.getElementById(id);
let model, active, lastSelected;
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
  byId('moduleName').textContent = '';
  byId('modules').hidden = false;
  document
    .querySelectorAll('#navigation button')
    .forEach((button) => button.setAttribute('aria-current', 'false'));
}
function open(module) {
  active = module;
  lastSelected = module.id;
  try {
    sessionStorage.setItem('workspace-module', module.id);
  } catch {}
  byId('modules').hidden = true;
  byId('moduleView').hidden = false;
  byId('moduleName').textContent = module.name;
  byId('moduleFrame').src =
    module.url +
    (module.id === 'stage'
      ? '/stage/control.html?workspace=1'
      : module.id === 'ae-live'
        ? '/ae/control.html?workspace=1'
        : '/control/panel.html?workspace=1');
  document
    .querySelectorAll('#navigation button')
    .forEach((button) =>
      button.setAttribute('aria-current', String(button.dataset.id === module.id)),
    );
}
function render() {
  byId('workspaceVersion').textContent = model.version;
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
    checkbox.onchange = () => {
      if (checkbox.checked) lastSelected = module.id;
    };
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
    state.textContent = module.enabled ? '已加载' : '未加载';
    label.append(checkbox, title, description, features, state);
    byId('catalog').append(label);
    if (module.enabled) {
      const button = document.createElement('button');
      button.title = module.name;
      const icon = document.createElement('span');
      icon.className = 'module-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.dataset.mark = { stage: '舞', football: '球', 'ae-live': 'AE' }[module.id];
      const name = document.createElement('span');
      name.className = 'module-label';
      name.textContent = module.name;
      button.append(icon, name);
      button.setAttribute('aria-label', module.name);
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
    openSelected();
    byId('notice').textContent = '';
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
const dialog = byId('settingsDialog');
function applySidebar() {
  document
    .querySelector('.app')
    .classList.toggle('sidebar-compact', byId('compactSidebar').checked);
}
try {
  byId('compactSidebar').checked = localStorage.getItem('workspace-compact-sidebar') === '1';
  byId('defaultPreview').value = localStorage.getItem('workspace-preview-default') || 'dual';
} catch {}
applySidebar();
byId('openSettings').onclick = () => {
  if (!model) return;
  byId('settingsNotice').textContent = '';
  byId('sharedVmixPort').value = model.vmixPort ?? '';
  const addresses = byId('outputAddresses');
  addresses.replaceChildren();
  for (const module of model.modules.filter((item) => item.enabled)) {
    const row = document.createElement('label');
    row.className = 'output-row';
    row.append(module.name);
    const field = document.createElement('input');
    field.readOnly = true;
    field.value = output(module);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = '复制';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(field.value);
        byId('settingsNotice').textContent = '已复制' + module.name + '上屏地址';
      } catch {
        field.select();
      }
    };
    row.append(field, copy);
    addresses.append(row);
  }
  byId('outputs').hidden = !addresses.childElementCount;
  dialog.showModal();
};
byId('closeSettings').onclick = () => dialog.close();
byId('settingsForm').onsubmit = async (event) => {
  event.preventDefault();
  const field = byId('sharedVmixPort');
  const port = field.value === '' ? null : Number(field.value);
  try {
    if (port !== (model.vmixPort ?? null)) {
      const response = await fetch('/api/workspace/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vmixPort: port }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      model.vmixPort = result.vmixPort;
    }
    localStorage.setItem('workspace-preview-default', byId('defaultPreview').value);
    localStorage.setItem('workspace-compact-sidebar', byId('compactSidebar').checked ? '1' : '0');
    applySidebar();
    dialog.close();
  } catch (error) {
    byId('settingsNotice').textContent = error.message;
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
  if (
    ['import-source', 'open-source', 'open-folder', 'list-fonts'].includes(event.data?.type) &&
    window.chrome?.webview
  )
    window.chrome.webview.postMessage(event.data);
});
for (const type of ['native-source', 'native-folder', 'native-fonts'])
  window.addEventListener(type, (event) => {
    if (active?.id === 'stage')
      byId('moduleFrame').contentWindow.postMessage({ type, ...event.detail }, active.url);
  });
function openSelected() {
  let preferred = lastSelected;
  try {
    preferred ||= sessionStorage.getItem('workspace-module');
  } catch {}
  const enabled = model.modules.filter((module) => module.enabled);
  const selected = enabled.find((module) => module.id === preferred) || enabled[0];
  if (selected) open(selected);
  else manage();
}
request()
  .then((body) => {
    model = body;
    render();
    openSelected();
  })
  .catch((error) => {
    byId('notice').textContent = error.message;
  });
