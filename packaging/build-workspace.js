'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { copyRuntime } = require('./app-files');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const name =
  process.argv.find((arg, index) => index > 1 && !arg.startsWith('--')) ||
  '转播包装工作台-' + version + '-Windows-x64';
const output = path.join(root, 'dist', name);
if (
  path.dirname(output) !== path.join(root, 'dist') ||
  fs.existsSync(output) ||
  fs.existsSync(output + '.zip')
)
  throw Error('请使用未存在的 dist 子目录，构建不会覆盖任何已有程序或数据');
const sdk = path.join(__dirname, 'cache/webview2-1.0.4314.35');
const archive = path.join(__dirname, 'cache/webview2-1.0.4314.35.nupkg');
const nodeLicense = [
  path.join(path.dirname(process.execPath), 'LICENSE'),
  path.join(path.dirname(process.execPath), 'LICENSE.txt'),
  path.join(__dirname, 'cache/Node-LICENSE.txt'),
].find((file) => fs.existsSync(file));
if (!fs.existsSync(archive) || !nodeLicense)
  throw Error(
    '缺少 WebView2 SDK 原始包或 Node 许可文件，请先按 docs/WORKSPACE_2.md 中的构建说明准备。',
  );
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('构建失败：' + command);
}
if (!fs.existsSync(sdk))
  run(process.env.FBP_BUILD_PYTHON || 'python', [
    path.join(__dirname, 'archive.py'),
    'extract',
    archive,
    sdk,
  ]);
fs.mkdirSync(output, { recursive: true });
const app = path.join(output, 'app');
copyRuntime(root, app);
fs.cpSync(path.join(root, 'ae-plugin'), path.join(output, 'AE插件'), { recursive: true });
fs.writeFileSync(
  path.join(output, '使用说明.md'),
  fs
    .readFileSync(path.join(root, 'docs/WORKSPACE_2.md'), 'utf8')
    .replace('../ae-plugin/README.md', 'AE插件/README.md'),
);
// System UI engines are shared. Only the service runtime is bundled.
fs.mkdirSync(path.join(output, 'runtime'));
fs.copyFileSync(process.execPath, path.join(output, 'runtime/node.exe'));
fs.mkdirSync(path.join(output, 'LICENSES'));
fs.copyFileSync(nodeLicense, path.join(output, 'LICENSES/Node-LICENSE.txt'));
fs.cpSync(path.join(__dirname, 'licenses'), path.join(output, 'LICENSES'), { recursive: true });
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(output, 'LICENSES/Project-LICENSE.txt'));
fs.copyFileSync(
  path.join(root, 'docs/MICROKIT_LICENSE.txt'),
  path.join(output, 'LICENSES/MicroKit-MIT.txt'),
);
for (const file of ['Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll'])
  fs.copyFileSync(path.join(sdk, 'lib/net462', file), path.join(output, file));
fs.copyFileSync(
  path.join(sdk, 'runtimes/win-x64/native/WebView2Loader.dll'),
  path.join(output, 'WebView2Loader.dll'),
);
const license = fs.readdirSync(sdk).find((file) => /license/i.test(file));
if (license && fs.statSync(path.join(sdk, license)).isFile())
  fs.copyFileSync(path.join(sdk, license), path.join(output, 'LICENSES/WebView2-LICENSE.txt'));
// A neutral four-pane mark represents independently selected modules.
const { makeWorkspaceIcon } = require('./make-icon');
makeWorkspaceIcon(path.join(output, 'workspace.ico'));
const executable = path.join(output, '转播包装工作台.exe');
const compiler = path.join(
  process.env.WINDIR || 'C:/Windows',
  'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
);
run(compiler, [
  '/nologo',
  '/target:winexe',
  '/platform:x64',
  '/optimize+',
  '/out:' + executable,
  '/win32icon:' + path.join(output, 'workspace.ico'),
  '/r:System.Windows.Forms.dll',
  '/r:System.Drawing.dll',
  '/r:System.Web.Extensions.dll',
  '/r:' + path.join(output, 'Microsoft.Web.WebView2.Core.dll'),
  '/r:' + path.join(output, 'Microsoft.Web.WebView2.WinForms.dll'),
  path.join(root, 'desktop/native/Program.cs'),
]);
fs.writeFileSync(
  executable + '.config',
  '<?xml version="1.0"?><configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.7.2"/></startup></configuration>',
);
fs.mkdirSync(path.join(output, 'data'));
fs.writeFileSync(
  path.join(output, 'data/workspace.json'),
  JSON.stringify({ enabled: [] }, null, 2),
);
fs.writeFileSync(
  path.join(output, '先读我.txt'),
  '\uFEFF' +
    [
      '转播包装工作台 ' + version + ' · Windows x64',
      '',
      '本版本未完全验证，可能存在BUG，如遇BUG请与开发者联系',
      '',
      '完整解压后运行「转播包装工作台.exe」，保留同目录文件。需要 .NET Framework 4.7.2+ 和 WebView2。',
      '勾选模块并应用。把模块的上屏地址添加为 vMix 网页输入，画布设为 1920 × 1080。',
      '使用说明见「使用说明.md」，AE 插件安装见「AE插件/README.md」。',
      '',
    ].join('\r\n'),
);
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = fs
  .readdirSync(output, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const file = path.join(entry.parentPath, entry.name);
    return {
      path: path.relative(output, file).replaceAll('\\', '/'),
      bytes: fs.statSync(file).size,
      sha256: sha(file),
    };
  });
fs.writeFileSync(
  path.join(output, 'release-manifest.json'),
  JSON.stringify(
    {
      version,
      host: 'WinForms-WebView2',
      node: process.version,
      webviewSDK: '1.0.4314.35',
      sdkSHA256: sha(archive),
      builtAt: new Date().toISOString(),
      files,
    },
    null,
    2,
  ),
);
console.log('Ready:', output);
if (!process.argv.includes('--no-zip')) {
  run(process.env.FBP_BUILD_PYTHON || 'python', [
    path.join(__dirname, 'archive.py'),
    'zip',
    output,
    output + '.zip',
  ]);
  fs.writeFileSync(
    output + '.zip.sha256',
    sha(output + '.zip') + '  ' + path.basename(output) + '.zip\n',
  );
}
