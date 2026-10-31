# vMix 网页图形模板「制作方法」预设（体育赛事 & 舞台演出）

当前代码采用共享核心与模块化架构。新增赛事/节目先阅读 [架构设计](ARCHITECTURE.md) 和 [API v1](API.md)，复用核心与客户端；下文保留模板制作与历史兼容经验。

> 这是一份**可复用的方法预设**：如何用「纯 HTML/CSS/JS + 本地服务器 + state.json 驱动」的
> 方式，为 vMix 制作**网页浏览器输入**图形包装，覆盖 **体育赛事** 与 **舞台演出** 两类场景。
> 已含本仓库实际踩过的 **Bug 修复清单**（务必遵守），以及让所有包装组件的**皮肤/颜色/背景/字体**可定制的主题体系。

---

## 一、核心理念与架构（最先要懂）

- **vMix 不支持 HTML 标题（XAML/GT）**。HTML 必须用 **vMix【网页浏览器输入】** 加载，渲染引擎是 Chromium。
- **一个链接搞定全部动画**：把所有图形放进**一个** `titles/graphics.html`，由 `state.json` 驱动；
  每个动画独立「入场 → 停留 → 退场」，无需在 vMix 里切换多个输入。
- 本地服务器（Node.js `serve.js` / PowerShell `serve.ps1`）：
  - `GET  /state.json`  返回状态（带 **ETag/304**，数据未变只回 304，避免每 200ms 重复下载大体积状态如图片）
  - `POST /state.json`  合并/写入状态（面板用），全程 CORS。
- 驱动原理：控制面板 → `POST state.json` → 各模板每 `poll` 毫秒 `GET state.json` → 更新画面（**不整屏刷新**）。

```
控制面板 panel.html ──POST──▶ state.json ◀──GET(轮询)── 单链接 titles/graphics.html
        (改比分/发动画/换皮肤)          │                (vMix 网页浏览器输入加载)
                                       └─ 服务器 http://localhost:8123
```

---

## 二、通用制作流程

1. **启动服务器**：`控制\启动控制面板.bat`（优先 Node.js；Node 不在则回退 PowerShell）。
2. **拿到单链接**：面板【联合上屏 · 单链接】复制 `http://localhost:8123/titles/graphics.html`。
3. **vMix 加输入**：`添加输入 → 网页浏览器 → 地址` 粘贴单链接，尺寸设 **1920×1080**，叠层/切到 PGM。
4. **控制**：面板改字段→【写入】，或点动画按钮→画面即时变化（动画自动入场→退场）。
5. **摆位/缩放**：面板【联合上屏】→「打开 位置/大小 编辑器」→ 拖拽移动、拖右下圆点或滑杆缩放，松手自动保存。
6. **换肤**：面板【皮肤 · 风格】改 皮肤/颜色/背景/字体 →【应用主题】。

> ⚠️ 面板/预览页必须用 `http://localhost:8123/...` 访问，**不要**直接双击 HTML（`file://` 会导致“未启动/文件不存在”）。

---

## 三、体育赛事模板清单（本仓库已实现，均在单链接内）

| 组件 | 说明 | 相关状态键 |
|---|---|---|
| 比分条 | 主客队名/比分/比赛时钟/阶段/状态徽标/进球队徽 | `teamHome,teamAway,scoreHome,scoreAway,period,status,colorHome,colorAway,homeLogo,awayLogo,scoreboard_show,sb_clockcmd,sb_clock_tick` |
| 计时器 | **正计时/倒计时 同一面板**，自动显示，倒计归零报警 | `clock_*, clock_cmd(set/start/pause/reset/plus/minus), clock_show, clock_tick` |
| 红黄牌 | 牌面 + 球员姓名/球队/原因，**居中**，自动退场 | `card_type,num,name,team,reason,card_trigger,card_tick` |
| 发球 | 开球/界外球/角球/球门球/任意球/点球 图标+文字 | `restart_type,team,player,text,color,restart_tick` |
| 球员条 | 球员号码/姓名/球队/位置/事件，左下 | `player_*, player_tick` |
| 进球 | 大字 GOAL + 球员 + 比分 + 光芒 | `goal_*, goal_tick, score_tick`（进球自动同步比分并闪光） |
| 名单 | **同一面板的四种状态**：主队首发/客队首发/主队替补/客队替补 | `lineup_active(xiH/xiA/subH/subA), lineup_show, xiH_*,xiA_*,subH_*,subA_*` |
| Logo/队徽 | 主队徽、客队徽（放比分条）、角标（独立、可拖拽） | `homeLogo,awayLogo,logo_data,logo_show,logo_pos` |

