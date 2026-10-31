## 2026-10-29 共享核心与模块化架构

当前架构以 [ARCHITECTURE.md](ARCHITECTURE.md) 为准，接口见 [API.md](API.md)。两版已共享 `core/`、`modules/football/` 与 `ui/`；旧入口和上屏 URL 保留。新增赛事通过模块契约接入，新视觉包装通过配置与模板实现，不复制服务和公共业务。

核心/API、双后端业务及 Edge 回归、实际便携 EXE 验证已通过；真实比赛状态文件指纹未变。以下为历史开发记录，涉及公共脚本的物理路径请对应新目录说明，浏览器访问路径保持兼容。

## 2026-10-13 Windows 便携桌面软件

- 新增 `desktop/` 与 `packaging/`，制作内置 Electron/Chromium/Node 的 Windows x64 文件夹应用。用户解压后双击 EXE，无须额外安装或启动开发服务；原网页与 PowerShell 方式仍可运行。
- `control/serve.js` 改为可导入的 `createServer`，导入不监听、不打开浏览器，CLI 在 `require.main===module` 时执行原行为。桌面服务器回环监听并自动避让端口；所有实际链接从页面同源生成。
- 比赛数据与浏览器配置均在 EXE 同级 `data` 中，首次由快照补齐，已有或损坏数据不覆盖。发布快照时钟暂停，关闭应用时暂停运行时钟、关闭所有子窗口并清理本地服务。源码真实比赛数据和原文件夹保持不动。
- 构建按官方 SHA256 校验运行环境，设置专属图标和产品版本，保留开源许可，生成文件清单、ZIP 和校验文件；拒绝覆盖已存在发布目录，以免误删用户的 portable 数据。
- `tests/portable.js` 使用真正 EXE、空 PATH、中文/空格路径、临时数据与端口，覆盖端口冲突、首运行素材、单实例、事件动画、Excel、原生预览、正常关闭和移动文件夹后的重启。原 Node/PowerShell 状态回归也通过。说明见 `docs/PORTABLE_APP.md`。

## 2026-10-11 Apple 风格控制台与控件对齐

- 仅修改工作副本。控制台改为 Apple 风格浅灰底、白色分组面板、蓝色主操作和分段导航，仍保留原 98 个字段 ID 与 90 个按钮动作。上屏图形主题与真实比赛数据不变。
- 移除旧表单的固定宽度和内联布局，改用独立 field 标签、双列网格与统一 44px 控件高度。比分、时间按组排列；颜色有原生选择器。主题与动画面板底部按钮对齐，队徽与 Logo 上传在同一组横向排列，窄屏自动换列。
- control/microkit-controls.js 是 MicroKit sliding-content-tabs / scrub-number-field 的原生 JS 适配。支持滑动选中背景、数值拖动、加减、上下键、Shift/Alt 调节、Enter 提交草稿、Escape 撤销和非法输入恢复。保留 MIT 许可于 docs/MICROKIT_LICENSE.txt；未修改 microkit-ui 本身。
- 所有组件资源由原 Node / PowerShell 服务器提供，不引用 localhost:3000、React 或 CDN；不需要另外启动 MicroKit dev。后续玻璃导航使用随项目附带的 Motion，见本文最新一节。数值、色块调节只改草稿，应用按钮仍走原状态写入；图片/字体按原逻辑选择即上传。
- 从服务器加载以及恢复默认后同步色块、速度读数和数值控件，修复滑杆读数与已保存速度不一致。导航改变与控件调节不重建表单，也不触发上屏。
- tests/panel-layout.js 检查桌面/手机五组布局、44px 高度、标签与输入位置、设置操作区对齐、320–1440 宽度、MicroKit 键盘与真实鼠标拖动、草稿不写盘、应用保存及 Node/PowerShell 静态资源正常；同时检查页面无外部或开发服务器请求。tests/browser.js 覆盖原比分、计时、名单、动画、预览和 D200 联动。
- 对齐效果截图：docs/screenshots/control-settings-alignment.png。测试始终使用独立状态与临时浏览器；不停止用户已经运行的服务器。

## 2026-10-10 控制台布局优化

- 使用已安装 frontend-design 与 impeccable 的布局指南；Impeccable 自动上下文/检测引擎未安装且缓存不可写，改用源码与真实浏览器检查。
- 保留深色风格，将操作分为比赛控制、球员事件、名单、画面设置、设备连接。默认比赛控制，赛事预设折叠；表单切换仅显示/隐藏，保留未保存的内容。
- 顶部比分与比赛时钟读取现有小体积状态接口，不增加写请求。比赛时间按服务器返回值显示；同步中断超过四秒停止推进并提示。主客队进球仍调用原 quickGoal。连接地址移入设备连接，连接/保存状态留在页头。
- 新增 control/panel-layout.css 与 control/panel-layout.js。保留原字段 ID 与命令函数、单链接和四状态名单架构。日志从浮层改为页面底部展开，支持键盘导航、表单标签和窄屏布局。
- 自动检查使用 tests/panel-layout.js 的独立比赛文件与临时 Edge 配置，覆盖全部分组、320/390/720/768/1280/1440 宽度、未保存输入、键盘导航、长队名/日志、D200 比分同步；页面截图在 docs/screenshots。tests/browser.js 仅新增 CDP 导出以复用浏览器检查工具。
- 未修改真实 control/state.json、原项目与 Ulanzi Studio 配置。README 已更新导航说明。

# 项目交接说明（交给下一个 AI）

## 2026-10-09 D200 接入

- 用户确认用 Ulanzi Studio 3.4.4，设备为 D200、固件 2.0.3；选择 API Request 方式。现有“网页控制”是网页视频控制插件，未提供 HTTP 请求功能。本轮未安装插件或修改 Ulanzi 的预设/配置。
- 新增 `control/d200.html` 配置页、`d200-actions.json` 共用 42 动作目录、`d200.js` / `d200.ps1`。Node 和 PowerShell 5.1 提供同一组接口：`GET /api/d200/actions`、`GET /api/d200/status`、`POST /api/d200/action/<id>`。
- 按键动作必须 POST；状态接口只读，返回小体积 JSON。GET 动作返回 405，避免配置轮询时持续加分。配置页按当前 origin 生成地址，并提供推荐 12 键、复制字段、测试按钮与配置清单导出。
- 进球/纠错在服务器当前比分上累计，重复触发各有新 tick。面板的加减分、同步进球通过 `scoreHome_delta` / `scoreAway_delta` 指令原子累计；这些指令键不落盘。POST 保存成功响应包含实际比分，避免面板与硬件并发丢分。
- `clear_events_tick` 撤下四种瞬时动画；“全部图形下屏”也关闭常驻图层，计时不自动暂停。
- 控制面板新增内容准备按钮（保存不触发），并通过小体积状态读取外部比分，保护当前正在编辑的比分输入及待写入操作。
- `tests/d200.js` 验证两个服务器的全部动作、状态一致性、并发加分和保存失败回滚；`tests/browser.js` 增加配置页及 D200 接口与浏览器联动。尚未硬件实测。
- 使用步骤见 `docs/D200_SETUP.md`。原项目、真实状态文件及 Ulanzi Studio 当前配置均未修改。

