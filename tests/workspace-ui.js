'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { CDP } = require('./browser');
const { createWorkspaceServer } = require('../server/workspace-server');
const { listenLocal } = require('../server/listen-local');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'broadcast-ui-'));
  const server = createWorkspaceServer({ dataDirectory: path.join(directory, 'data') });
  let browser, cdp;
  try {
    await server.initialize();
    const origin = await listenLocal(server);
    browser = spawn(
      process.env.FBP_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-extensions',
        '--remote-debugging-port=0',
        '--user-data-dir=' + path.join(directory, 'edge'),
        'about:blank',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    const active = path.join(directory, 'edge/DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(active); i++) await delay(100);
    const lines = fs.readFileSync(active, 'utf8').split(/\r?\n/);
    const socket = new WebSocket('ws://127.0.0.1:' + lines[0] + lines[1]);
    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
    cdp = new CDP(socket);
    const page = await cdp.page(origin + '/workspace/index.html');
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false },
      page,
    );
    await cdp.until(page, "document.querySelectorAll('.module-option').length===3");
    assert.deepEqual(
      await cdp.eval(
        page,
        "[...document.querySelectorAll('input[name=module]')].map(input=>input.checked)",
      ),
      [false, false, false],
    );
    const screenshots = path.resolve(__dirname, '../docs/screenshots');
    if (process.argv.includes('--screenshots')) fs.mkdirSync(screenshots, { recursive: true });
    async function screenshot(id, name) {
      if (!process.argv.includes('--screenshots')) return;
      await delay(250);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, id);
      fs.writeFileSync(path.join(screenshots, name + '.png'), Buffer.from(data, 'base64'));
    }
    await screenshot(page, 'workspace-modules');
    await cdp.eval(
      page,
      "document.querySelector('input[value=stage]').click();document.getElementById('apply').click()",
    );
    await cdp.until(page, "document.querySelector('#navigation button')?.textContent==='舞台节目'");
    const workspace = await fetch(origin + '/api/workspace').then((response) => response.json());
    const stageOrigin = workspace.modules.find((item) => item.id === 'stage').url;
    const stage = await cdp.page(stageOrigin + '/stage/control.html');
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1252, height: 920, deviceScaleFactor: 1, mobile: false },
      stage,
    );
    await cdp.until(stage, "document.getElementById('connection').textContent==='本地服务已连接'");
    await cdp.eval(stage, "document.getElementById('addProgram').click()");
    await cdp.until(stage, "document.querySelectorAll('.program-row').length===1");
    await cdp.eval(
      stage,
      "document.getElementById('programTitle').value='山河回响';document.getElementById('programPerformer').value='示例合唱团';document.getElementById('programCaption').value='第一句歌词\\n第二句歌词\\n第三句歌词';document.getElementById('programCaption').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('programForm').requestSubmit()",
    );
    await cdp.until(stage, "document.getElementById('draftState').textContent==='已保存'");
    assert.equal(
      await cdp.eval(stage, "document.querySelectorAll('#captionList button').length"),
      3,
    );
    const graphics = await cdp.page(stageOrigin + '/stage/graphics.html?preview=1');
    await cdp.eval(stage, "document.getElementById('captionNext').click()");
    await cdp.until(
      graphics,
      "document.getElementById('captionText').textContent==='第一句歌词' && document.getElementById('caption').classList.contains('visible')",
    );
    await cdp.eval(stage, "document.getElementById('captionNext').click()");
    await cdp.until(graphics, "document.getElementById('captionText').textContent==='第二句歌词'");
    await cdp.eval(stage, "document.getElementById('captionPrevious').click()");
    await cdp.until(graphics, "document.getElementById('captionText').textContent==='第一句歌词'");
    await cdp.eval(stage, "document.querySelectorAll('#captionList button')[2].click()");
    await cdp.until(graphics, "document.getElementById('captionText').textContent==='第三句歌词'");
    await cdp.eval(stage, "document.getElementById('captionHide').click()");
    await cdp.until(graphics, "!document.getElementById('caption').classList.contains('visible')");
    await cdp.eval(stage, "document.querySelectorAll('#captionList button')[0].click()");
    await cdp.eval(stage, "document.getElementById('take').click()");
    await cdp.until(stage, "document.getElementById('liveTitle').textContent==='山河回响'");
    await screenshot(stage, 'stage-show');
    await cdp.eval(
      stage,
      "document.getElementById('programTitle').value='未保存的标题';document.getElementById('programTitle').dispatchEvent(new Event('input',{bubbles:true}))",
    );
    await delay(1700);
    assert.equal(
      await cdp.eval(stage, "document.getElementById('programTitle').value"),
      '未保存的标题',
    );
    assert.equal(
      (await fetch(stageOrigin + '/api/v1/state').then((response) => response.json())).live.title,
      '山河回响',
    );
    await cdp.eval(stage, "document.querySelector('[data-tab=design]').click()");
    await cdp.until(stage, "!document.getElementById('design').hidden");
    await cdp.eval(stage, "document.querySelector('[data-id=ink]').click()");
    await cdp.until(
      stage,
      "document.querySelector('[data-id=ink]').getAttribute('aria-pressed')==='true'",
    );
    await screenshot(stage, 'stage-templates');
    assert.equal(await cdp.eval(stage, 'document.documentElement.scrollWidth>innerWidth'), false);
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 780, height: 900, deviceScaleFactor: 1, mobile: false },
      stage,
    );
    await screenshot(stage, 'stage-minimum');
    assert.equal(await cdp.eval(stage, 'document.documentElement.scrollWidth>innerWidth'), false);
    await fetch(stageOrigin + '/api/v1/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: '示例 · 文化艺术展演',
        channelName: 'STAGE',
        sponsorName: '示例赞助商',
        layers: { channel: true, event: true, sponsor: true, caption: true },
      }),
    });
    await cdp.until(graphics, "document.getElementById('lower').classList.contains('visible')");
    await screenshot(graphics, 'stage-output');
    assert.equal(
      await cdp.eval(graphics, "document.getElementById('title').textContent"),
      '山河回响',
    );
    const enabled = await fetch(origin + '/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: ['stage', 'ae-live', 'football'] }),
    }).then((response) => response.json());
    const aeOrigin = enabled.modules.find((item) => item.id === 'ae-live').url;
    const footballOrigin = enabled.modules.find((item) => item.id === 'football').url;
    const preview = await cdp.page(origin + '/workspace/preview.html?module=stage');
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false },
      preview,
    );
    await cdp.until(
      preview,
      "document.querySelectorAll('#tabs button').length===4 && document.querySelectorAll('.canvas iframe').length===2",
    );
    async function frameValue(query, expression, exact = false) {
      const tree = await cdp.send('Page.getFrameTree', {}, preview);
      const frames = [];
      function collect(node) {
        frames.push(node.frame);
        for (const child of node.childFrames || []) collect(child);
      }
      collect(tree.frameTree);
      const frame = frames.find((item) => (exact ? item.url === query : item.url.includes(query)));
      assert(frame, 'frame ' + query);
      const world = await cdp.send(
        'Page.createIsolatedWorld',
        { frameId: frame.id, worldName: 'preview-test' },
        preview,
      );
      const result = await cdp.send(
        'Runtime.evaluate',
        { expression, contextId: world.executionContextId, returnByValue: true },
        preview,
      );
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }
    await cdp.eval(
      preview,
      "document.getElementById('element').value='stage:caption';document.getElementById('element').dispatchEvent(new Event('change'));document.getElementById('x').value='440';document.getElementById('x').dispatchEvent(new Event('change'))",
    );
    await cdp.until(
      preview,
      "document.getElementById('draftStatus').textContent.includes('尚未应用')",
    );
    await delay(500);
    assert.equal(
      (await fetch(stageOrigin + '/api/v1/state').then((response) => response.json())).style
        .captionX,
      96,
    );
    assert.equal(
      await frameValue(
        '/stage/graphics.html?workspacePreview=1',
        "document.getElementById('caption').style.left",
      ),
      '440px',
    );
    assert.equal(
      await frameValue(
        stageOrigin + '/stage/graphics.html',
        "document.getElementById('caption').style.left",
        true,
      ),
      '96px',
    );
    const point = await cdp.eval(
      preview,
      "(()=>{const r=document.querySelector('.handle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
    for (const [type, x, y, buttons] of [
      ['mousePressed', point.x, point.y, 1],
      ['mouseMoved', point.x + 25, point.y, 1],
      ['mouseReleased', point.x + 25, point.y, 0],
    ])
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type, x, y, button: 'left', buttons, clickCount: 1 },
        preview,
      );
    const moved = Number(await cdp.eval(preview, "document.getElementById('x').value"));
    assert(moved > 440, 'drag moves PVW element');
    assert.equal(
      (await fetch(stageOrigin + '/api/v1/state').then((response) => response.json())).style
        .captionX,
      96,
    );
    await cdp.eval(preview, "document.getElementById('apply').click()");
    await cdp.until(
      preview,
      "document.getElementById('notice').textContent==='已应用到播出画面。'",
    );
    assert.equal(
      (await fetch(stageOrigin + '/api/v1/state').then((response) => response.json())).style
        .captionX,
      moved,
    );
    await fetch(stageOrigin + '/api/v1/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layers: { sponsor: false } }),
    });
    const untouchedStage = await fetch(stageOrigin + '/api/v1/state').then((response) =>
      response.json(),
    );
    await cdp.eval(
      preview,
      'document.querySelector(\'#categoryTabs [data-element="stage:sponsor"]\').click()',
    );
    await delay(400);
    assert.equal(
      await frameValue(
        '/stage/graphics.html?workspacePreview=1',
        "document.getElementById('sponsor').classList.contains('visible')",
      ),
      true,
    );
    assert.equal(
      await frameValue(
        stageOrigin + '/stage/graphics.html',
        "document.getElementById('sponsor').classList.contains('visible')",
        true,
      ),
      false,
    );
    await cdp.eval(preview, "document.querySelector('[data-align=left]').click()");
    assert.equal(await cdp.eval(preview, "Number(document.getElementById('x').value)"), 96);
    await cdp.eval(
      preview,
      "document.getElementById('compositionRatio').value='9:16';document.getElementById('compositionRatio').dispatchEvent(new Event('change'));document.getElementById('showGrid').click();document.getElementById('previewBackground').value='pitch';document.getElementById('previewBackground').dispatchEvent(new Event('change'))",
    );
    assert.equal(
      await cdp.eval(preview, "document.querySelector('.composition-frame').style.width"),
      '607.5px',
    );
    assert.equal(await cdp.eval(preview, "document.querySelector('.preview-grid').hidden"), false);
    assert.equal(
      await cdp.eval(preview, "document.getElementById('pvwWrap').dataset.background"),
      'pitch',
    );
    await cdp.eval(
      preview,
      'document.querySelector(\'#layerList input[aria-label="预览中显示舞台节目赞助商"]\').click()',
    );
    await delay(300);
    assert.equal(
      await frameValue(
        '/stage/graphics.html?workspacePreview=1',
        "document.getElementById('sponsor').classList.contains('visible')",
      ),
      false,
    );
    assert.deepEqual(
      await fetch(stageOrigin + '/api/v1/state').then((response) => response.json()),
      untouchedStage,
      'preview content and guides never modify output state',
    );
    await cdp.eval(preview, "document.getElementById('reset').click()");
    await cdp.until(
      preview,
      "document.getElementById('notice').textContent==='已恢复当前播出位置。'",
    );
    await cdp.eval(
      preview,
      "document.getElementById('showAllLayers').click();document.getElementById('compositionRatio').value='16:9';document.getElementById('compositionRatio').dispatchEvent(new Event('change'));document.getElementById('showGrid').click();document.getElementById('previewBackground').value='checker';document.getElementById('previewBackground').dispatchEvent(new Event('change'));document.getElementById('previewMode').value='live';document.getElementById('previewMode').dispatchEvent(new Event('change'))",
    );
    await cdp.eval(preview, "document.querySelector('[data-tab=football]').click()");
    await cdp.until(preview, "document.getElementById('element').value==='football:sb'");
    await delay(500);
    await cdp.eval(
      preview,
      "document.getElementById('x').value='701';document.getElementById('x').dispatchEvent(new Event('change'))",
    );
    assert.notEqual(
      (await fetch(footballOrigin + '/api/v1/state').then((response) => response.json())).sb_pos?.x,
      701,
    );
    await delay(400);
    assert.equal(
      await frameValue(
        '/titles/graphics.html?workspacePreview=1',
        "document.getElementById('sb').style.left",
      ),
      '701px',
    );
    assert.notEqual(
      await frameValue(
        footballOrigin + '/titles/graphics.html',
        "document.getElementById('sb').style.left",
        true,
      ),
      '701px',
    );
    await cdp.eval(preview, "document.getElementById('apply').click()");
    await cdp.until(
      preview,
      "document.getElementById('notice').textContent==='已应用到播出画面。'",
    );
    assert.equal(
      (await fetch(footballOrigin + '/api/v1/state').then((response) => response.json())).sb_pos.x,
      701,
    );
    const untouchedFootball = await fetch(footballOrigin + '/api/v1/state').then((response) =>
      response.json(),
    );
    await cdp.eval(
      preview,
      'document.querySelector(\'#categoryTabs [data-element="football:card"]\').click()',
    );
    await delay(500);
    assert.equal(
      await frameValue(
        '/titles/graphics.html?workspacePreview=1',
        "getComputedStyle(document.getElementById('card')).opacity",
      ),
      '1',
    );
    assert.equal(
      await frameValue(
        footballOrigin + '/titles/graphics.html',
        "document.getElementById('card').classList.contains('on')",
        true,
      ),
      false,
    );
    await cdp.eval(
      preview,
      "document.getElementById('sizeSlider').value='1.5';document.getElementById('sizeSlider').dispatchEvent(new Event('input'))",
    );
    await delay(250);
    assert(
      (
        await frameValue(
          '/titles/graphics.html?workspacePreview=1',
          "document.getElementById('card').style.transform",
        )
      ).includes('1.5'),
    );
    await cdp.eval(
      preview,
      "document.getElementById('restoreElement').click();document.getElementById('previewMode').value='live';document.getElementById('previewMode').dispatchEvent(new Event('change'))",
    );
    assert.deepEqual(
      await fetch(footballOrigin + '/api/v1/state').then((response) => response.json()),
      untouchedFootball,
    );
    await cdp.eval(
      preview,
      "document.querySelector('#categoryTabs [data-element=\"football:sb\"]').click();document.querySelector('.handle').focus();document.querySelector('.handle').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))",
    );
    assert.equal(Number(await cdp.eval(preview, "document.getElementById('x').value")), 702);
    await delay(200);
    assert.equal(
      await cdp.eval(preview, "document.activeElement.classList.contains('handle')"),
      true,
    );
    await cdp.eval(preview, "document.getElementById('snapGrid').click()");
    const snapPoint = await cdp.eval(
      preview,
      "(()=>{const r=document.querySelector('.handle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
    );
    for (const [type, x, y, buttons] of [
      ['mousePressed', snapPoint.x, snapPoint.y, 1],
      ['mouseMoved', snapPoint.x + 12, snapPoint.y + 5, 1],
      ['mouseReleased', snapPoint.x + 12, snapPoint.y + 5, 0],
    ])
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type, x, y, button: 'left', buttons, clickCount: 1 },
        preview,
      );
    assert.equal(Number(await cdp.eval(preview, "document.getElementById('x').value")) % 20, 0);
    assert.equal(
      (await fetch(footballOrigin + '/api/v1/state').then((response) => response.json())).sb_pos.x,
      701,
    );
    await cdp.eval(
      preview,
      "document.getElementById('reset').click();document.getElementById('snapGrid').click()",
    );
    await cdp.until(
      preview,
      "document.getElementById('notice').textContent==='已恢复当前播出位置。'",
    );
    await cdp.eval(
      preview,
      "document.getElementById('previewMode').value='live';document.getElementById('previewMode').dispatchEvent(new Event('change'))",
    );
    const initialWidth = await cdp.eval(preview, "document.getElementById('pvwWrap').clientWidth");
    await cdp.eval(preview, "document.getElementById('inspectorToggle').click()");
    await delay(100);
    assert(
      (await cdp.eval(preview, "document.getElementById('pvwWrap').clientWidth")) > initialWidth,
    );
    await cdp.eval(preview, "document.getElementById('inspectorToggle').click()");
    await cdp.eval(
      preview,
      "document.querySelector('[data-tab=all]').click();document.querySelector('[data-view=pvw]').click()",
    );
    assert.equal(await cdp.eval(preview, "document.querySelectorAll('.canvas iframe').length"), 3);
    await cdp.eval(preview, "document.querySelector('[data-view=pgm]').click()");
    assert.equal(
      await cdp.eval(
        preview,
        "document.getElementById('pvwPanel').hidden && !document.getElementById('pgmPanel').hidden",
      ),
      true,
    );
    await cdp.eval(
      preview,
      "document.querySelector('[data-view=dual]').click();document.querySelector('[data-tab=ae-live]').click();document.getElementById('x').value='125';document.getElementById('x').dispatchEvent(new Event('change'))",
    );
    await delay(400);
    assert.equal(
      (await fetch(aeOrigin + '/api/ae/output').then((response) => response.json())).layout.x,
      0,
    );
    assert(
      (
        await frameValue(
          '/ae/graphics.html?workspacePreview=1',
          "document.getElementById('frame').style.transform",
        )
      ).includes('125px'),
    );
    assert(
      !(
        await frameValue(
          aeOrigin + '/ae/graphics.html',
          "document.getElementById('frame').style.transform",
          true,
        )
      ).includes('125px'),
    );
    await cdp.eval(preview, "document.getElementById('apply').click()");
    await cdp.until(
      preview,
      "document.getElementById('notice').textContent==='已应用到播出画面。'",
    );
    assert.equal(
      (await fetch(aeOrigin + '/api/ae/output').then((response) => response.json())).layout.x,
      125,
    );
    // A dark page must still composite transparent cross-origin module frames.
    await cdp.eval(preview, "document.querySelector('[data-tab=all]').click()");
    await delay(1500);
    const captured = await cdp.send(
      'Page.captureScreenshot',
      { format: 'jpeg', quality: 60 },
      preview,
    );
    const pixel = await cdp.eval(
      preview,
      `new Promise(resolve=>{const image=new Image();image.onload=()=>{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const r=document.getElementById('pvwWrap').getBoundingClientRect();resolve([...ctx.getImageData(Math.round(r.x+r.width*.43),Math.round(r.y+r.height*.35),1,1).data])};image.src='data:image/jpeg;base64,${captured.data}'})`,
    );
    assert(
      pixel.slice(0, 3).every((value) => value < 100),
      'combined preview retains transparent module backgrounds',
    );
    await cdp.eval(
      preview,
      "document.querySelector('[data-tab=football]').click();document.querySelector('[data-view=pvw]').click();document.querySelector('#categoryTabs [data-element=\"football:lineup_all\"]').click()",
    );
    await delay(500);
    assert.equal(
      await frameValue(
        '/titles/graphics.html?workspacePreview=1',
        "document.querySelectorAll('#lineupAll .lu-row').length>0",
      ),
      true,
    );
    if (process.argv.includes('--inspect-preview')) {
      const image = await cdp.send(
        'Page.captureScreenshot',
        { format: 'jpeg', quality: 65 },
        preview,
      );
      console.log('PREVIEW_IMAGE:' + image.data);
    }
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 920, height: 780, deviceScaleFactor: 1, mobile: false },
      preview,
    );
    await cdp.eval(preview, "document.querySelector('[data-view=dual]').click()");
    await delay(250);
    assert.equal(await cdp.eval(preview, 'document.documentElement.scrollWidth>innerWidth'), false);
    if (process.argv.includes('--inspect-preview')) {
      const image = await cdp.send(
        'Page.captureScreenshot',
        { format: 'jpeg', quality: 65 },
        preview,
      );
      console.log('PREVIEW_NARROW:' + image.data);
    }
    const pairing = await fetch(aeOrigin + '/api/ae/pairing').then((response) => response.json());
    async function agent(route, data) {
      return fetch(aeOrigin + '/api/ae/agent/' + route, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + pairing.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((response) => response.json());
    }
    const connected = await agent('hello', {});
    await agent('poll', {
      session: connected.session,
      snapshot: {
        comp: {
          id: 1,
          name: '示例 · 演出字幕合成',
          width: 1920,
          height: 1080,
          fps: 30,
          duration: 8,
        },
        controls: [
          { id: 'title', label: '节目名称', kind: 'text', value: '山河回响' },
          { id: 'size', label: '标题字号', kind: 'number', value: 64 },
          { id: 'color', label: '主题色', kind: 'color', value: [0.1, 0.3, 0.45] },
          { id: 'visible', label: '字幕显示', kind: 'checkbox', value: 1 },
        ],
      },
    });
    const aePage = await cdp.page(aeOrigin + '/ae/control.html');
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1252, height: 980, deviceScaleFactor: 1, mobile: false },
      aePage,
    );
    await cdp.until(aePage, "document.querySelectorAll('.live-control').length===4");
    await screenshot(aePage, 'ae-live-controls');
    assert.equal(await cdp.eval(aePage, 'document.documentElement.scrollWidth>innerWidth'), false);
    const errors = cdp.events.filter((event) => event.method === 'Runtime.exceptionThrown');
    assert.deepEqual(errors, []);
    console.log(
      'PASS lyrics cues, module previews, PVW drag and explicit PGM apply, view modes and module controls',
    );
  } finally {
    if (cdp) {
      try {
        await cdp.send('Browser.close');
      } catch (_) {
        /* browser may close before replying */
      }
      cdp.ws.close();
    }
    if (browser && browser.exitCode === null) {
      browser.kill();
      await delay(600);
    }
    await server.shutdown();
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
    } catch (_) {
      console.log('Temporary profile:', directory);
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