### 体育比赛的常用触发（都带 `*_tick` 计数去重，可反复触发）
- 进球：`goal_trigger=goal` + `goal_tick`（并 `score_tick` 让比分条闪光）。
- 红/黄牌：`card_trigger=red|yellow` + `card_tick`。
- 各发球：`restart_trigger=kickoff|throwin|corner|goalkick|freekick|penalty` + `restart_tick`。
- 球员条/名单：`player_trigger/show` + `player_tick`；名单用 `lineup_active` + `lineup_show`。

---

## 四、舞台演出模板清单（方法通用，按此扩展）

舞台/演出常用「整屏或半屏」图形，多在**自有背景**上，而非叠加视频。可复用到同一架构：

| 组件 | 说明 | 建议状态键 |
|---|---|---|
| 演出标题/节目单幕 | 整屏节目标题（演出名/主办/时间） | `show_title,show_sub,show_bg,title_show,title_tick` |
| 栏目标/栏目条 | 当前节目/模块角标，常驻或按节目切换 | `segment_name,segment_num,segment_show` |
| 人名条（嘉宾/表演者） | 姓名/职务/单位，左右下角 | `person_name,person_role,person_unit,person_color,person_tick` |
| 致辞/口号字幕 | 大字致辞/口号，可停留较久 | `quote_text,quote_by,quote_show,quote_tick` |
| 节目倒计时 | 备用倒计时/中场休息（复用计时器组件） | `clock_*` |
| 赞助商角标 | 右上角 Logo（复用 Logo 组件） | `logo_data,logo_show,logo_pos` |
| 节目切换过渡字 | 章节切换提示 | `chapter_text,chapter_tick` |

> 舞台与体育的不同点：舞台多为**全幅+自带背景**（此时用主题「背景」填色/图），体育多为**透明叠加**（背景留空=透明）。

---

## 五、主题 / 皮肤体系（颜色、皮肤、背景、字体 可定制）

> 所有组件用 **CSS 变量** + 一套 `theme_*` 状态键，改主题不改结构。

**状态键（控制面板【皮肤 · 风格】编辑）**
| 键 | 作用 | 默认 |
|---|---|---|
| `theme_skin` | 面板皮肤：`dark`/`glass`（通透）/`deep`/`cyan`/`night` | `dark` |
| `theme_accent` | 全局强调色（计时/进球金色高亮）HEX | `#FFD400` |
| `theme_bg` | 整屏图形背景（颜色/CSS 值）；**留空=透明**（叠加视频） | `""` |
| `theme_font` | 全局字体栈（作用于所有图形文字） | `Bahnschrift, Segoe UI, Microsoft YaHei, sans-serif` |

**graphics.html 如何应用**：`applyTheme()` 读取 `theme_*` →
- `--gold`/`--clockAcc` ← `theme_accent`
- `--panel` ← `PANEL_SKINS[theme_skin]`（面板底色/通透度）
- `document.body.style.fontFamily` ← `theme_font`
- `document.body.style.background` ← `theme_bg` 或 `transparent`

**新增皮肤**：在 `graphics.html` 的 `PANEL_SKINS` 加一项即可（建议保持白字可读的深色系；如需浅色皮肤，需同时把文字色切黑，见「Bug 清单」第 6 条）。

**扩展自定义**：给某个元素单独换色，直接改其 CSS 变量（如 `--home`/`--away`/`--cardC` 等），它们已按用途独立，不会互相覆盖。

### 五.1 自定义效果（动画 / 图片 / 字体）

控制面板【自定义效果 Customize】卡可写以下状态键，使用者无需改代码即可调整动画、图片、字体：

