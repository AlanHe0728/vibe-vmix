# 转播包装工作台 2.0.0-beta.2

**Beta 测试版：我尚未充分测试此版本。** 请先在自己的设备和直播流程中验证，重要数据使用前应备份。

Windows 独立桌面程序。完整解压后双击 `转播包装工作台.exe`；自带服务运行环境，不打开浏览器。需要系统的 .NET Framework 4.7.2+ 与 Microsoft Edge WebView2。vMix、AE、NewBlue 需自行安装。

## 按需模块

首次启动没有加载任何业务模块。勾选需要的模块并应用，从左侧进入；下次恢复该选择。

| 模块 | 内容 | 默认本机端口 |
| --- | --- | --- |
| 舞台节目 | 节目单、包装、字幕、Logo、赞助商、转场、素材 | 8125 |
| 足球赛事 | 原有比分、时钟、名单、进球、判罚、换人、D200 | 8123 |
| AE 直播连接 | 插件配对、直播控件、PNG 画面、缓存动画播放 | 8126 |

模块管理默认端口 8120。端口占用时选择空闲端口，以上屏界面显示为准。所有服务只监听 `127.0.0.1`；各模块提供独立上屏地址。

模块目录只含轻量描述，启用后才动态导入实现、创建状态仓库、打开端口。未启用的模块不加载页面、模板、素材或计时器。卸载时暂停足球时钟、关闭连接、取消舞台 AE 离线渲染、移除模块代码缓存，保留数据。切换工作区会销毁旧控台页面，已启用模块继续供 vMix 播出。关闭主窗口停止全部模块。

观众端连续读不到状态时隐藏图形，避免冻结内容。停止和恢复服务时仍需在 vMix 确认实际输入状态。

## 舞台操作

1. 添加节目，选择歌唱、舞蹈、武术、器乐、戏曲或其他，填写标题、表演者、副标题和歌词/字幕。每行填写一句，保存后可选句、播出上一句或下一句，最多 500 句。
2. 点击“播出选中节目”。节目单编辑与播出快照分离，保存下一节目不会改动正在播出的内容，再次播出才更新。支持排序、JSON 追加导入/导出、删除后单步撤销。
3. 选择朱金典礼、冰蓝现场、水墨风骨、森绿留白模板。四种模板含不同的字幕条结构，可自定义颜色、字体类别、字号、宽度与坐标。
4. 导入素材，为台标、活动 Logo、赞助商绑定图片，为转场绑定 WebM / MP4。五类图层独立开关，全部下屏保留资料。
5. 包装转场只覆盖画面，不切换 vMix 摄像机。转场按时间戳播放，不重放过期转场，停止时释放视频源。
6. 在 vMix 添加舞台的网页浏览器输入，设为 1920×1080。点击“预览与布局”打开独立窗口；关闭窗口可减少预览开销。

## 独立预览与布局

预览窗口的“全部模块”按足球、舞台、AE 的顺序叠加当前已加载模块，也可以选择单个模块标签；可选双画面、仅 PVW 或仅 PGM。总预览不包含 vMix 摄像机画面，也不改变 vMix 的叠加顺序。

顶部栏目按钮可进入单栏排版预览；“综合排版”显示各栏目，右侧栏目开关可临时隐藏其中部分。“预览内容 → 跟随播出”恢复实时监看；“排版预览”会显示未上屏的元素，缺少内容时使用明确标示的示例，不会保存到节目资料。AE 模块需先生成实际画面，预览不会模拟 AE 渲染。

右侧布局工具提供坐标、大小滑杆、恢复所选元素、六向对齐、构图比例、安全框、网格和吸附。拖动选框右下角可调整适用元素的大小；选框获得焦点后，用方向键移动 1 px，按住 Shift 移动 10 px。对齐使用元素真实边界，支持构图范围、95% 画面安全框和 90% 文字安全框。网格、背景与辅助线只影响监看，偏好保存在本机界面中；画布仍为 1920×1080。双画面在桌面窗口中保持并排，收起布局工具可扩大画面。

在 PVW 选择元素、拖动虚框或输入 1080p 坐标；大小可在适用的元素上调整。调整先保存在窗口中，不影响 PGM 或 vMix 的模块输入。点击“将全部调整应用到播出”后生效；“恢复播出位置”放弃所有尚未应用的调整。应用时如果相同位置已被别的窗口改变，会提示重新检查。关闭窗口会丢弃尚未应用的调整。多个模块依次应用，个别模块失败时已成功的模块不会回滚，未成功的调整保留在 PVW。

## 文件导入能力

| 文件 | 实际处理方式 |
| --- | --- |
| PNG / JPG / WebP | 素材库保存，内置 Logo 图层直接使用 |
| WebM / MP4 | 内置包装转场或 vMix 播放，透明度取决于原素材 |
| MOV / AVI | 素材库保存，由 vMix 原生解码，不承诺 WebView2 可播放 |
| GTZIP / GTXML | 保留文件，发送给 vMix `AddInput Title`，以 `SetText` 和 Overlay API 控制 |
| AEP / AEPX | 导入或链接原文件，原软件打开；调用本机 `aerender.exe` 按合成名与输出模块模板离线渲染 |
| NBTITLE / NBTLPROJ / NBTLPKG | 导入或链接原文件，在系统关联的 NewBlue 软件打开，导出视频后再导入 |