## 2026-10-08 Codex 修订（以本节为准）

- 工作副本：`D:\17685\Documents\ChatGPT\Vmix\football-broadcast-pack`；原项目保留。本次没有修改副本的 `control/state.json`，其比赛数据、图片、预设保持原样。
- 先前“全部问题已修复”的记录是历史说明。本轮已修复多页面计时回写冲突、刷新重播历史事件/位置重置、滑杆防轮询覆盖、背景图 CSS、负比分、改端口失效及假成功提示。
- 服务器是时钟的唯一来源：`clock_state` / `sb_clock_state` 为 `{mode,running,accMs,base}`，`base` 是 Unix 毫秒时间。只在命令时更新，不按秒写文件。刷新/新浏览器/服务器重启继续使用同一基准；运行中的计时包含服务器停机时间。
- 旧状态在服务器启动时仅在内存中迁移，第一次实际写入时连同新锚点原子保存。不要在迁移时执行旧的 `*_cmd`、`*_tick`。旧数据没有时间基准，因此只能从旧快照时间开始迁移。
- Node 使用 `control/clock-state.js`；PowerShell 使用等效逻辑，兼容 Windows PowerShell 5.1。两个服务器均提供缓存后的 ETag/304、真实错误响应、临时文件写入后原子替换；保存失败保留内存状态。
- 所有上屏页加载 `titles/runtime.js`；状态地址默认使用页面所在服务器，仍支持 `?state=`。轮询串行、防止旧请求覆盖新状态；首次成功读状态仅建立 tick 基线。时钟页是只读显示，API 包装函数发命令给服务器。
- 事件 tick 由服务器生成唯一编号，避免面板刷新或多个面板重复编号。位置重置由服务器执行一次，页面不再自动回写默认位置。
- 位置/缩放在手势期间受 `DRAG` 保护；发送后用 `PENDING` 等待服务器返回的状态与保存值一致，失败提示并恢复之前的状态。手柄/滑杆统一范围 0.3–3。
- 面板按顺序发送写请求，检查 HTTP 状态及 `ok`；所有写入成功日志等待确认，失败在顶部和展开日志中显示；日志不会展开上传数据的完整 base64。
- 旧分离模板只同步了本次必要的状态地址、事件基线和计时修复；主题与四状态名单依旧未同步。舞台组件及独立图片存储仍未实施。

验证（使用临时数据及临时浏览器配置，不占用真实比赛文件）：

```powershell
node tests/regression.js
node tests/browser.js
```

`regression.js` 验证 Node / Windows PowerShell 5.1 的 200/302/304、读写、时钟、事件编号、持久化、重启及保存失败回滚。`browser.js` 用本机 Edge 无界面验证两页时钟一致且无回写、刷新不重播、不重置、重复进球、背景图、名单可见、滑杆、真实拖拽、预览、自定义端口及失败提示。后者支持 `FBP_BROWSER` 指定 Chromium 路径。
测试服务器支持 `FBP_NO_BROWSER=1`（不弹出浏览器）和 `FBP_STATE_FILE`（隔离状态文件）；一般用户无需设置。

下方为原交接记录，涉及旧实现的内容以上述修订为准。

---


本文档用于把一个正在进行中的项目交接给另一个 AI 继续开发。请先通读「一、项目是什么」与「六、必须遵守的 Bug 清单」，
再看「七、已知限制与建议的下一步」。

---

## 一、项目是什么

- 位置：`D:\Deepseek\football-broadcast-pack`
- 目标：一套给 **vMix** 用的**足球比赛网页图形包装系统**（比分条、计时、红黄牌、发球、球员条、进球、名单、Logo）。
- 技术形态：纯 HTML/CSS/JS + 一个本地小服务器（Node 或 PowerShell）+ `state.json` 状态驱动。
- 上屏方式：vMix 里添加**一个**【网页浏览器输入】，加载 `http://localhost:8123/titles/graphics.html`。
- 操作方式：浏览器打开控制面板，点按钮/改字段，画面即时更新，动画自动入场、停留、退场。

**重要：** 所有图形都合并在这**一个**链接里，不要在 vMix 里加多个输入来回切换（这是用户明确要求的）。

---

## 二、用户的需求（按时间顺序，全部已提出并已实现）

1. 修改该文件夹，做出一款**能真正使用**的 vMix 足球比赛网页包装系统。
2. 综合打磨：修 bug、进球联动比分、赛事预设、预览页、README。
3. 修「bat 打不开、预览显示未启动、打开面板报文件不存在」。**要求：先保证能正常运行，美观其次。**
4. 画面改成**更专业的风格**；把所有动画**整合进一个 vMix 链接**（原来 7 个链接要手动切换，不方便也不好看）。
5. 修：倒计时不可用、计分板不能隐藏、两个动画叠加；**正计时与倒计时放在同一个操作面板**；
   位置重叠时**自动打断前一个动画**；计分板要能隐藏；**元素可自由移动位置**；要有 **Logo 更换**功能。
6. 修：文字闪一秒后消失。
7. 修：比分条队名要**留足空间并保持左右对称**；比分条要能**放下主客队 logo**；倒计时方向不对（正倒计都在正向走）。
8. 修：名单文字仍不显示；缩放不顺畅且经常失效；红黄牌的球员姓名与牌面没有中心对齐。
   要求：文字正常显示、**缩放顺滑且无极调节**、红黄牌文字与牌面**居中对齐**。
9. 名单：控制面板分成四块，但**上屏时是同一个面板的四种状态**。
10. 修：比分条上方的比赛状态指示栏被比分条挡住一半。
11. 把「制作 vMix 模板的方法（体育 + 舞台）」写成**预设**；可自由创造有用工具；**务必牢记对话中修过的 bug**；
    包装组件要能**自定义颜色、皮肤、背景、字体**。
12. 继续：让使用者可**自定义动画、图片、字体**等效果。
13. README 改成**简单直观的操作手册**（不要原理，减少 AI 味，少用奇怪符号）。

---

## 三、已完成的工作（当前代码状态）

### 3.1 启动与服务器
- `control/启动控制面板.bat`
  - **已改为 CRLF 换行、纯 ASCII 提示**（原先 LF 导致 cmd 解析错乱、服务器根本起不来，这是最早的重大 bug）。
  - 优先用 Node 启动 `serve.js`，找不到 Node 才回退 `serve.ps1`。
- `control/serve.js`（推荐）
  - 根路径 `/` → 302 跳 `/control/panel.html`（原先 404）。
  - 端口占用（EADDRINUSE）有明确报错并退出。
  - 启动后打印面板/预览/状态地址，并用 `spawn(..., {stdio:'ignore'})` 打开浏览器（不用 `exec`，避免某些环境管道受限）。
  - **`GET /state.json` 支持 ETag / 304**：状态没变只回 304，避免每 200ms 重复下载大体积状态（含 base64 图片）。