| 键 | 作用 | 默认 |
|---|---|---|
| `motion` | 非比分栏目缓动：`smooth`(Apple 平滑、无回弹)/`lively`(利落)/`soft`(柔和)/`linear`(匀速)；比分条保留该档位的原曲线 | `smooth` |
| `animdur` | 容器出现/消失的速度倍率（0.4–2.5），作用于 `.pos` 过渡 | `1` |
| `hold_goal` | 进球动画停留秒数（自动退场） | `5.6` |
| `hold_card` | 红黄牌停留秒数 | `5` |
| `hold_rst` | 发球停留秒数 | `4.5` |
| `hold_ply` | 球员条停留秒数 | `4.5` |
| `theme_bg` | 整屏图形背景（颜色/渐变/图片 data-URI）；留空=透明（叠加视频） | `""` |
| `font_data` | 自定义字体 data-URI（.ttf/.otf/woff2），graphics 注入 `@font-face` | `""` |
| `font_family` | 该字体的字族名（`font_data` 存在时用到） | `""` |

- 停留时长：`showFor(id,defMs)` 读 `field('hold_'+id,0)`，`>0` 用 `hold_*` 秒，否则用默认。
- 自定义字体：`injectFont()` 检测 `font_data`，动态注入 `<style>@font-face{...}</style>` 并把 `body` 字体切换为 `font_family`。
- 动画缓动：`applyTheme()` 保留比分条的 `--ease`，非比分栏目使用 `--wipe-ease-in/out`；默认 smooth 由 `motion-curves.js` 的无回弹弹簧曲线提供。`--wipe-in/out` 为 `wipe_in/out` 秒数乘 `animdur`，CSS 与重复播放 WAAPI 共用，不引入独立的计时参数。
- 注意：名单为常驻面板（`lineup_show` 控制），**不在上述自动退场之列**（故无 `hold_lineup`）。

---

## 六、⚠️ Bug 修复清单（本项目已修复，请务必遵守）

> 这些是我们在实际制作中踩过并修复的坑。**做新模板/复制改造时按此检查，避免复现。**

1. **批处理 `启动控制面板.bat` 必须 CRLF 换行**：LF 会让 `cmd.exe` 解析错乱，导致服务器起不来。且消息尽量用 ASCII，避免编码问题。
2. **根路径 `/` 要 302 到 `/control/panel.html`**：原先 404。
3. **倒计时方向**：计时底层要区分模式——倒计时 = `accMs - elapsed`（clamp 0），正计时 = `accMs + elapsed`。否则倒计时也在“正向”走。
4. **同一动画可重复触发**：模板去重不要按“触发值”，要按 `*_tick` 计数键变化（值相同也能再播，进多球/多次判罚）。
5. **动画与常驻层重叠自动打断**：只对**瞬时动画**（进球/牌/发球/球员）做重叠打断；**常驻层**（比分条/计时器/名单/Logo）不要被自动隐藏。
6. **名单文字闪烁消失**：不要在每次轮询都重建 `innerHTML`。只有「从隐藏→显示」或「内容/颜色有变」才重建并重放入场；否则保留已显示的行。否则文字“闪一秒就没了”。
7. **名单更新后文字不显示**：新行初始 `opacity:0`，必须重放入场动画（`forwards` 到 `opacity:1`）。
8. **红/黄牌文字与牌面不居中**：包装容器的 `.cd` 要 `display:flex;flex-direction:column;align-items:center`，否则 230px 牌面与 520px 姓名条错位。
9. **比分条上方状态徽标被盖住一半**：徽标是绝对定位，同层的 `/比分条` 是 `position:relative` 且 DOM 在后，绘制顺序把它盖住。给容器加 `position:relative`，徽标加 `z-index`（高于比分条）。
10. **缩放被轮询重置**：拖拽/缩放期间要设置 `DRAG[id]=true`，`applyPos` 才不覆盖 transform。
11. **元素大小要“无极、可靠”**：缩放手柄要**反向缩放**保持稳定；并给编辑器加**滑杆**（0.3–3.0，步长 0.01）。手柄也应恒定大小易抓取。
12. **大体积 state.json（图片 base64）拖慢轮询**：`/state.json` 要支持 **ETag/304** 条件响应，客户端轮询用 `cache:'no-cache'`；否则几 MB 状态每 200ms 全量下载。
13. **禁用 `cache:'no-store'` 于轮询 GET**：否则浏览器不会带 `If-None-Match`，ETag/304 不生效。
14. **`$PSScriptRoot` 可能为空**：PowerShell 服务器要用 `$MyInvocation.MyCommand.Path` 兜底；监听失败（占用/权限）要给出清晰提示。
15. **升级前旧数据兼容**：数据结构变更时要做**向后兼容迁移**（如名单从单一 `lineup_*` 迁移到 `lineup_active` + 四状态），别让旧数据显示不出来。
16. **触发计数要显式映射**：`trigger('sb_clockcmd',…)` 的 tick 键要一对一（如 `sb_clockcmd→sb_clock_tick`），不能靠后缀猜测（`cmd` 与 `_cmd` 不同）。
17. **名单解析必须一致**：控制台、观众端和 Node 共用 `control/roster-format.js`，PowerShell 使用同等规则。接受空格、连接符、加号、“号”、全角号码，保留队长显示标记，球员身份仍用 side|规范号码|净姓名；不能让选人、换人和上屏各识别出不同的人。导入 Excel/TXT 只修改草稿，坏文件或零识别结果不得覆盖原名单。
18. **刷新后已上传素材不能看起来丢失**：文件选择器不能恢复本地路径；另外显示服务器确认过的文件名和图片预览。`homeLogo/awayLogo/logo_data/theme_bg/font_data` 配套保存 `*_filename`，失败时恢复旧信息，清除时一起清除。旧文件无元数据时显示“已保存”，不编造原文件名。不应因背景文本框为空而在应用主题时清掉已上传背景。
19. **比赛配置只读白名单字段**：TXT 用带 format/version 的 JSON，队徽内嵌，完整校验后通过 WRITE_QUEUE 一次提交。禁止导入原始 state、tick、时钟命令或显示开关。载入后重建球员选择并显式恢复首发场内 ID，即使名单文字与当前完全相同也应恢复。坏文件、读写失败不能回填表单或覆盖原资料。GK/位置/队长元数据不属于球员净姓名，Node/PowerShell、控制台和观众端的身份解析必须一致。配置不参与便携版种子，分发仍只保留字体。

