# 足球包装模板开发规范

适用版本为转播包装工作台 2.0.0 Beta 5。模板覆盖足球模块的比分条、独立计时器、发球、红黄牌、球员字幕、进球、换人、赛事标志、单队名单与双方名单。BITFA 样例在 1920 × 1080 透明画布上以 420 × 120 像素的左上角比分条播出。足球模块以该比分条和各事件图层呈现比赛信息。

## 常见直播包装方案

| 方案 | 模板交付 | 控制端怎样读写动态数据 |
| --- | --- | --- |
| vMix GT Designer | `.gtzip` 标题模板，设计时为文本、图片、颜色等可编辑对象命名。标题预设也可通过 CSV 导入和导出。 | Web API 用输入名或 GUID 定位标题，用 `SetText` 修改 `HomeScore.Text` 一类具名字段，用 `SetImage` 更新 `.Source`。标题内置计时器支持正计和倒计，可以由 `SetCountdown` 等快捷命令控制。直接请求 API 可读取 vMix 的 XML 状态。Data Sources 可把 Excel、CSV 或 XML 等数据绑定到字段。 [标题编辑器](https://www.vmix.com/help29/Title.html) · [HTTP API](https://www.vmix.com/help29/DeveloperAPI.html) · [数据源](https://www.vmix.com/help29/DataSources.html) |
| CasparCG | HTML、CSS、JavaScript 及素材，作为服务器模板目录中的 HTML 图形。 | 控制端通过 AMCP 用通道和图层选中实例，`CG ADD` 装载，`CG PLAY` 上屏，`CG UPDATE` 把数据送入模板的 `update(templatedata)`。模板决定如何渲染分值和时钟，服务器负责图层和播放生命周期。 [HTML 模板](https://casparcg.com/docs/wiki/media/html-templates) · [AMCP](https://casparcg.com/docs/wiki/protocols/amcp-protocol#cg-update) |
| Singular.live | 平台里的 Composition 和子合成，使用具名 Control Node 暴露可编辑文本、图像、颜色等。 | 控制端读取子合成的标识和字段结构，再通过 REST API 以 JSON `payload` 更新数据。一次调用可以同时修改字段和指定入场或退场状态。 [Control Node](https://support.singular.live/hc/en-us/articles/360001029111-Control-Node) · [REST 更新与动画](https://developer.singular.live/rest-api/how-to-guides/update-a-sub-compositions-content-and-animation-state-in-one-call) |
| OBS Browser Source | 本地 HTML 文件或 URL，资源由网页加载。 | OBS 提供渲染画布和透明背景。比分、时钟等字段由网页自己的数据接口读取，状态由提供网页的服务管理。 [OBS Browser Source](https://obsproject.com/kb/browser-source) |

选型采用具名字段与图层、单一比赛状态、本地网页输出。它沿用现有的 vMix 网页输入、控制台、D200 和预监流程。新增样式时，设计者可修改一个 JSON 文件，并在控制台导入验证。若后续确实需要第三方自定义结构或动画，可以在保留同一数据协议的前提下增加独立的 HTML 渲染器。GT 原生适配也可沿用这套数据协议，并另行映射到 GT 的具名字段。

## 文件格式

交付一个 UTF-8 的 `*.vmix-football.json` 文件，在「足球赛事 → 设置 → 画面设置 → 导入足球包装模板」加载。文件上限 2 MiB。导入会保存模板并应用到足球图形。重新导入同一 `id` 会更新这个模板。改版并行使用时分配新 `id`。旧的 Beta 4 比分条模板同样可以导入，其余图层沿用经典足球包装。

| 字段 | 含义 |
| --- | --- |
| `format`、`version` | 分别为 `vibe-vmix-football` 和 `1` |
| `id`、`name` | 标识符由小写字母开头，后接小写字母、数字或连字符，最多 48 字符。显示名最多 64 字符 |
| `style` | 全局字体与视觉属性。可用 `font`、`radius`、`surface`、`secondary`、`ink`、`muted`、`line`、`heading`、`headingInk`、`accent` |
| `layers` | 按图层标识配置 `style`、中心点 `position: {x,y}` 和 `scale`。单层样式覆盖全局对应属性。坐标范围为画布，缩放范围 0.3 至 3，圆角为 0 至 32 像素 |
| `labels` | 固定赛事文案。可用 `goal`、`substitution`、`subOff`、`subOn`、`player`、`redCard`、`yellowCard`、`kickoff`、`throwin`、`corner`、`goalkick`、`freekick`、`penalty`、`clockUp`、`clockDown`、`clockTitle`、`clockCaption`、`lineup`、`starters`、`substitutes`。每个值最多 40 字符。操作员填写的球员名、计时器标题等按实际比赛数据呈现 |
| `scoreboard` | 可选双排比分条。提供 `layout: "two-row"`、`position`、`dimensions`、`theme` 和 `images.left/right`。省略时使用默认比分条结构，仍应用全局样式 |
| `logo` | 可选赛事标志。标志图层开启时使用该素材，操作台上传的赛事标志优先 |
| `fixtures` | 可选场次列表，每项有 `title`、`home`、`away`、`homeColor`、`awayColor`。操作员点击「套用队名和队色」后应用，场次名称用于选择 |

颜色使用六位十六进制 RGB。字体名可用字母、数字、空格和连字符，字体由播出电脑安装，缺失时回退到微软雅黑或系统无衬线字体。图片使用 `data:image/png;base64,…`。v1 的资源入口只接受这种内嵌图片。文案按纯文本处理，图层与样式按已列字段读取。

图层标识对应 `sb` 比分条、`clk` 独立计时、`rst` 发球、`card` 红黄牌、`ply` 球员字幕、`goal` 进球、`sub` 换人、`logo` 赛事标志、`lineup` 单队名单、`lineup_all` 双方名单。双报名单继承名单样式，再应用 `lineup_all.style`。双排比分条的 `layers.sb.position` 可以覆盖 `scoreboard.position`。预监保存的位置和缩放优先于模板默认值。

双排比分条的 `dimensions` 字段为 `brandWidth` 100–600、`teamWidth` 200–800、`scoreWidth` 65–350、`rowHeight` 60–270、`gutter` 0–40，单位均为 1920 × 1080 画布像素。`theme` 包含 `brand`、`clock`、`clockInk` 和可选字体 `font`。

以下为可直接导入的最小样式示例。

```json
{
  "format": "vibe-vmix-football",
  "version": 1,
  "id": "campus-green",
  "name": "校园足球绿",
  "style": {
    "font": "Microsoft YaHei",
    "surface": "#F6FAF9",
    "ink": "#102F2C",
    "heading": "#215C56",
    "headingInk": "#FFFFFF",
    "radius": 4
  },
  "labels": { "goal": "进球", "substitution": "换人" },
  "layers": { "goal": { "style": { "heading": "#16685B" } } }
}
```

## 实时接口与状态归属

工作台启动时分配模块地址。读取工作台的 `GET /api/workspace`，取 `id: "football"` 且已启用项的 `url`。后面的 API 都使用这个足球模块地址。

| 操作 | 接口与数据 |
| --- | --- |
| 读即时比分、计时和图层开关 | `GET /api/v1/status`。响应有 `status.score.home/away`、`status.sb_clock.milliseconds/running/mode`、`status.visible` |
| 读完整播出数据 | `GET /api/v1/state`。读取 `scoreHome`、`scoreAway`、`teamHome`、`teamAway`、`period`、`sb_clock_state` 与事件字段。可带 `If-None-Match`，服务端用 `304` 表示状态未变 |
| 读按钮与控制命令 | `GET /api/v1/commands` |
| 主队比分加一 | `POST /api/v1/commands/home_score_plus`。主队进球并播事件用 `POST /api/v1/commands/home_goal` |
| 比赛计时 | `POST /api/v1/commands/sb_clock_start`、`sb_clock_pause`、`sb_clock_reset`。定点设时用 `POST /api/v1/state`，例如 `{"sb_clockcmd":"set","sb_clockmode":"up","sb_clockacc":2700000}` |
| 批量设置比分和队名 | `POST /api/v1/state`，例如 `{"scoreHome":2,"scoreAway":1,"teamHome":"精工二队","teamAway":"明德一队"}` |
| 导入或切换模板 | `POST /api/v1/state`，传 `{"football_template_import": 模板对象}`。已安装模板用 `{"sb_layout":"campus-green"}` 选择，`classic` 为经典包装 |

计时服务在开始、暂停和校时时维护 `sb_clock_state` 的 `mode`、`running`、`accMs`、`base`。播出页依据时间锚点在本地连续走时，控制台和 vMix 读取同一份状态。加分和进球事件由一次服务端操作提交。事件图层用递增的 `goal_tick`、`card_tick` 等识别新动作，页面接入时把首次收到的事件序号当作基线。遇到写操作超时，先查即时比分再决定是否重发加分命令。

vMix 上屏使用工作台提供的网页地址，画布设为 1920 × 1080。预监里的位置调整通过「应用到播出」提交。开发时应覆盖长队名、两位数比分、双色深浅背景、计时暂停及恢复、刷新后的事件基线、模板切换后各自保存的位置，以及预览窗与主窗口之间的独立切换。

## Photoshop 与 After Effects 动效样品

Beta 5 的两个样品共用 `vibe-vmix-graphics` 第 2 版，交付一个 UTF-8 的 `*.vmix-graphics.json`，文件上限 4 MiB。足球样品的 `module` 和 `slot` 分别为 `football`、`scoreboard`，使用足球包装的导入入口。舞台样品对应 `stage`、`program`，在「舞台节目 → 包装属性 → 字幕模板」导入。原有足球全局样式模板继续使用第 1 版。

- `scene` 定义组件尺寸和 1920 × 1080 画布上的中心坐标。足球导入后使用这个默认中心，舞台沿用工作台的报幕条位置。元素的位置以组件左上角为原点。
- `elements` 按绘制顺序列出矩形、内嵌 PNG、内嵌 WebM 和文字。足球比分条可绑定 `team.home`、`team.away`、`score.home`、`score.away`、`clock.match`。舞台报幕条可绑定 `program.type`、`program.title`、`program.performer`、`program.subtitle`、`event.name`。
- `motion.enter` 和 `motion.exit` 分别声明毫秒时长 `duration` 及关键帧 `frames`。每帧声明归一化进度 `t`、像素位移 `x` 和 `y`、透明度 `opacity`，可选 `sx`、`sy` 和 `rotation`。每段覆盖 0 到 1。直播数据变化会更新文字，入场和退场由图层的播出开关触发。
- Photoshop 用具名文字层标记实时字段，导出透明底图。After Effects 的 `VMIX MOTION` 层定义整体入退场，底图和实时文字在播出页一起移动。两个样品用源工程底图和关键帧制成，导入后的播出由工作台读取比赛或节目状态驱动。

## 从设计工程导出

打开 PS 文档或 AE 合成，从「窗口 → 扩展（旧版）→ 转播包装模板制作」打开面板。可插入普通文字、比分条实时字段、队伍色卡和 Logo 位置。用 Adobe 的原生工具排版，点击「导出模板」，在工作台导入文件。动态 Logo 元素使用 `type: "image"` 和 `bind`，足球支持 `team.homeLogo`、`team.awayLogo`、`event.logo`，舞台支持 `event.logo`。

足球可以把原第 1 版全局模板的 `style`、`labels`、`layers`、`logo` 放入第 2 版文件的 `presentation`。脚本的「合并足球全局包装」会完成这一步。第 2 版的比分条动效与全局包装会一同生效。