- `control/serve.ps1`（备用）
  - `$PSScriptRoot` 为空时用 `$MyInvocation.MyCommand.Path` 兜底；监听失败（占用/权限）给出提示；根路径重定向。
- **所有页面的轮询**由 `cache:'no-store'` 改为 `cache:'no-cache'`，否则浏览器不会带 `If-None-Match`，ETag/304 失效。

### 3.2 单链接上屏页 `titles/graphics.html`（核心，41 KB）
包含全部图形，1920×1080，透明背景：
- **比分条**：主客队名（左右对称、居中、预留空间）、比分、比赛时钟、阶段、状态徽标、**主客队徽**。
- **计时器**：**正计时 / 倒计时同一面板**，设置时间后自动显示，倒计归零红色报警。
- **红黄牌**：牌面 + 姓名/球队/原因，**整体水平居中**（`.cd` 用 flex 纵向居中）。
- **发球**：开球/界外球/角球/球门球/任意球/点球。
- **球员条**、**进球庆祝**（GOAL 大字 + 球员 + 比分 + 光芒）、**Logo/队徽**（角标独立、可拖拽）。
- **名单**：**一个面板、四种状态**，由 `lineup_active`（`xiH`/`xiA`/`subH`/`subA`）决定显示主队首发/客队首发/主队替补/客队替补。
- **动画**：触发后自动 入场→停留→退场；**仅瞬时动画**（进球/红黄牌/发球/球员）做**重叠自动打断**；
  常驻层（比分条/计时器/名单/Logo）不被自动隐藏。
- **可拖拽 + 可缩放**（编辑模式 `?edit=1`）：拖动=移动；拖右下角圆点或顶部滑杆=缩放（0.3–3.0 无极）；
  位置 `*_pos`、缩放 `*_scale` 自动保存到 state.json；可重置。
- **主题**：`theme_skin`（dark/glass/deep/cyan/night）、`theme_accent`、`theme_bg`、`theme_font`。
- **自定义**：`motion`（缓动：smooth/lively/soft/linear）、`animdur`（速度倍率）、
  `hold_*`（各动画停留秒数）、`font_data`+`font_family`（上传自定义字体，动态注入 `@font-face`）、
  `theme_bg` 可放背景图（data-URI，用于整屏图形）。

### 3.3 控制面板 `control/panel.html`（47 KB）
卡片式操作界面，包含：
- 赛事预设（保存/载入/删除某场比赛的队伍、颜色、比分、阶段）。
- 联合上屏 · 单链接：复制地址；显示/隐藏 比分条/计时器/名单/Logo；重置位置；**打开位置/大小编辑器**。
- 比分条：队伍/比分/阶段/颜色/比赛时钟控制/显示隐藏。
- 计时器：正计时/倒计时、设置并显示、开始/暂停/复位/±1分、显示隐藏。
- 红黄牌、发球动画、球员条、进球庆祝（含「同步比分到比分条」）、
- **名单四块**：主队首发 / 客队首发 / 主队替补 / 客队替补（写入并显示，会设置 `lineup_active`；隐藏=隐藏整个名单面板）。
- Logo 与队徽：主队徽、客队徽、角标（上传/隐藏/清除）。
- 皮肤 · 风格：皮肤、强调色、背景、字体。
- 自定义效果：动画风格、速度、各动画停留、背景图、自定义字体。
- vMix 叠层（可选，连 vMix API 上/下屏）。
- 本地记忆（localStorage 记住服务器地址、vMix API 等）。

### 3.4 预览 / 编辑器 `control/preview.html`
- 把图形缩放显示在模拟球场上，默认选中「联合(单链接)」并**以 `?edit=1` 加载**，即位置/大小编辑器。
- 若用 `file://` 直接打开或服务器没启动，会给出明确提示。

### 3.5 文档
- `README.md`：**已重写为简单直观的操作手册**（只讲怎么用，不讲原理）。
- `docs/VMIX_TEMPLATE_METHOD.md`：方法预设。含 vMix 网页图形制作方法（体育 + 舞台模板清单）、
  主题体系、以及**本项目修复过的 16 条 Bug 清单**。换肤/复用/扩展前应先看这份。

### 3.6 旧版分离模板（保留，非主用）
`titles/` 下仍有 7 个独立模板：`scoreboard.html`、`clock.html`、`restart.html`、`card.html`、
`player.html`、`goal.html`、`lineup.html`。用于「想用 vMix 过渡单独控制某一层」的高级用法。
**注意：这 7 个模板没有做主题/自定义功能；`lineup.html` 仍是旧版单名单（`lineup_*` 键），未同步四种状态模型。**

---

## 四、当前文件与运行方式

```
football-broadcast-pack/
├─ README.md                        操作手册
├─ docs/VMIX_TEMPLATE_METHOD.md     方法 + Bug 清单
├─ titles/
│  ├─ graphics.html                 单链接上屏页（vMix 只需这一个）
│  └─ scoreboard.html … lineup.html 旧版分离模板（可选）
└─ control/
   ├─ 启动控制面板.bat              一键启动（CRLF，优先 Node）
   ├─ serve.js / serve.ps1          本地服务器
   ├─ panel.html                    控制面板
   ├─ preview.html                  预览 + 位置/大小编辑器
   └─ state.json                    状态数据（当前约 3.5 MB，含用户上传的 base64 图片）
```

运行：
1. 双击 `control\启动控制面板.bat`（会自动打开控制面板 `http://localhost:8123/control/panel.html`）。
2. vMix：添加输入 → 网页浏览器 → 地址填 `http://localhost:8123/titles/graphics.html` → 尺寸 `1920×1080` → 叠层或切 PGM。
3. 必须用 `http://localhost:8123/...` 访问页面，**不要双击 HTML 文件**（`file://` 会显示未启动/文件不存在）。

---

## 五、关键状态键（state.json）

- 比分条：`teamHome, teamAway, scoreHome, scoreAway, period, status( running/paused/half/over ), colorHome, colorAway, homeLogo, awayLogo, scoreboard_show, sb_clockcmd, sb_clock_tick, sb_clockacc, sb_clockrun, sb_clockmode`
- 计时器：`clock_label, clock_sub, clock_color, clock_mode(up/down), clock_mm, clock_ss, clock_cmd(set/start/pause/reset/plus/minus), clock_tick, clock_show`
- 红黄牌：`card_type(red/yellow), card_num, card_name, card_team, card_reason, card_trigger, card_tick`
- 发球：`restart_type(kickoff/throwin/corner/goalkick/freekick/penalty), restart_team, restart_player, restart_text, restart_color, restart_trigger, restart_tick`
- 球员条：`player_name, player_num, player_team, player_pos, player_event, player_color, player_tick`
- 进球：`goal_team, goal_name, goal_num, goal_scoreHome, goal_scoreAway, goal_color, goal_trigger, goal_tick, score_trigger, score_tick`
- 名单：`lineup_active(xiH/xiA/subH/subA), lineup_show, xiH_*, xiA_*, subH_*, subA_*（各含 _team/_subtitle/_color/_players）`；
  旧键 `lineup_*` 仍被兼容读取（主队首发无数据时回退）。