---

## 七、目录结构（本项目）

```
football-broadcast-pack/
├── README.md                    使用说明
├── docs/
│   └── VMIX_TEMPLATE_METHOD.md  本方法预设（体育+舞台+主题+Bug清单）
├── titles/
│   ├── graphics.html            单链接联合上屏（推荐，唯一要加进 vMix 的）
│   ├── scoreboard.html … lineup.html   7 个共用渲染器的独立入口（高级用法）
└── control/
    ├── panel.html               控制面板（写 state + 预设 + 主题 + 叠层）
    ├── preview.html             预览/位置大小编辑器（`?edit=1`）
    ├── serve.js                 Node.js 服务器（推荐，ETag/304）
    ├── serve.ps1                PowerShell 服务器
    ├── 启动控制面板.bat          一键启动
    └── state.json               状态数据（含主题/预设/位置/图片）
```

技术：零依赖、纯 HTML/CSS/JS + Node/PowerShell 静态服务器。所有图形 1920×1080、透明背景，适合 vMix 叠层。

---

## 八、如何把「方法」装成一个 DSH agent 预设（可选）

环境如具备 `cordis_mount` / `agentPresets.copy()` / `standingKeyFor(id)`，可把它做成可直接启动的 agent 预设：
1. `copy('standard','vmix-graphics')` 复制到用户根，`resolve()` 取真实路径。
2. 用本文件的「理念/流程 + 体育清单 + 舞台清单 + 主题体系 + Bug 清单（第六节）」作为该预设的 systemPrompt/persona 追加段落。
3. 在 `preset.yml` 写 `name: vMix 图形·包装方法` / `description: 制作 vMix 网页图形包装（体育+舞台），含主题与 Bug 清单`。
4. `standingKeyFor('vmix-graphics')` 校验挂载通过后，让用户以该预设开新会话。
（本会话未提供上述挂载工具，故以本文档落盘其内容，可作为该预设的 prompt 正文。）


## 九、2026-10-08 稳定性补充（新实现必须遵守）

