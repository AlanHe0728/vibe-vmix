# VibeVmix 舞台设计模板 API 与封装规范

适用于转播包装工作台 2.1.0 及后续版本。AI 和 Adobe 模板制作面板产出同一种 UTF-8 JSON，扩展名为 `.vmix-graphics.json`。一个文件包含构图、实时字段、图层、媒体和动效。歌词文本、选手名单、分数等业务数据由控台提供。

[JSON Schema](stage-design-v2.schema.json) · [歌词字幕实例](caption-example.vmix-graphics.json) · [晋级名单实例](promotion-example.vmix-graphics.json)

## 上手

**用 AI 设计。** 将本规范、Schema 和对应示例一并交给 AI。指定要做歌词字幕或晋级名单，以及画面尺寸、字体、颜色和实时字段。要求只输出 JSON，保存为 `.vmix-graphics.json`。可先调用校验 API。首轮设计可以用矩形和文字验证结构，确认布局后再嵌入实际素材。

**用 Photoshop 或 After Effects 设计。** 在「窗口 → 扩展（旧版）→ 转播包装模板制作」选择「舞台歌词字幕」或「舞台晋级名单」。点击插入文本框或样例首行，直接在作品里移动和调整字号、颜色及对齐。点击「导出模板」，面板会将普通美术层烘焙为透明 PNG，将标记的文本层导出为实时字段。建议用段落文本框，给长歌词或长选手名预留宽度。

**在工作台选用。** 歌词字幕进入「包装与模板 → 字幕模板 → 导入模板」。导入后点击卡片设为活动默认，或在节目资料中给单个节目选用。晋级名单在「名单样式 → 导入设计 JSON」导入，选中模板后点击「保存名单」。可先点击「采用模板尺寸与位置」，再到「预览与布局 → 晋级名单」调整位置和大小。独立网页继续由 vMix 切换。

在已导入的模板上点击「编辑」可以修改、校验、保存或导出 JSON。点击「保存为副本」可建立独立设计。旧版 `.stage-caption` 可以继续从字幕模板入口导入。

## JSON 契约

| 属性 | 类型与含义 |
| --- | --- |
| `format` / `version` / `module` | 固定为 `"vibe-vmix-graphics"`、`2`、`"stage"` |
| `slot` | `"caption"` 或 `"promotion"` |
| `id` | 1 至 48 字符，以小写英文字母开头，其余小写英文、数字或连字符。全库唯一。`classic`、`constructor`、`prototype` 保留 |
| `name` | 1 至 64 字符，用于控台显示 |
| `scene` | `width` 为 64–1920，`height` 为 24–1080。`position.x` 为 0–1920，`position.y` 为 0–1080，表示组件左上角在 1920 × 1080 播出画布中的建议位置。导入后的字幕位置可继续拖动 |
| `elements` | 1 至 64 个元素，按数组顺序从底到顶。元素的坐标相对于组件左上角，单位为像素，必须完整落在组件内 |
| `motion` | 可选。包含 `enter` 和 `exit`。晋级名单的模板底图、标题和选手行随整张名单运动。驻留阶段模板顶边带有一道周期性反光。省略轨道时使用内置进出场动画。舞台参考背景和全局活动 Logo 仅供 PVW 查看 |
| `roster` | 仅晋级名单使用，定义首行及其重复方式 |

### 元素

每项必须有 `type`、`x`、`y`、`width`、`height`。坐标非负，宽高至少 1 px。`opacity` 可选，取 0–1，默认 1。