- Logo：`logo_data, logo_show, logo_pos`
- 位置/缩放：各层 `<层>_pos = {x,y}`、`<层>_scale = 数字`；层名：`sb, clk, rst, card, ply, goal, logo, lineup`
- 主题：`theme_skin, theme_accent, theme_bg, theme_font`
- 自定义：`motion, animdur, hold_goal, hold_card, hold_rst, hold_ply, font_data, font_family`
- 预设：`_presets`
- 重置位置：`posreset_tick`（递增即触发重置）

**触发去重机制：** 所有触发键都配一个 `*_tick` 计数键（如 `goal_tick`）。模板按 **tick 变化**判断是否重新播放，
所以**同一动画可反复触发**（值相同也会再播）。用脚本写 state.json 时，每次要再播一次就递增对应 `*_tick`。
注意 tick 键是**显式映射**的（例如 `sb_clockcmd → sb_clock_tick`），不要靠后缀猜。

---

## 六、必须遵守的 Bug 清单（本项目实际踩过并修复，务必不要复现）

1. `.bat` 必须 **CRLF 换行**、提示尽量 ASCII，否则 cmd 解析错乱、服务器起不来。
2. 根路径 `/` 要 302 到 `/control/panel.html`。
3. **倒计时方向**：倒计时 = `accMs - 流逝`（下限 0），正计时 = `accMs + 流逝`；否则倒计时也正向走。
4. 触发去重按 `*_tick` 计数，不按触发值，保证同一动画可重复触发。
5. **重叠打断只对瞬时动画**（进球/牌/发球/球员）；常驻层（比分条/计时器/名单/Logo）不要被自动隐藏。
6. **名单文字刷新消失**：不要在每次轮询都重建 `innerHTML`；只在「从隐藏→显示」或「内容/颜色有变」时重建并重放入场。
7. **名单更新后文字不显示**：新行初始 `opacity:0`，必须重放入场动画（`forwards` 到可见）。
8. **红黄牌文字与牌面居中**：容器要 `display:flex; flex-direction:column; align-items:center`。
9. **比分条状态徽标被盖住**：徽标绝对定位，同层比分条是 `position:relative` 且 DOM 在后；给容器 `position:relative`、徽标 `z-index`。
10. **缩放被轮询重置**：拖拽/缩放期间设 `DRAG[id]=true`，`applyPos` 才不覆盖 transform。
11. **缩放手柄要反向缩放**保持固定大小、易抓取；并提供**滑杆**做无极调节。
12. `/state.json` 要支持 **ETag/304**，否则大体积状态（含图片 base64）每 200ms 全量下载会很卡。
13. 轮询 **不要用 `cache:'no-store'`**，否则 ETag/304 不生效。
14. `$PSScriptRoot` 可能为空，PowerShell 脚本要兜底。
15. 数据结构变更要做**向后兼容迁移**（如名单从旧 `lineup_*` 迁移到 `lineup_active` + 四状态）。
16. 触发 tick 键要**显式映射**，不能靠后缀猜测（`cmd` 与 `_cmd` 不同）。

---

## 七、已知限制与建议的下一步

已知限制：
1. `state.json` 目前约 **3.5 MB**，因为用户上传了较大的 base64 图片（主客队徽、角标、可能的背景图/字体）。
   ETag/304 已缓解轮询压力，但建议后续**把图片改存为独立文件**或提示用户压缩图片。
2. **2026-10-11 已统一独立入口**：七个页面跳转到 `graphics.html?only=...`，共享新版主题、自定义和四状态名单。
3. **DSH agent 预设未真正创建**：本会话的运行环境没有 `cordis_mount` / `agentPresets.copy()` /
   `standingKeyFor()` 等工具，无法产出「挂载验证通过」的 agent 预设。方法内容已写入
   `docs/VMIX_TEMPLATE_METHOD.md`（第八节给了安装/校验流程）。若新环境具备这些工具，可据此把方法装成 agent 预设。
4. 主题/自定义作用于联合上屏和七个独立入口；详见 `BROADCAST_DESIGN.md`。
5. 舞台演出（人名条、节目单、致辞字幕等）**只有方法清单，还没有做成实际组件**。
6. 名单为**常驻面板**（`lineup_show` 控制），不做自动退场（故没有 `hold_lineup`）。
7. 编辑器手柄只在预览页（`?edit=1`）出现；vMix 上屏画面是纯净的（无手柄）。

建议的下一步（按价值排序）：
1. 把 stage（舞台演出）组件真正做成图形，并加进单链接页（人名条、栏目标、节目单、致辞/口号、章节切换字、赞助商角标）。
2. 独立入口已统一到单链接渲染器；后续继续维护同一套 CSS 与组件。
3. 图片优化：改为独立文件存储或自动压缩，缩小 state.json。
4. 动画库扩展：整套入场/退场预设（弹入、擦除、逐行入场等），可按组件选择。
5. 元素级图片支持：进球事件图、球员头像等。
6. 多套命名皮肤一键切换。
7. 若环境允许，把方法文档装成真正的 DSH agent 预设（含 `preset.yml` 的名称与描述）。

---

## 八、给下一个 AI 的工作约定

- 改动前先读 `docs/VMIX_TEMPLATE_METHOD.md`（含方法、主题体系、Bug 清单）。
- 每次改完必须自检：
  - 所有页面内联 `<script>` 用 `node --check` 语法通过；
  - `graphics.html` 里所有 `$('id')` 引用都有对应元素（防止白屏）；
  - 启动服务器实测页面返回 200、状态写入/读取正常；
  - 不要留下占用 8123 端口的进程；测试用的临时键要从 `state.json` 清掉，但**保留用户的真实数据**。
- 用户很在意「能不能真的跑起来」，功能优先于美观；但风格要专业、干净。
- 保持 `graphics.html` 单链接 + 单名单面板 + 主题/自定义 的整体架构，不要退回多链接、多名单面板。

## 九、GPT 转播外观与布局更新（2026-10-11）

控制台的成对卡片列宽、标题区、底部按钮与底边已对齐。观众端按用户最新英超规范参考改为浅色比分横条、独立中央比分、下挂时钟、深青灰细标题带和对齐的信息行，取消夸张旋转、翻牌和弹跳，六种发球图标沿用项目 SVG，改为中性灰并缩小为辅助标识。比分条、计时器、进球、判罚、球员条及四状态名单全部更新。MicroKit 控件仍在本地静态运行。

设计与验证记录见 `BROADCAST_DESIGN.md`；实际渲染图见 `screenshots/broadcast-overview.png`。真实 `state.json` 保持不变。

### 用户本轮反馈与覆盖规则