1. 时钟由服务器保存统一锚点，页面只读渲染；禁止页面按秒 POST 时间。两页、预览及 vMix 必须共享同一基准。
2. 首次成功读状态只建立 tick 基线，不执行历史瞬时动画、历史时钟命令或历史重置。新事件照常按 tick 播放。
3. tick 在服务器分配唯一递增编号；前端计数器刷新后从 0 开始会冲突。
4. 重置位置在服务器执行一次；没有打开预览页时也能生效，刷新后不会再次执行。
5. 手柄和滑杆都设置 DRAG；提交后等待已保存状态与 PENDING 一致再允许轮询覆盖；失败要显示提示并恢复。
6. 背景图片 data URI 用 `url(...) center / cover no-repeat`，不能直接赋给 background。
7. Windows PowerShell 5.1 不支持 ConvertFrom-Json -AsHashtable，须递归转换对象；脚本含中文时使用 UTF-8 BOM。毫秒时间运算显式使用 double，避免 Math.Max 的 Int32 重载溢出。
8. Node / PowerShell 都必须支持 ETag/304；正文与 ETag 只在状态变更时计算。串行轮询，处理 304，禁止旧请求覆盖新状态。
9. 默认状态接口和面板地址取当前服务器 origin，不写死 8123；允许显式 state 参数覆盖。
10. 写盘使用临时文件后原子替换；写盘失败不得更新内存或返回 ok:true。面板必须检查 HTTP 状态和 ok，收到确认后才报告成功。
11. 分数在发送端和服务器均限制为非负；上传日志只记字段与体积，不展开 base64。
12. 测试使用 FBP_STATE_FILE 指定临时状态，测试进程结束时关闭。始终保留真实 state.json 数据。


## 十、D200 / HTTP 实体按键集成（2026-10-09）

- 使用 Ulanzi API Request 插件。按键 POST `/api/d200/action/<id>`；状态 GET `/api/d200/status`。两种 URL 必须分开；动作 GET 返回 405。
- 动作目录源码位于 `modules/football/d200-actions.json`，浏览器仍可通过 `/control/d200-actions.json` 读取。两个服务器共享目录，分别生成等效状态 patch。操作读服务器当前状态，不从过期的网页比分计算。
- 网页加减分使用 scoreHome_delta / scoreAway_delta 指令，在服务器串行合并时累计；同步进球以合并后的比分生成进球画面。
- 所有事件仍通过 tick 去重，进入页面只建立历史基线；clear_events_tick 仅撤下瞬时动画。
- 内容准备只写球员、判罚、名单字段，不写事件 tick 或可见性。
- 配置及硬件测试始终使用临时数据。禁止为了测试改动真实比赛文件；不要直接写 Ulanzi 的现有预设。


## 十一、控制台控件与静态交付（2026-10-11）

- 控制台的 Apple 风格与上屏 theme_* 独立；控制台样式仅在 control/panel-layout.css 定义。
- 字段标签与输入属于同一个 .field，成组值用明确的网格；禁止重新添加固定宽度内联样式，把标签与输入散放到 flex 换行容器。
- 标准输入、选择、上传和动作按钮保持 44px，高度对齐；紧凑数值微调按钮属于 44px 数值容器内部。
- MicroKit 组件静态适配、随项目分发并保留许可，不增加运行时开发服务依赖。不得为了组件引入 CDN 或要求用户另外启动 Next 开发服务。
- 新组件默认只编辑草稿；只有原应用/播放按钮可以写状态。图片和字体维持原选择即上传流程。导航和键盘操作不得写状态。
- 程序回填或恢复默认时调用 FBPWidgets.sync()，同步颜色、滑杆读数与数值状态；不得让视觉读数与实际字段值不一致。

## 2026-10-11：观众端转播图形体系

原版公共外观位于 `ui/titles/broadcast.css`，发球图标位于 `ui/titles/assets/icons/*.svg`；浏览器访问路径不变。联合页和七个独立入口共用同一状态与图形逻辑。默认采用灰白信息板、石墨文字、深青灰细标题带、短队色标记及克制的透明度/6px 平移过渡；比分条采用中央比分和下挂时钟，禁用装饰性无限动画和回弹。详细规则与渲染验证见 `BROADCAST_DESIGN.md`。