- `rect` 需要 `color`，可用 `radius` 设置 0–64 px 圆角。
- `text` 需要 `color` 和 `fontSize`（8–144 px）。`text` 是最多 160 字的示例或静态文字，`bind` 指向实时字段。`align` 支持 `left`、`center`、`right`。`weight` 默认为 600，支持 100–900。`minFontSize` 是单行文字自动缩小时的下限，不能大于 `fontSize`。`wrap:true` 可让字幕文本自动折行，溢出文本按框裁切。
- `font` 可以填播出电脑已安装的字体名，默认 Microsoft YaHei。`latinFont` 可为字幕中的拉丁字符和阿拉伯数字指定字体，在晋级名次和分数字段也可指定数字字体。字体文件无需内嵌。
- `image` 的 `src` 接受 PNG Data URI，例如 `data:image/png;base64,<BASE64>`。也可以绑定 `event.logo`，此时 `src` 可作为后备图片。绑定的活动 Logo 使用舞台已配置的静态图片。
- `video` 的 `src` 接受 `data:video/webm;base64,<BASE64>`，浏览器静音循环。`fit` 对图片和视频支持 `contain`、`cover`、`fill`。
- 颜色采用 `#RRGGBB`。各媒体 Data URI 最多 2,500,000 字符，整个 JSON 最多 4 MiB。可用带 Alpha 的 PNG 或 WebM。JSON 里的素材必须是真的文件字节，示例占位符只能用于说明。大体积 MOV、PNG 序列和字体可通过已有的素材库和字幕包工作流管理。

### 实时字段和 Adobe 图层名

在 PS 或 AE 中，面板生成下列名称的文本层。也可手动命名并保留为可编辑文字。每种字段最多出现一次。

| JSON 字段 | PS / AE 图层名 | 用途 |
| --- | --- | --- |
| `caption.text` | `VMIX caption.text` | 歌词字幕，必填 |
| `promotion.title` | `VMIX promotion.title` | 名单标题，必填 |
| `promotion.page` | `VMIX promotion.page` | 页码，可选 |
| `promotion.rank` | `VMIX promotion.rank` | 名次 |
| `promotion.name` | `VMIX promotion.name` | 姓名，必填 |
| `promotion.program` | `VMIX promotion.program` | 节目 |
| `promotion.score` | `VMIX promotion.score` | 分数 |
| `event.logo` | `VMIX LOGO event.logo` | 静态活动 Logo 图片占位 |

### 晋级名单首行

名次、姓名、节目和分数的坐标描述设计稿里的**首个选手行**。重复时，控台根据当前名单大小决定分一栏还是两栏，以及每页能放几行。隐藏字段后，剩下的字段会重新分配列宽。

| `roster` 属性 | 含义 |
| --- | --- |
| `top` | 首行起点 Y，默认采用选手字段中最小的 Y |
| `rowHeight` | 每行高度，默认根据首行文本框下沿计算。全部选手字段位于 `[top, top + rowHeight]` |
| `bottom` | 底部留白，默认 24 px |
| `gap` | 双栏间距，默认 40 px |
| `minColumnWidth` | 每栏最小宽度，默认 640 px 或组件宽度中的较小值。可用宽度达到两栏最小宽度加间距后启用双栏 |
| `headings` | 是否生成列标题，默认 `true` |
| `repeatArt` | 为每个选手行重复使用完整画布 PNG 的首行底纹，默认 `false`。PNG 元素须从 `(0,0)` 开始且宽高等于组件。Adobe 面板的「重复使用首行的 PNG 底纹」对应此项 |

AE 动效通过二维 `VMIX MOTION` 控制层导出。实时字段使用二维零旋转图层，可挂到控制层。普通图层导出为一帧透明 PNG。逐层时间线和特效可先渲染为 WebM，再将文件嵌入 JSON 的视频元素。也可以在 AE 采用 PS 导出的同用途、同尺寸模板作为底图和字段，叠加 AE 的控制层动效。

### 动画关键帧

每段包含 `duration`（1–10000 毫秒）与 `frames`（2–240 个关键帧）。每帧必须有 `t`（0–1）、`x`、`y`（像素位移）和 `opacity`（0–1），可以附带 `sx`、`sy`（0.05–4，默认 1）和 `rotation`（-360–360 度，默认 0）。`t` 严格递增，第一帧为 0，最后一帧为 1。

## 本机 API

在「设置 → 上屏地址」找到舞台服务。默认源为 `http://127.0.0.1:8125`，端口占用时以工作台显示为准。写入请求来自导播主机，浏览器需同源。JSON 请求体使用 `Content-Type: application/json`。接口响应错误包含 `error`，400 表示内容校验失败，403 表示来源受限，404 表示模板不存在，409 表示标识冲突或素材缺失，413 表示请求过大。

