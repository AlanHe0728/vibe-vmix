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
fs.copyFileSync(
  path.join(root, 'docs/native-resources.json'),
  path.join(output, 'native-resources.json'),
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
      'Beta 测试版：作者尚未充分测试，正式播出前请先验证并备份数据。',
      '',
      '完整解压后双击“转播包装工作台.exe”。无需打开浏览器，无需安装 Node。请保留整个文件夹。',
      '依赖 Windows 的 .NET Framework 4.7.2+ 与 Microsoft Edge WebView2 运行时。缺少 WebView2 时请从微软官方网站安装。',
      '首次勾选需要的模块，再点击“应用模块选择”，从左侧进入。未选择的模块不加载。',
      '舞台：节目单、四套模板、自定义配色与坐标、台标、活动 Logo、赞助、字幕、转场。预览按需开启。',
      '足球：保留原有比分、计时、名单、球员事件与 D200。',
      'AE 直播连接：可选模块，配合随包 AE插件 使用；文字、颜色、滑块、开关、交互 PNG 画面、离线动画缓存与 vMix 播放控制。',
      'AE 插件为未签名 CEP 开发版，未在本机 AE 真机实测；安装与边界见 AE插件/README.md。交互画面不保证广播帧率。',
      '各模块有独立的 vMix 上屏地址，在本机 vMix 添加网页浏览器输入，设为 1920×1080。',
      'GT 文件可发送到已安装的 vMix 并控制文字；GT 的字体、特效由 vMix 负责。',
      'AE 工程保留原文件，可在本机 AE 打开或调用 aerender 离线导出 MOV。输出模块模板必须存在，透明度取决于模板。',
      'NewBlue 工程保留原文件并调用系统关联软件打开；需从 NewBlue 导出视频后导入。程序不包含 AE/NewBlue 的专有渲染器。',
      '“链接本地工程”保持原路径和素材依赖；导入工程只复制所选文件，不会自动收集关联素材。',
      '关闭预览可减少资源占用；最小化暂停控台渲染，模块服务继续播出。卸载模块会停止它的上屏服务。',
      '正式播出时保持程序运行。关闭主窗口会停止所有模块并暂停足球计时。',
      '数据位于 data：workspace.json 为选择，state.json 为足球，stage 为舞台与素材，webview 为界面缓存。',
      '旧版升级：退出旧程序，将旧 data/state.json 复制到新版 data/state.json，再启用足球模块。不要覆盖已有数据。',
      '备份时退出软件，复制整个 data。链接在外部的工程与依赖需另行备份。',
      '运行问题查看 data/desktop-error.log 和 data/service-error.log。',
      '',
      'WebView2 安装：https://developer.microsoft.com/microsoft-edge/webview2/',
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