### 2026-10-11 最新名单与动画规则

用户现要求优先在一个面板同时展示主客队首发、替补。默认 `lineup_mode=all`；单独显示仍由 `lineup_mode=single` 和原四个 `lineup_active` 值实现。完整/单独模式分别保存布局，不能覆盖旧名单位置。所有条支持 wipe 入退场，时长由 `wipe_in/wipe_out` 配合原 `animdur` 设置；事件停留从入场结束计算。比赛时间可在控制页输入分秒，通过后端 set 命令更新锚点，观众页仍只读。具体操作与验证见 README 第 11 节及 `tests/features.js`。


### 比分联动与换人状态

比分修改统一同步到各分数输入及 goal_score 字段；球员表单先在所选球队的场内匹配号码，再在场外查找，不能按最初首发/替补限制事件选人。换人必须由服务器原子验证并更新 onfield 数组，观众页只读并由 sub_tick 去重显示。原始首发/替补文本用于赛前名单，换人不修改它们。新 PS 模块保持 UTF-8 BOM。具体协议和检查见 HANDOFF 最新补充及 tests/links.js。

观众端比赛阵容不显示已上场／已下场标记，也不按场内状态置灰姓名，完整／单独模式共用此规则；保留首发、替补与队长。onfield 变化不参与阵容显示签名，避免换人导致阵容重新 wipe。控制端场内／场外分组、号码优先匹配及独立换人条仍使用原状态。

保存确认应包含 onfield 与控件状态，立即回填名单，不能只等后台轮询。换人前检查服务支持 onfield；旧进程无法热加载服务逻辑，必须明确提示重启而非返回虚假完成。所有球员事件包括发球共用场内优先的选择和号码匹配；名单编辑文本与实时场内状态分别展示。控制按钮的未选状态统一灰色，选中状态来自已确认服务数据；悬停阴影不得移动控件，且须支持减少动效。比分条投影不改变原安全区、对称队名和下挂时间布局。

### 2026-10-13 比分条与排版工具规则

- `sb_logos_show` 缺省为 true，关闭只收起比分条队徽，不删除资源或隐藏独立 Logo/名单队徽。宽度用当前字体测量，两队取较大字宽组成对称单元；关闭以三字母基准收紧，短名变回基准，不能只增不减。自定义字体加载完成后重新测量。
- 预览比例在固定 1920×1080 画布内生成居中构图范围，95%/90% 安全框以该范围计算。不得借此修改 vMix 上屏画布、比赛状态或已存坐标。
- 辅助线、网格与排版临时隐藏只在 edit=1 中创建，偏好放当前浏览器 localStorage，禁止作为 show_* 字段写回 state.json。单独入口也传 edit=1，共用同一编辑逻辑。
- 拖拽时保持指针捕获、原始位移及 DRAG 防轮询覆盖，吸附只调整显示坐标。精确坐标与对齐按中心点保存，使用缩放后的栏目尺寸计算边界；完整/单独名单仍分别保存布局。
- 保存确认比较字段值，不能比较 JSON.stringify 的对象文本。PowerShell 返回 {y,x} 与浏览器提交 {x,y} 等价，字符串比较会让 PENDING 永不清除，导致后续状态更新被挡住。保留失败回退与真实保存提示。
- 编辑器桥接只接受同源且来自当前 iframe 的消息，按实际当前快照更新控件，避免 stale 消息和 embed/notify 无限循环。验证须用真实指针拖动缩小的 iframe、Node/PowerShell、临时状态与临时端口；结束时关闭测试进程。

### 2026-10-13 队名提交与上屏同步

队名输入是草稿规则的例外：打字时仅联动表单，change（离开输入框）或 Enter 提交名称并同步上屏，中文输入法组字中的 Enter 不提交。只发送 teamHome/teamAway 与相关 *_team 字段，禁止带入比分、颜色、球员、名单草稿、时钟命令或事件 tick。名单卡改队名也遵循同一规则。读取当前已保存的事件 side 决定联动哪一个队名，不能从尚未保存的选择框猜，也不能使用 D200/其它控制页操作前的过期缓存。读取和提交串入现有 WRITE_QUEUE，错误必须显示失败并保持队名草稿可重试，空白名称不写盘；Enter 后失焦不得重复提交。测试使用真实键盘输入与失焦事件，不仅调用写入函数。

