'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, execFile } = require('node:child_process');
const { CDP } = require('./browser');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function resources(pid) {
  const command =
    '$taskAll = Get-CimInstance Win32_Process; $taskIds = [System.Collections.Generic.HashSet[int]]::new(); [void]$taskIds.Add(' +
    pid +
    '); do { $taskChanged = $false; foreach ($taskProcess in $taskAll) { if ($taskIds.Contains([int]$taskProcess.ParentProcessId) -and $taskIds.Add([int]$taskProcess.ProcessId)) { $taskChanged = $true } } } while ($taskChanged); $taskRows = Get-Process -Id @($taskIds) -ErrorAction SilentlyContinue; [pscustomobject]@{ processes = @($taskRows).Count; privateMB = [math]::Round(($taskRows | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB,1); workingSetMB = [math]::Round(($taskRows | Measure-Object WorkingSet64 -Sum).Sum / 1MB,1); cpuMs = ($taskRows | ForEach-Object { $_.TotalProcessorTime.TotalMilliseconds } | Measure-Object -Sum).Sum; sampledAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress';
  return new Promise((resolve, reject) =>
    execFile(
      'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
      { windowsHide: true },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(JSON.parse(stdout));
      },
    ),
  );
}
async function main() {
  const build = path.resolve(process.argv[2] || 'dist/workspace-native-validation');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), '舞台 工作台-'));
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  let host, cdp, origin;
  const measurements = [];
  try {
    host = spawn(path.join(build, '转播包装工作台.exe'), [], {
      cwd: build,
      windowsHide: true,
      env: {
        ...process.env,
        PATH: '',
        BROADCAST_DATA: data,
        BROADCAST_DESKTOP_TEST: '1',
        BROADCAST_DEBUG_PORT: String(port),
      },
      stdio: 'ignore',
    });
    const file = path.join(data, 'active-host.json');
    for (let i = 0; i < 200 && !fs.existsSync(file) && host.exitCode === null; i++)
      await delay(100);
    if (!fs.existsSync(file))
      throw Error(
        'Native host failed: ' +
          fs
            .readdirSync(data)
            .filter((name) => name.endsWith('.log'))
            .map((name) => fs.readFileSync(path.join(data, name), 'utf8'))
            .join('\n'),
      );
    const ready = JSON.parse(fs.readFileSync(file));
    origin = ready.origin;
    let version;
    for (let i = 0; i < 100; i++) {
      try {
        version = await fetch('http://127.0.0.1:' + port + '/json/version').then((response) =>
          response.json(),
        );
        break;
      } catch (_) {
        await delay(100);
      }
    }
    assert(version, 'WebView2 debug endpoint starts');
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
    cdp = new CDP(socket);
    let target;
    for (let i = 0; i < 100; i++) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      target = targetInfos.find((item) => item.type === 'page' && item.url.startsWith(origin));
      if (target) break;
      await delay(100);
    }
    assert(target, 'native WebView target');
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.until(sessionId, "document.querySelectorAll('.module-option').length===3");
    assert.equal(
      await cdp.eval(
        sessionId,
        "document.getElementById('moduleFrame').allow.includes('clipboard-write')",
      ),
      true,
    );
    assert.deepEqual(
      (await fetch(origin + '/api/workspace').then((response) => response.json())).loaded,
      [],
    );
    async function measure(name) {
      if (!process.argv.includes('--measure')) return;
      await delay(1500);
      const before = await resources(host.pid);
      await delay(3000);
      const after = await resources(host.pid);
      measurements.push({
        scenario: name,
        ...after,
        cpuPercentOfOneCore:
          Math.round((1000 * (after.cpuMs - before.cpuMs)) / (after.sampledAt - before.sampledAt)) /
          10,
      });
    }
    await measure('未启用任何模块');
    await cdp.eval(
      sessionId,
      "document.querySelector('input[value=stage]').click();document.getElementById('apply').click()",
    );
    await cdp.until(
      sessionId,
      "document.querySelector('#navigation button')?.textContent==='舞台节目'",
    );
    await cdp.eval(sessionId, "document.querySelector('#navigation button').click()");
    const workspace = await fetch(origin + '/api/workspace').then((response) => response.json());
    const stage = workspace.modules.find((item) => item.id === 'stage').url;
    assert.equal((await fetch(stage + '/stage/control.html')).status, 200);
    await measure('舞台控台开启，预览关闭');
    await cdp.eval(
      sessionId,
      "document.getElementById('manage').click();document.querySelector('input[value=football]').click();document.querySelector('input[value=ae-live]').click();document.getElementById('apply').click()",
    );
    await cdp.until(sessionId, "document.querySelectorAll('#navigation button').length===3");
    const both = await fetch(origin + '/api/workspace').then((response) => response.json());
    const football = both.modules.find((item) => item.id === 'football').url;
    await cdp.eval(
      sessionId,
      "document.querySelector('#navigation button[data-id=football]').click()",
    );
    let footballFrame;
    for (let i = 0; i < 60; i++) {
      const tree = await cdp.send('Page.getFrameTree', {}, sessionId);
      footballFrame = (tree.frameTree.childFrames || []).find((item) =>
        item.frame.url.startsWith(football + '/control/panel.html'),
      )?.frame;
      if (footballFrame) break;
      await delay(100);
    }
    assert(footballFrame, 'football control is loaded in the native window');
    const world = await cdp.send(
      'Page.createIsolatedWorld',
      { frameId: footballFrame.id, worldName: 'native-preview-test' },
      sessionId,
    );
    for (let i = 0; i < 60; i++) {
      const probe = await cdp.send(
        'Runtime.evaluate',
        {
          contextId: world.executionContextId,
          expression: '!!document.querySelector(\'[onclick=\\"editorOpen()\\"]\')',
          returnByValue: true,
        },
        sessionId,
      );
      if (probe.result.value) break;
      await delay(100);
    }
    await cdp.send(
      'Runtime.evaluate',
      {
        contextId: world.executionContextId,
        expression: 'document.querySelector(\'[onclick=\\"editorOpen()\\"]\').click()',
      },
      sessionId,
    );
    let previewTarget;
    for (let i = 0; i < 100; i++) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      previewTarget = targetInfos.find(
        (item) =>
          item.type === 'page' && item.url === origin + '/workspace/preview.html?module=football',
      );
      if (previewTarget) break;
      await delay(100);
    }
    assert(previewTarget, 'football preview opens in a separate native window');
    const attached = await cdp.send('Target.attachToTarget', {
      targetId: previewTarget.targetId,
      flatten: true,
    });
    await cdp.send('Runtime.enable', {}, attached.sessionId);
    await cdp.until(
      attached.sessionId,
      "document.querySelector('[data-tab=football]')?.getAttribute('aria-pressed')==='true' && document.querySelectorAll('.canvas iframe').length===2",
    );
    await measure('三个模块启用，停留模块管理页');
    await fetch(football + '/api/v1/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sb_clockcmd: 'start' }),
    });
    // Close the real top-level Windows window, not a DevTools page target.
    const closeScript =
      'Add-Type -TypeDefinition \'using System; using System.Runtime.InteropServices; public class NativeClose { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam); }\'; [NativeClose]::PostMessage([IntPtr]::new(' +
      ready.windowHandle +
      '),16,[IntPtr]::Zero,[IntPtr]::Zero)';
    const close = spawn(
      'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', closeScript],
      { windowsHide: true, stdio: 'ignore' },
    );
    await new Promise((resolve) => close.on('exit', resolve));
    for (let i = 0; i < 80 && host.exitCode === null; i++) await delay(100);
    assert.notEqual(host.exitCode, null, 'host exits after closing window');
    await assert.rejects(fetch(origin + '/api/workspace'));
    await assert.rejects(fetch(stage + '/api/v1/state'));
    await assert.rejects(fetch(football + '/api/v1/state'));
    const match = JSON.parse(fs.readFileSync(path.join(data, 'state.json')));
    assert.equal(match.sb_clock_state.running, false);
    if (measurements.length) {
      fs.writeFileSync(
        path.resolve(__dirname, '../docs/native-resources.json'),
        JSON.stringify(
          {
            measuredAt: new Date().toISOString(),
            host: 'Windows x64 · 原生 WebView2 · 无 AE/vMix',
            note: '本机短时空闲采样，汇总主程序与后代进程；工作集包含共享页重复计数。CPU 以单个逻辑核心为 100%。调试接口已开启，不代表播出或其他设备的性能。',
            measurements,
          },
          null,
          2,
        ),
      );
      console.log(JSON.stringify(measurements));
    }
    console.log(
      'PASS native EXE, football separate preview window, module loading, real window close, clock pause and all sockets released',
    );
  } finally {
    cdp?.ws.close();
    if (host && host.exitCode === null) host.kill();
    await delay(500);
    try {
      fs.rmSync(data, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
    } catch (_) {
      console.log('Native test data:', data);
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