链接本地工程保留原路径，适合依赖外部素材的工程。普通导入只复制所选文件，不自动收集关联媒体、字体或第三方效果。专有工程不会直接变为可编辑的内置模板。上传流式写入硬盘，单文件上限 512 MiB；视频支持范围读取，不存进节目 JSON。

GT 字段须与 vMix 标题编辑器一致，文字字段通常以 `.Text` 结尾。添加 GT 后保存输入名/编号与字段映射，播出节目后可同步文字。主标题成功、副标题失败时明确报告部分完成。

舞台 AE 离线渲染只在点击后启动。用 `BROADCAST_AERENDER` 指定引擎，或自动寻找标准 Adobe 安装目录。输出模板必须实际存在，默认填写名称不代表本机具备该模板或一定输出 Alpha。

## AE 插件

发行包的 `AE插件` 为未签名 CEP 开发版，与可选 AE 模块配合。见[插件安装文档](../ae-plugin/README.md)。

支持文字、数值、颜色、开关、时间定位、制作标记、当前帧持续刷新、工作区动画缓存和 vMix 播放。复杂合成实际帧率取决于 AE 成本，不保证 25/50/60 fps。长渲染会占用 AE；流畅动画使用已经完成的缓存，下一次编辑不会自动替换正在播出的缓存。

## 资源与数据

WinForms + 系统共享 WebView2，不随新工作台携带 Electron / Chromium；只打包服务用 Node。业务页面使用原生 HTML/CSS/JS，没有新增前端框架。最小化尝试暂停控台 WebView，模块服务继续工作。

本机短时空闲采样：未启用模块时私有内存约 248 MB；舞台控台开启、预览关闭时约 288 MB；三个模块启用、停留管理页时约 289 MB。对应 CPU 约为单个逻辑核心的 0%、3.9%、1.3%。这是开启调试接口、无 AE/vMix 的单机采样，不代表实际播出、解码、渲染或其他设备的占用。原始数据见 [native-resources.json](native-resources.json)。程序目录构建时约 93 MiB，不含系统 WebView2；压缩大小以实际文件为准。

降低占用可关闭预览、卸载闲置模块、降低 AE 刷新率/分辨率、避免播出时运行全片渲染。

| 位置 | 数据 |
| --- | --- |
| `data/workspace.json` | 模块选择 |
| `data/state.json` | 足球资料，与旧便携版兼容 |
| `data/stage/state.json` | 舞台节目、包装、设置 |
| `data/stage/assets/` | 舞台素材与工程索引 |
| `data/ae-live/` | AE 密钥、播放设置、画面和缓存 |
| `data/webview/` | 桌面界面缓存 |

关闭后备份整个 `data`，外部链接工程另行备份。新发行包不含真实比赛/节目数据。旧版迁移：退出旧程序，把旧 `data/state.json` 复制到新目录，再启用足球；不要覆盖新版已编辑资料。构建不会覆盖旧发行版或修改源项目的真实状态。

## 开发与验证

`npm start` 启动已构建的当前版本 EXE；`npm run start:workspace` 只启动开发服务；`npm run start:football` 保留旧足球入口。`npm run build:workspace` 使用 Windows x64、Node.js 22+、Python 3.9+、本机 .NET Framework 编译器和微软 WebView2 NuGet SDK。已有输出目录或 ZIP 时拒绝覆盖。

首次从源码构建时，需要自行准备构建缓存。可在项目根目录使用 PowerShell：

```powershell
New-Item -ItemType Directory -Force -Path packaging/cache | Out-Null
Invoke-WebRequest 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4314.35/microsoft.web.webview2.1.0.4314.35.nupkg' -OutFile 'packaging/cache/webview2-1.0.4314.35.nupkg'
$taskNodeVersion = node --version
Invoke-WebRequest "https://raw.githubusercontent.com/nodejs/node/$taskNodeVersion/LICENSE" -OutFile 'packaging/cache/Node-LICENSE.txt'
npm ci
npm run build:workspace
```

Node 运行文件取自构建机器正在使用的 Node EXE。若其目录已有 `LICENSE` 或 `LICENSE.txt`，构建也可直接使用该许可。SDK 原始包和许可需要与所用版本对应；SDK 解压目录会在构建时自动生成，构建清单记录原始包 SHA256。构建输出为 `dist/转播包装工作台-2.0.0-beta.2-Windows-x64` 和同名 ZIP。

运行 `npm test`、`npm run check`、`node tests/workspace-ui.js`、`node tests/native-workspace.js <发行目录>`。覆盖事务、足球 Node/PowerShell、按需加载与卸载、舞台业务、导入和模拟 vMix、AE 协议、ExtendScript 模拟宿主、CEP 面板通信、Chromium UI，以及真实 Windows EXE 的空 PATH 启动、原生窗口退出与端口释放。

本机没有 AE / NewBlue / vMix，无法真机联调或实测 AE 帧率。模拟测试不能替代实际安装，正式播出前需验证文件依赖、模板、透明度、输出编码和设备性能。

实现依据：[vMix HTTP API](https://www.vmix.com/help29/DeveloperAPI.html)、[vMix 输入函数](https://images.vmix.com/help29/ShortcutFunctionReference.html)、[NewBlue 文件格式](https://newbluefx.zendesk.com/hc/en-us/articles/4408894698267-Save-and-package-graphics-or-projects-to-your-computer)、[微软 WebView2 分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version)。
