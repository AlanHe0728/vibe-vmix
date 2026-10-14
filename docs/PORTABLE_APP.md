# 足球转播控制台 · 便携软件版

Windows 10/11 x64 的完整文件夹应用，内置 Electron 44.7.0 的 Chromium 和 Node。收件人完整解压 ZIP 后双击 `足球转播控制台.exe`，不需要另装运行环境、浏览器或启动开发服务。桌面窗口加载同一套控制页、预览、D200 配置和联合图形页，原有比分、名单、换人、素材和动画功能共用原实现。

## 使用与数据

默认本地地址使用 `http://127.0.0.1:8123`。若端口占用，依次尝试后续 20 个端口，再由系统分配空闲端口。桌面标题显示实际端口，控制页、预览、D200 配置和复制的 vMix 地址均使用该次实际地址。应用只监听本机回环地址。vMix 和 Ulanzi Studio 是已有播出/硬件软件，不包含在本应用中；控制台本身和预览可独立运行。

- `data/state.json`：球队、比分、事件、名单、实际场内球员、队徽、角标、上传字体和布局。公开便携包以空白比赛状态启动，仅保留打包时允许分发的自定义字体；首次不存在时由随包快照创建。运行后数据只保存在当前文件夹，更新时不会被快照覆盖。
- `data/browser`：内置浏览器的界面和预览辅助偏好。赛事预设仍在 `state.json` 的 `_presets` 中。
- `resources/app`：程序页面、脚本、应用图标和运行源码；不是比赛数据备份位置。
- `data/desktop-error.log`：实际启动、保存或窗口异常的记录。

构建脚本会对快照使用白名单：只保留自定义字体数据及字体设置，不复制队名、比分、赛事预设、球员名单、队徽、角标、背景图或布局。工作目录中的真实 `control/state.json` 保持不变。软件正常退出时也暂停当前时钟，下一次打开由用户点击开始。主窗口关闭即退出，所有附属窗口和服务器一并关闭；最小化保持服务运行。

移交、备份请复制整个文件夹。升级前退出旧版并备份 `data`，将旧版 `data` 带入新版；不要用新包的初始数据覆盖已有比赛。浏览器中的未保存输入草稿仍需先保存，遵守原界面规则。

## 构建（仅开发电脑需要）

`desktop/main.js` 是桌面入口；`desktop/portable-data.js` 负责首次数据、发布快照和端口选择；`control/serve.js` 的 `createServer` 同时服务 CLI 和桌面版，导入时不监听或打开浏览器。CLI 与 PowerShell 仍保持原行为。

开发电脑使用 Node 和 Python 构建，不会将 Python 作为收件人依赖。

1. 将官方 Electron `electron-v44.7.0-win32-x64.zip` 和对应 `SHASUMS256.txt` 下载到 `packaging/cache`。构建会按官方 SHA256 校验，失败不打包。
2. 同目录提供官方 rcedit 2.0.0 `rcedit-x64.exe`，用于设置图标、产品名和版本。它仅在构建时运行，不进入应用。
3. 在项目根目录执行 `node packaging/build-portable.js`。若发布文件夹或 ZIP 已存在，构建会拒绝覆盖，避免删除已使用软件的真实数据。可传入新的输出文件夹名：`node packaging/build-portable.js 新输出名`。
4. 输出位于 `dist`：完整文件夹、ZIP、ZIP 的 SHA256 文本。文件夹内 `release-manifest.json` 记录所有文件的相对路径、大小和 SHA256。

发布文件仅包括生产页面与素材、桌面入口、数据快照和内置运行环境；不携带测试脚本、测试图片、旧服务器日志、Node/PowerShell 启动脚本、MicroKit dev 项目或下载缓存。Electron/Chromium 的许可来自官方运行包；Motion、SheetJS 和适配 MicroKit 的许可证保存在发布目录 `LICENSES`。EXE 设置了专属足球图标和版本信息；本次构建未配置商业代码签名。

框架分发方式依据 [Electron 官方手动分发文档](https://www.electronjs.org/docs/latest/tutorial/application-distribution)，运行环境来自 [Electron 44.7.0 官方发布](https://github.com/electron/electron/releases/tag/v44.7.0)。页面使用沙箱、上下文隔离并禁用 renderer Node；外部链接仅允许已提供的官方说明站点，依据 [Electron 安全文档](https://www.electronjs.org/docs/latest/tutorial/security)。

## 验证

`node tests/regression.js`：Node 与 PowerShell 的 HTTP 200/302/304、时钟、状态保存、失败回滚与重启。

`node tests/portable.js <发布文件夹路径>`：复制发布文件夹到临时中文/空格路径，运行真正的 EXE，清空 PATH 排除外部 Node/Python/PowerShell；检查首次快照、字体与图片、同实例重复启动、端口冲突、ETag、页面运行环境、队名同步、进球动画、Excel 导入、原生预览窗口、无外部界面资源请求、正常关闭释放端口并暂停计时、文件夹移动后数据与浏览器设置恢复。通过主进程调试协议调用原生窗口关闭，模拟标题栏 X，不将 Chromium 调试 target 关闭误认为桌面退出。

所有测试使用独立临时数据和动态端口，不向真实 `control/state.json` 写入，也不关闭用户已运行的 8123 服务。验证环境为本机 Windows，未在第二台实体电脑上实测。