用户明确否决赛事紫和高饱和黄绿搭配。当前所有皮肤均去掉紫色，以灰白、石墨和少量深青构成统一体系；不得把旧版截图或旧配色说明当成当前设计依据。最新规则在根目录 `DESIGN.md`，完整图形及球场合成分别为 `screenshots/broadcast-overview.png` 和 `screenshots/broadcast-scene.png`。


## 2026-10-11 补充：Wipe、时间控制和完整阵容

用户最新要求已将“只显示一份名单”扩展为“优先全部展示，也保留四种单独展示”。仍是单链接、单个名单面板，不能重复创建主客队独立面板。

- `lineup_mode` 默认 `all`；`single` 时使用 `lineup_active`（xiH/xiA/subH/subA）。完整名单分两队两栏，每栏首发、替补明确标示；号码底色来自 xiH/xiA_color，颜色相同时对客队使用备用色，文字按亮度选黑/白。名单数据未变化时不重建 DOM。
- 完整名单使用 `lineup_all_pos/lineup_all_scale`，默认 (960,580)/1；单独名单继续使用旧 `lineup_pos/lineup_scale`，不迁移或覆盖旧保存值。编辑器按模式保存，Node 与 PowerShell 的位置复位都涵盖两套布局。
- Wipe 使用 CSS clip-path 和 opacity 过渡，事件重播/名单替换使用原生 Web Animations；无动画库、网络资源和开发服务依赖。`wipe_in/wipe_out` 默认 .45/.28 秒，乘原 `animdur`。事件停留计时在入场后；打断旧事件立即隐藏，不等待退场。
- 比赛时钟 UI 新增正/倒计时、分钟和秒、设置并暂停及 00:00/45:00/90:00 快捷起点；继续使用原有后端锚点命令 `sb_clockcmd=set`，不让观众页写入时间。长分钟数自动缩小文字，不能擅自截断真实时间。
- D200 新增 `lineup_all`（43 个动作、推荐仍 12 个），单独动作设置 `lineup_mode=single`，状态轮询反映 all 或当前单独前缀。
- 六组验证：regression、d200、browser、panel-layout、broadcast、features，全部隔离比赛数据和临时端口。增加 Node/PowerShell 手动设置比赛倒计时的往返验证。
- 原项目与工作副本真实 `control/state.json` 均不因测试更改。加载新增后端动作需要重启工作副本服务；vMix 网页地址保持不变。


### 2026-10-11 比赛阶段与状态修复

阶段下拉框原先没有 onchange 保存，只能随应用比分批量提交；现由 setPeriod 即时独立提交。状态按钮原先只写 status、不联动时钟且没有 UI 反馈；现原子提交 status、sb_clockcmd(start/pause)、sb_clock_tick，成功后更新 aria-pressed 与当前状态，失败不显示保存成功。fetchState 恢复状态反馈。状态与比赛阶段仍是两个字段，改阶段不重置时间。

用户保存的 sb_pos=(1664,46)、sb_scale=.73 导致上方状态徽标被画布顶边裁切。sbSetStatus 检查实际标签位置，靠顶边时加 in-bar 类，把标签放在条内左下方；有足够空间仍放在上方。不改用户的位置、缩放和比赛数据。tests/features.js 已增加实际 onchange/click、六阶段、四状态、时间不归零、草稿不串写、刷新保存与相同顶边坐标复现检查。


### 2026-10-11 比分、球队、球员联动与场内换人

- 新增静态 `control/panel-links.js`，负责表单草稿同步、球队/颜色派生、号码精确匹配、导入及球员选项。手动比分不被只读状态轮询覆盖；成功写比分后用服务器返回值同时更新主比分与 goal_score 输入。Node/PS 的状态合并在任意主比分/增量变化后同步 goal_score，不触发进球事件。
- 球员以 side|规范号码|去掉队长标记的姓名识别。球员选项按「场内/场外」分类，场内在先；手动号码先在所选球队的场内匹配，再在场外匹配，同范围同号多人的情况必须选人。输入未匹配号码会清除上一次自动姓名，保留用户主动输入的姓名。上传或粘贴名单只更新草稿。
- 新增 `control/match-roster.js/.ps1`，原子验证换人身份和当前场内状态。`onfield_home/away` 数组保存场内 ID，缺省来自首发。首发文本有变化时重置该队场内数组；换人替换出场 ID，不移动 xi/sub 原始文本。GET D200 status 提供 onfield 供表单只读同步。PS 新文件必须 UTF-8 BOM。
- 新增 sub_side/off_id/on_id/off_num/off_name/on_num/on_name/team/color/trigger/tick，待执行换人保存不改 onfield。执行需 sub_trigger=show 与 sub_tick，重复出场或已在场的上场人必须拒绝，不留部分写入。D200 新动作 sub_show，总共 44 个动作；保留原 ID 和 12 个推荐。
- 单链接新增瞬时 sub 换人条，沿用 wipe、hold_sub（默认 5 秒）、位置/缩放、重叠打断、历史 tick 不重放和编辑器。没有新的单独上屏输入。
- 新增 tests/links.js，Node/PS 临时服务验证比分镜像、并发换人只执行一次、错误换人无状态写入；真实浏览器验证各事件手动号码、两队同号、场内优先、重复号码提示、文件导入、草稿保护、D200 分数同步、换人上屏、回换与刷新保存。原真实 state.json 不因测试更改。

### 2026-10-11 换人回填、发球选择与 Apple 状态反馈

- 用户的 8123 旧进程仍运行此前加载的代码，GET status 没有 onfield；实际文件有 sub_tick，但没有 onfield 数组。新版面板执行换人前只读检查能力，旧服务明确提示重启并拒绝提交，不能把只播放标题当成换人成功。
- Node/PS POST 状态保存后返回 score、onfield、controls。面板使用该确认结果立即更新选人框和实时名单，后台轮询也同步。缺少场内数组的旧数据启动时在内存初始化；若最后一次已记录换人身份可确认，则恢复该次交换。不写盘、不触发新 tick，不声称能重建缺失的完整历史。
- 发球接入 restart_side/num/name/roster_player/match_hint，选择及手输号码与其它事件相同，生成兼容旧渲染器的 restart_player，仍允许单独改上屏文字。
- 新增 panel-choices.js；状态、可见性、时钟、名单、发球与红黄牌按钮的 aria-pressed 由保存确认与 status.controls 更新。未选中统一灰色，选中蓝色，红黄牌保留选中时语义色。原生球员选择框未选灰色、选中浅蓝。
- 卡片阴影用伪元素 opacity 的 160ms ease 过渡，hover:hover/pointer:fine 才响应鼠标，减少动效设置取消过渡。布局不做位移或缩放。观众比分中央格左右投影、条体和下挂时间投影保持克制。
- 名单控制页顶部有实时场内/场外名单，原 XI/替补文本保留。按 2026-10-13 用户最新要求，观众名单仅展示赛前首发/替补、号码、姓名与队长，不显示「已下场/已上场」或姓名灰显；显示签名不再包含 onfield，换人本身不重建／重播阵容。
- links/layout/features/d200/regression/browser/broadcast 均以临时数据检查；新增旧服务阻断、旧记录恢复、保存确认内容、发球选人、即时人员变动、单选颜色和悬停不移动检查。新增截图 control-selection-hover.png、broadcast-score-shadow.png。

