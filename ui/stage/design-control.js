'use strict';

const stageDesignURL = '/api/stage/design-templates';
let editingStageDesign;

async function postStageDesign(source, path = stageDesignURL, expected) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(expected && { 'If-Match': expected }) },
    body: JSON.stringify(source),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || '无法保存设计模板');
    error.status = response.status;
    throw error;
  }
  return body.template;
}

function designForSlot(source, slot) {
  if (source?.slot !== slot)
    throw Error(
      slot === 'caption' ? '请选择舞台歌词字幕 JSON 模板' : '请选择舞台晋级名单 JSON 模板',
    );
  return source;
}

async function importStageDesign(file, slot) {
  if (file.size > 4 * 1024 * 1024) throw Error('JSON 模板不能超过 4 MiB');
  const source = designForSlot(JSON.parse(await file.text()), slot);
  let template;
  try {
    template = await postStageDesign(source);
  } catch (error) {
    if (error.status !== 409 || !confirm('这个模板标识已存在。更新同类型的设计模板？')) throw error;
    template = await postStageDesign(source, stageDesignURL + '?replace=1');
  }
  etag = '';
  await read();
  notice('已导入设计模板「' + template.name + '」');
  return template;
}

function downloadStageDesign(id) {
  const link = document.createElement('a');
  link.href = stageDesignURL + '/' + encodeURIComponent(id);
  link.download = id + '.vmix-graphics.json';
  link.click();
}

async function openStageDesign(id) {
  const response = await fetch(stageDesignURL + '/' + encodeURIComponent(id));
  if (!response.ok) throw Error((await response.json()).error || '无法打开设计模板');
  const source = await response.json();
  editingStageDesign = { id, slot: source.slot, etag: response.headers.get('ETag') };
  $('stageDesignTitle').textContent = source.name + ' · JSON';
  $('stageDesignText').value = JSON.stringify(source, null, 2);
  $('stageDesignStatus').textContent = '';
  $('stageDesignDialog').showModal();
}

function installStageDesignEditor() {
  const dialog = $('stageDesignDialog');
  const source = () =>
    designForSlot(JSON.parse($('stageDesignText').value), editingStageDesign.slot);
  const action = (callback) => async () => {
    const buttons = dialog.querySelectorAll('button[data-design-action]');
    for (const button of buttons) button.disabled = true;
    $('stageDesignStatus').textContent = '';
    try {
      await callback();
    } catch (error) {
      $('stageDesignStatus').textContent = error.message;
    } finally {
      for (const button of buttons) button.disabled = false;
    }
  };
  $('stageDesignValidate').onclick = action(async () => {
    await postStageDesign(source(), stageDesignURL + '/validate');
    $('stageDesignStatus').textContent = '模板校验通过';
  });
  $('stageDesignExport').onclick = () => downloadStageDesign(editingStageDesign.id);
  for (const [button, copy] of [
    ['stageDesignSave', false],
    ['stageDesignSaveCopy', true],
  ]) {
    $(button).onclick = action(async () => {
      const document = source();
      if (copy) {
        if (document.id === editingStageDesign.id) {
          document.id = document.id.slice(0, 39) + '-' + crypto.randomUUID().slice(0, 8);
          document.name = document.name.slice(0, 59) + ' · 副本';
        }
      } else if (document.id !== editingStageDesign.id) {
        throw Error('更换模板标识后请点「保存为副本」');
      }
      await postStageDesign(
        document,
        stageDesignURL + (copy ? '' : '?replace=1'),
        copy ? undefined : editingStageDesign.etag,
      );
      etag = '';
      await read();
      dialog.close();
      notice(copy ? '设计模板副本已保存' : '设计模板已保存');
    });
  }
}