| 方法与路径 | 请求与响应 |
| --- | --- |
| `POST /api/stage/design-templates/validate` | 请求体为完整模板。校验通过返回 `{ "ok": true, "template": {...} }`，模板经规范化，无状态变更 |
| `POST /api/stage/design-templates` | 导入完整模板。新建返回 201。明确加 `?replace=1` 可更新同标识、同用途模板并返回 200。字幕模板会出现在现有字幕列表中。返回的模板中，内嵌素材已替换为运行地址 |
| `GET /api/stage/design-templates` | 返回 `{ "ok": true, "templates": [...] }`。列表提供 `id`、`name`、`slot`、`scene`、`revision` |
| `GET /api/stage/design-templates/{id}` | 下载完整可迁移 JSON。素材还原为 Data URI，可用于异机导入和 Adobe 采用 PS 底图。读取的 `ETag` 可用于更新时的 `If-Match` |
| `POST /api/v1/state` | 现有舞台状态接口。活动默认字幕以 `{ "captionTemplateId": "<id>" }` 选用。晋级模板在对应轮次的 `promotions` 条目中设置 `designId` 后保存，名单原有字段一并保留。提交数组前读取最新状态并带上 `If-Match` |
| `GET /api/stage/promotion-preview?layout=1&round={id}` | 获取所选轮次的已保存名单、布局与设计元数据，用于 PVW |
| `POST /api/v1/state`（名单播出） | 传入 `{ "promotionRoundId": "<轮次 ID>", "promotionVisible": true }` 将已保存的该轮名单上屏。传入 `{ "promotionVisible": false }` 令整页下屏。PVW 可独立查看已保存的轮次 |
| `GET /api/stage/promotion?layout=1` | 获取独立名单输出的当前页、布局与设计元数据。上屏网页仍为 `/stage/promotion.html` |

PowerShell 示例，从本规范所在目录运行：

```powershell
$stageOrigin = 'http://127.0.0.1:8125'
$templateFile = 'caption-example.vmix-graphics.json'
curl.exe -sS --fail-with-body -H 'Content-Type: application/json' --data-binary "@$templateFile" "$stageOrigin/api/stage/design-templates/validate"
curl.exe -sS --fail-with-body -H 'Content-Type: application/json' --data-binary "@$templateFile" "$stageOrigin/api/stage/design-templates"
curl.exe -sS --fail-with-body "$stageOrigin/api/stage/design-templates/stage-cobalt-caption" -o 'exported-caption.vmix-graphics.json'
```

选择字幕、播出已有节目的第一句，以及给已保存的晋级轮次选用模板：

```powershell
Invoke-RestMethod "$stageOrigin/api/v1/state" -Method Post -ContentType 'application/json' -Body '{"captionTemplateId":"stage-cobalt-caption"}'
Invoke-RestMethod "$stageOrigin/api/v1/commands/caption.take" -Method Post -ContentType 'application/json' -Body '{"programId":"已保存的节目ID","index":0}'

$promotionFile = 'promotion-example.vmix-graphics.json'
curl.exe -sS --fail-with-body -H 'Content-Type: application/json' --data-binary "@$promotionFile" "$stageOrigin/api/stage/design-templates"
$roundId = '' # 空字符串表示未分轮，也可填已保存轮次的 ID
$stateResponse = Invoke-WebRequest "$stageOrigin/api/v1/state"
$stageState = $stateResponse.Content | ConvertFrom-Json
$roster = $stageState.promotions | Where-Object { $_.id -eq $roundId }
if (!$roster) { throw '请先保存该轮晋级名单' }
$roster | Add-Member -NotePropertyName designId -NotePropertyValue 'stage-cobalt-promotion' -Force
$patch = @{ promotions = @($stageState.promotions) } | ConvertTo-Json -Depth 20
Invoke-RestMethod "$stageOrigin/api/v1/state" -Method Post -Headers @{ 'If-Match' = [string]$stateResponse.Headers.ETag } -ContentType 'application/json; charset=utf-8' -Body $patch
```

其中歌词的 `index` 从 0 开始。晋级名单保存后，可在控台选择该轮并上屏。

Schema 校验用于检查结构和字段类型。服务还会检查图层是否越界、字段是否重复、名单首行范围、关键帧顺序、媒体签名和包大小。实际导入以校验 API 的结果为准。