### 2026-10-11 Apple 圆角与玻璃表面

控制台圆角使用统一 token：按钮/分段导航为胶囊，输入框 14px，文本区 20px，大卡片/比分概览 26px。44px 控件高度与布局网格维持。复选框保留原生 checkbox 元素与键盘行为，CSS 显示为 34×22 的开关。

玻璃层集中在功能导航、页眉和比分概览，使用半透明中性表面、backdrop-filter、白色边缘高光与偏移柔影；内容卡片使用较厚的白色表面，输入区维持清晰稳定的底色，避免文字叠在多层透明材质上。网页模拟材质，无新增运行时、CDN、图片或服务依赖；不改变观众端转播主题。选中蓝色按钮的高光叠加 ≤4%，白字对比仍 ≥4.5:1。降低透明度/增加对比度及不支持模糊的浏览器使用实底；减少动效沿用现有规则。

panel-layout 实测五页桌面/手机对齐、字段高度、单选/数值/滑杆、键盘开关和低透明度/高对比模式。新版截图沿用 control-*.png。此次只有样式与文档更新，刷新控制页即可，无需重启服务。

### 2026-10-11 透明玻璃、液态导航与原生圆角菜单

- 页眉、导航、比分概览的白色遮罩显著降低，采用中性低透明度填色、背景模糊与薄边高光。内容卡片继续保留适合读写的清晰底色。控制页面与下拉菜单隐藏滚动条，仍可正常滚轮、触屏和键盘滚动。
- `liquid-nav.js` 使用两个可中断的 Motion 值驱动同一片玻璃的头尾；不同响应速度形成短暂粘连腰部，然后恢复胶囊。标签和命中区不移动，连续切换继承当前位置与速度，不锁定操作；初始化、窗口变化、键盘切换及减少动态效果即时定位。固定尺寸 mask 的 clip-path 是唯一随帧重绘的轮廓，不引发布局。
- 仅新增本地 `control/vendor/motion.js`（Motion 12.43.0，约 140 KB，MIT 许可见 `docs/MOTION_LICENSE.md`），来源为工作目录内已经安装的 MicroKit 依赖。没有 React、额外服务、联网请求或构建步骤；原 Node / PowerShell 静态服务直接提供资源。
- 通过 `appearance:base-select` 和 `::picker(select)` 定制浏览器原生下拉列表，22px 圆角、低透明度填色、20px 背景模糊、柔影、选中勾选及无滚动条列表。保留 select/option/optgroup、所有原 ID、动态名单更新和键盘焦点，不手写列表框。菜单进入原生顶层，不受卡片裁切。打开前只读测量可用上下空间并设置菜单高度上限，避免矮屏菜单越界；方向选择及滚动仍由浏览器处理。新版 Edge 实测支持，旧引擎按 `@supports` 保留普通 select；降低透明度/增加对比度/不支持背景模糊时菜单改实底。
- 验证使用隔离数据与临时浏览器：`tests/glass.js` 实测展开菜单、滚轮滚动、键盘回填号码姓名、快速反向切换和减少动态效果，并检查两个服务的静态资源；`tests/panel-layout.js` 检查全部页面的桌面/手机对齐；`tests/links.js` 检查比分、球队、颜色、手输号码、导入与换人联动。截图见 `control-glass-roster*.png`、`control-liquid-motion.png`。未修改真实比赛数据或原文件夹，刷新控制页即可。