### 2026-10-13 分方向 Wipe

- 比分条保持原动效，其余栏目采用视频参考的中间展开：计时器和名单（全部与单独模式）向上下展开，小事件条与独立 Logo 向左右展开。退场反向收拢，不能把文字和号码 scale 拉伸。
- `broadcast.css` 的 `--wipe-closed/--wipe-open/--wipe-start-opacity` 为各方向的唯一来源。首次显示用 CSS，重复触发用 WAAPI 读取相同变量，禁止重播时硬编码为左向右。
- 继续使用 `wipe_in/wipe_out`、`animdur`、`hold_*` 与共享曲线变量。默认 smooth 为 Apple 风格临界阻尼无回弹曲线；比分条保留旧 `--ease`，其余读 `--wipe-ease-in/out`。重复播放先从实时遮罩收拢，再展开，返回收拢＋入场总秒数用于停留计时。时钟刷新、相同名单轮询不重放。重叠打断只作用于瞬时事件并立即隐藏，常驻栏目不受影响。
- 隐藏正在重播的栏目时从当前遮罩收回，再显示时从当前遮罩展开，避免取消动画闪出完整面板。编辑模式无遮罩、无过渡；减少动态效果立即显示／隐藏。
- 动效完全在现有联合页与共享 CSS 中实现，所有独立入口继承，无新增服务或动画库。隔离验证见 `tests/wipe-directions.js` 和 `tests/features.js`。

### 2026-10-13 便携软件分发规则

- 桌面版直接调用 `control/serve.js` 的 `createServer`，导入模块不启动 CLI 或打开系统浏览器；原 Node/PowerShell 用法须保持可用。桌面自带 Chromium/Node，本地素材和库全部随包发布，不依赖 MicroKit dev 或 CDN。
- 数据放 EXE 同级 `data`，首次缺失才用种子快照；已有或损坏数据禁止静默覆盖。发布时只暂停复制出的时钟，真实工作数据不修改。用户迁移或升级时保留整个 `data`，软件转移须带全文件夹。
- 优先 8123，占用时自动选择其他端口，面板/预览/D200/vMix 地址均跟随实际服务同源，不能硬编码新功能 URL。只监听本机回环地址；不得关闭用户原有服务器。
- 原生主窗口关闭应退出全部子窗口、暂停计时并关闭服务器；防止 keep-alive 让服务遗留。关闭事件中用下一轮事件循环调用退出，避免重入。测试要关闭真实 BrowserWindow，Chromium 的 Page.close/Target.closeTarget 不等于原生窗口退出。
- 构建校验官方运行包 SHA256，保留许可与本地素材，拒绝覆盖已存在的发布目录；用真实 EXE、空 PATH、中文路径、端口冲突和移目录重启验收。实现及操作详见 `docs/PORTABLE_APP.md`。

### 2026-10-17 时钟与赛前总名单

- 比赛时钟控制位于控制台顶部常驻比分区，滚动与任意页签均可用；不移动播出比分条。时间配置沿用原字段，自动阶段配置为 `match_timing`，默认关闭。
- 自动阶段由 Node/PowerShell 服务的 200ms 调度执行，使用精确时钟锚点和 `match_break_until`，不依赖网页计时器写盘。先原子保存，成功后才发布新状态和 ETag；多页不能重复推进，重启按锚点补算。手动暂停/阶段修改取消待自动开始；改比分但阶段未变时不得取消休息计时。便携软件退出取消休息等待。
- 总名单合并双方首发/替补，身份继续是 side|号码|净姓名，GK/队长/位置均保留。勾选时行的位置稳定，更新四份草稿而不 POST；统一保存时显式重建两队场内 ID，包括原名单文字完全相同的情况。保存失败保留草稿，坏文件不能覆盖名单。
- 球员信息条默认「球员信息」，显式自定义标题用 `player_title`；兼容旧 `player_event`，旧的默认「进球」不再误作介绍标题。独立进球栏目不受影响。