实现参考：[MDN 可定制原生 select](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select)、[Motion animate](https://motion.dev/docs/animate)。

### 2026-10-11 全部控制框玻璃化与冷灰按钮

- 用户要求将透明材质扩展到所有框，并降低原蓝、红、黄按钮的饱和度。五个控制分组的文本输入、闭合与展开 select、数值框、滑杆容器、上传框、名单 textarea、色块外框、按钮、卡片和日志均采用同一玻璃材质。数值输入由外层提供材质，内层不再重复模糊；色块保持真实比赛颜色。
- 统一石墨主色 `#485463`，普通按钮为浅冷灰透明面，主要操作与选中项统一深石墨、白字。取消红黄牌选中项的大色块；文字仍写红牌/黄牌。清除、复位等原 red 操作仅用低饱和灰玫瑰文字区分，底色属于同一中性玻璃体系。焦点、开关、滑杆、名单选中项、勾号、文字选择与状态点同步收敛配色。
- 控件仍高 44px，单行输入/数值/上传框改为胶囊，textarea 20px、大卡片 26px。卡片填色从 94% 降至 32%，小框填色 16%，使用薄边高光、12px 小框模糊和 18px 卡片模糊。全部状态通过原有 aria-pressed 更新，保留原命令、ID、草稿及真实比赛数据。
- 降低透明度、增加对比度、不支持背景模糊均使用实底；降低透明度/高对比还取消所有框与按钮的背景模糊，避免只处理导航。控制台细节见 `docs/CONTROL_DESIGN.md`，观众端仍由 `DESIGN.md` 单独规定。
- `panel-layout` 使用临时数据逐个检查五个分组的桌面/手机玻璃覆盖、44px 高度、标签及卡片对齐、数值拖动、上传控件和远程比分。`glass` 实测菜单、键盘与鼠标选人、无滚动条滚动、窄屏定位和液态导航。静态资源分别通过 Node/PowerShell 交付；刷新控制页面即可，无新增服务。

### 2026-10-11 蓝白玻璃按钮与开关（最新配色，替代上一节石墨方案）

- 按最新 Apple 控制中心与透明滑块参考，使用蓝 `#0068c5`、白色玻璃与辅助灰 `#5c6876`。普通操作按钮保持透明白，按下立即蓝底白字、松开恢复；持续选项根据实际保存状态保持蓝色。原 red/yellow/green/blue 操作按钮类名保留，但统一玻璃，不再以大红/黄/绿区分。球队颜色与转播内容不改。
- 新增共享 `control/glass-theme.css`，由 panel、d200、preview 直接加载；token 从 panel-layout.css 移至该文件。所有框与按钮继承同一材质，薄白边、高光、底部蓝灰反光和背景模糊。D200 选中按钮的两行文字白色。预览 iframe 内的编辑工具栏也改圆角玻璃和蓝色按下反馈，CSS 仅限 #editbar，不改观众端图形。
- 原生 checkbox 改为 46×28 的开关，26×22 透明滑块；原生 range 使用 38×28 透明胶囊、蓝色进度和灰色轨道。microkit-controls.js 同步 --range-fill，按滑块中心校正两端偏移，保留原生拖动/键盘与保存逻辑。导航沿用本地 Motion 粘连轮廓；无新增库或运行服务。
- 减少透明度、高对比、缺少背景模糊支持时使用实底；减少动态效果时直接切换。普通操作取消按下不会写状态，不增加虚假的持续选中效果。日志与上传按钮补齐同色按下反馈。
- 隔离数据检查覆盖：五个分组桌面/手机材质与对齐、原生菜单/名单联动、开关 Space 键、滑杆 Home/End/方向键与实际左键拖动、取消按钮按下、D200/预览玻璃按钮。静态资源由 Node/PowerShell 提供，实际截图见 control-d200-glass.png、control-preview-glass.png、control-glass-slider.png、control-glass-switch.png。真实比赛数据与原文件夹保留。

### 2026-10-11 透明按钮/卡片与用户指定壁纸（最新状态配色）

- 用户进一步明确启用按钮应为白底蓝字，替代前一节蓝底白字。glass-theme.css 的 selected-fill 为 94% 白色，selected-ink 使用蓝色 #0068c5，hover 保持白色；普通按钮填色 6%、hover 18%，卡片 10%，字段 8%。控制台、D200、预览和编辑按钮按下反馈同步更新，保持原状态确认与交互逻辑。
- D:\Download\478422.jpg 原样复制到 control/assets/console-background.jpg（约 1.7 MB），哈希核对一致；本地静态 URL 由已有 Node / PowerShell 服务直接提供。壁纸 cover/fixed，叠加 40% 白色薄层平衡暗部可读性，文字调整为 #172431 / #253343。各玻璃卡片内部可见背景曲线，没有将图片写入状态或影响 vMix 观众端透明背景。
- 系统降低透明度、增加对比度或缺少背景模糊时恢复中性实底背景与卡片，选中项仍为白底蓝字。五分组布局、44px 高度、液态导航、鼠标/键盘滑杆、开关、下拉名单联动检查通过，壁纸在浏览器实测加载并在两种服务下返回 200。桌面/手机及各玻璃截图已更新。

### 2026-10-11 顶部导航透明滑块

顶部导航 .tab-indicator 改用透明 button-fill 与 glass-tint，不再继承普通启用按钮的 94% 白色 selected-fill。保留蓝色选中文字、玻璃边缘、背景模糊、可打断粘连动效与无障碍实底回退。普通启用按钮仍为白底蓝字。

### 2026-10-13 灵活名单、Excel 导入与已保存素材

- `control/roster-format.js` 统一控制台、观众端、Node 的号码姓名识别，PowerShell 的 `match-roster.ps1` 保持同等规则与 UTF-8 BOM。支持空格、连接符、加号、“号”、无分隔、全角号码及队长标记；球员身份保持 side|规范号码|净姓名，不因改变输入分隔符而换身份。
- 四份名单均支持 TXT/CSV/TSV 与 Excel xlsx/xls/xlsm。`panel-links.js` 在浏览器本地解析，号码姓名两列可按表头调整顺序，也可用单列完整球员文字。多工作表可在各卡片选择，首个有球员的表默认选中；零识别的表禁用。导入只改草稿并重建选人框，保存仍使用原按钮；读取失败不覆盖原名单，不将多张表或两队自动混合。
- 本地包含 [SheetJS CE 0.20.3 官方完整浏览器构建](https://docs.sheetjs.com/docs/getting-started/installation/standalone/)：`control/vendor/xlsx.full.min.js`，来自 `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`；Apache-2.0 许可保留于 `docs/SHEETJS_LICENSE.txt`（同版本官方 package/LICENSE）。完整构建用于兼容旧 xls；运行时不访问 CDN、不添加 Node 包或开发服务。
- `panel-assets.js` 为主客队徽、角标、背景图、字体增加已保存信息，新增 `homeLogo_filename/awayLogo_filename/logo_data_filename/theme_bg_filename/font_data_filename`。只在服务器确认后显示新文件名，失败恢复旧信息；清除资源时同步清除名称。旧数据无文件名时显示已保存和图片预览，不改盘、不编造旧文件名。不设置原生 file input 的本地路径。
- 上传框仍为 44px，预览在行下方，清除按钮对齐；背景图保存在素材状态中，应用主题时不再因空文本框而误清除它。字体/图片保持原 base64 存储，本次不迁移真实资源或场内名单。
- 新增 `tests/imports.js`，用临时状态、临时服务与本机 Edge 检查各分隔符、全角号码、列顺序、xlsx/xls/xlsm 工作表、坏文件保护、手动号码匹配、队长标记、换人及素材保存/失败/清除/刷新/重启，Node/PowerShell 均通过。测试启动探测完整读取状态响应，避免大字体数据的未读响应堵住同步 HttpListener；原有 `tests/links.js` 的未选颜色检查移开鼠标后再比较，避免将 hover 状态混入静止状态，保留真实 hover 检查。上传信息/工作表选择截图见 `docs/screenshots/control-saved-assets.png` 和 `control-excel-import.png`。

### 2026-10-13 导航滑块圆角外的方形底色

- 原液态滑块全宽宿主同时绘制背景/渐变、内阴影与背景模糊，在实际 Chromium 渲染中圆角轮廓外露出浅色方框。`panel-layout.css` 将流体宿主改为完全透明，`liquid-nav.js` 直接在同一 SVG path 上绘制低透明度渐变和边缘高光，父导航保留玻璃模糊。液态轮廓、Motion 弹簧、选中文字及操作逻辑不变；静态后备滑块仍为胶囊。
- 减少透明度/高对比时，对 SVG 轮廓改用白色实底和深边缘，宿主保持透明。`tests/glass.js` 已通过；临时浏览器检查全部五个导航在 1440/390/320 宽度下宿主无背景、阴影或额外模糊，并确认无状态写盘。实际截图：`docs/screenshots/control-nav-corners-1440.png`、`control-nav-corners-390.png`、`control-nav-corners-320.png`。

### 2026-10-13 比分条队徽开关与预览排版工具

- 比赛控制新增 `sb_logos_show` 开关，缺省 true、立即保存并在失败时回退。观众端和单独比分入口共用 `fitScoreboardWidth()`：有队徽最小 650px，无队徽最小 306px（三个 102px 单元）。按当前字体/字距测量队名，两队取大值等宽；短名恢复基准，长名撑宽；多位数比分扩展中央单元，时钟/阶段同宽。总宽限制 1824px，极长文字沿用缩小字号。字体加载后重测；没有迁移或删除已上传队徽，不影响角标与名单队徽。
- 新增 `titles/editor-tools.js/.css` 与 `control/preview-tools.js/.css`。预览页右侧 310px 玻璃布局栏提供 X/Y 中心坐标、缩放、六向对齐、对齐参考、安全框、比例、网格步长、吸附、九项临时显示、仅显示当前项/恢复全部。控件不随画布缩小；窄屏可收起。独立入口也传 edit=1；直接打开 graphics?edit=1 仍保留旧底栏，嵌入预览时隐藏旧底栏。
- 用户明确：比例只调整预览构图范围和安全框，上屏画布由 vMix 决定。实际 HTML 仍 1920×1080；16:9/4:3/1:1/9:16/21:9/自定义比例在画布内居中内接。安全框为 95% 与 90%。网格默认移动期间显示，始终显示与吸附默认关闭；间距 5–200px，吸附原点为构图范围左上角。坐标输入和对齐不强制吸附。
- 比例、辅助线、网格、临时隐藏保存在同源浏览器 `fbp_editor_preferences_v1`，不写 state.json。观众端不会创建指南节点或临时隐藏类。坐标/缩放仍用原 saveEdit；完整名单写 lineup_all_pos/scale，单独模式写 lineup_pos/scale，保持 DRAG/PENDING 保护和失败回退。已修复 PowerShell {y,x} 顺序导致旧 JSON.stringify 比较无法确认保存的问题，改为字段值比较。
- 同源 iframe 桥接仅接受 origin/source 都匹配的消息，立即回填控件并读取新鲜快照；embed 只初始化一次，避免消息循环。临时隐藏恢复使用显式布尔 classList.toggle，隐藏文字不参与缩小字号，恢复后重新适配。所有资源随现有服务静态提供，无需 MicroKit dev。
- `tests/layout-tools.js` 已实测 Node 与 PowerShell 的队徽开关、刷新/重启、长短队名、多位数比分、预览比例、安全线、临时隐藏只读、坐标、六向对齐、缩放、真实缩小 iframe 指针拖动与吸附、名单两套布局、失败回退和手机侧栏。`tests/browser.js` 继续验证双端计时、事件去重、编辑器与 D200；截图包含 `broadcast-compact-scorebar.png`、`broadcast-adaptive-scorebar.png`、`broadcast-logo-scorebar.png`、`preview-layout-tools.png` 和 `preview-layer-visibility.png`。测试用临时状态，真实 state.json 与原文件夹保持完整。
- `tests/panel-layout.js` 的降低透明度检查同步到当前液态导航：检查白色实底 SVG 轮廓与透明宿主，静态后备仍检查白色胶囊。不能再要求全宽宿主填白，否则会重新引入用户指出的圆角外浅色方框。

### 2026-10-13 队名修改未上屏

- 原因：`panel-links.js` 的 input 监听只联动表单草稿，teamHome/teamAway 仅在「应用比分」等操作中写入服务器；比分条读取已保存状态，因此面板输入与上屏可显示两个名字。
- 队名改为 change（编辑完成并失焦）或 Enter 自动保存，比分卡和四个名单卡共用 `bindTeamName()` / `saveTeamName()`。打字仍先联动草稿，中文组字中的 Enter 不提交。空白名称保留原上屏，失败保留输入并显示真实失败，可 Enter 重试；同值的 Enter/失焦合并，快速改不同名称按队列顺序保存。
- 自动 patch 只有本队名称、首发/替补队名以及属于该队的已保存事件 *_team 字段。当前事件表单可能选了另一个未保存 side，不能据此重写已保存事件名称；D200 也可能改变实际 goal_side，因此在写入队列中只读获取最新 state.json，再建立名称 patch。`sendState()` 支持同步/异步 patch 工厂，普通对象仍在调用时序列化，避免后续草稿改变请求内容；准备失败与 POST 失败共用原错误提示和队列恢复。
- 不写比分/颜色/球员/名单文本/可见性/计时/事件 tick，不重播图形；完整名单、比分条由原状态轮询更新。后端没有改动，Ctrl+F5 刷新控制面板即可加载新行为；改名后上屏沿用原轮询，无需额外服务。
- `tests/team-names.js` 在 Node/PowerShell 和真实 Edge 下验证中文输入、原生失焦与 Enter、关联名称、保持其它草稿、快速连续改名、Enter+失焦去重、空白拒绝、失败/重试、名单卡改名、D200 客队进球后再改两队名称、刷新与重启。`tests/links.js` 和 `tests/browser.js` 验证比分、选人、换人、计时、事件去重与 D200 无回退。使用临时状态和端口，保留用户真实数据与原文件夹。
- 联动回归测试切换换人预览前，等待初始 iframe 编辑器完成加载，不仅等待 TEMPLATES 全局变量；否则服务探测的异步 select(0) 可能覆盖测试提前发出的选择，造成启动过程的假失败。

### 2026-10-13 视频参考的上下／左右 Wipe

- 使用安装的 animate skill，按用户视频第 2 秒的「中间细线展开」实现，不改图形配色。计时器、名单全部／单独模式用 `wipe-vertical`，换人、进球、红黄牌、发球、球员条和独立 Logo 用 `wipe-horizontal`；比分条原样保留。
- 共享 CSS 的遮罩变量同时供初次显示的 transition 和重复触发的 WAAPI 使用。非比分栏目不做整体渐淡或文字缩放，只裁切展开，退场反向收回。保留原 `wipe_in/wipe_out`、时长倍率、缓动、停留与 tick 逻辑，轮询和时钟数字更新不重放。
- 新 `setGraphicVisible()` 处理常驻栏目显隐和中途重开；`hideGraphic()` 从运行中重播的当前遮罩退场，避免取消 WAAPI 后跳回全开。事件重叠仍立即隐藏，编辑模式静止完整显示，减少动态效果立即切换。
- `tests/wipe-directions.js` 以临时端口、临时状态、真实 Edge 检查 Node/PowerShell 的八种非比分栏目方向、退出、重播、中途隐藏／重开、事件碰撞与停留、名单轮询及两种模式、比分条保留、编辑器与减少动态效果。`tests/video-reference.js` 用浏览器解码本地参考视频，读取路径通过命令行传入，没有将视频或用户临时路径加进运行资源。动效无需额外开发服务。

### Apple 非线性动效补充

- 用户认为生硬，要求参考两篇 iOS 动画文章；CSDN 可读、知乎返回 403。对照 Apple WWDC23 官方的无回弹弹簧说明与安装的 apple-design skill，默认 smooth 换为临界阻尼节奏，起步加速与渐近收稳，保持播出图形平直，不添加夸张回弹。
- 新 `titles/motion-curves.js` 以解析响应采样原生 `linear(...)` 曲线。此为分段近似的非线性函数，不是匀速；旧 vMix 引擎不支持时，自动使用 animate skill 的非线性 cubic-bezier 回退。`--wipe-ease-in/out` 供首次显示和 WAAPI 共用，比分条 `--ease` 原曲线不变。用户当前的 smooth 值无需迁移，只更新控制页标签。
- `replayWipe()` 从当前遮罩平滑收拢再展开，消除瞬间重置到中线；返回总秒数，`showFor()` 据此计完整入场后的停留。已选入退场秒数与 animdur 不变，没有写入真实 state.json。现有 0.5× 会将 .45 秒变为 .225 秒，需更舒展可由用户改为 1.0×。
- 动画测试追加实际时间轴采样，验证非线性起步、加速、单调无越界、长尾减速、重播收拢再展开；旧引擎回退用隔离上下文检查。`tests/features.js` 的重复进球停留检查包含新增收拢阶段。
