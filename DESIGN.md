---
name: 足球转播包装
description: 下列 control 前缀令牌适用于控制台及预览监控的工具界面；观众端沿用原有规范。
colors:
  control-background: "#ffffff"
  control-ink: "#202a35"
  control-dim: "#52606d"
  control-accent: "#1666ad"
  control-focus: "#2274b8"
  control-well-fill: "rgba(255,255,255,.38)"
  control-well-line: "rgba(64,81,98,.20)"
  control-button-fill: "rgba(255,255,255,.16)"
  control-button-hover: "rgba(255,255,255,.50)"
  control-active-fill: "rgba(255,255,255,.96)"
  control-chrome-fill: "rgba(246,249,252,.66)"
  control-flyout-fill: "rgba(250,252,254,.89)"
typography:
  control-body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  control-clock:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
    fontSize: "38px"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "-.035em"
  control-heading:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-.025em"
  control-label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 450
    lineHeight: "18px"
rounded:
  control-field: "12px"
  control-panel: "22px"
  control-mobile-panel: "18px"
  control-pill: "999px"
spacing:
  control-xs: "8px"
  control-sm: "16px"
  control-md: "24px"
  control-lg: "28px"
  control-section: "40px"
components:
  control-button-primary:
    backgroundColor: "{colors.control-active-fill}"
    textColor: "{colors.control-accent}"
    rounded: "{rounded.control-pill}"
    padding: "10px 18px"
    height: "44px"
  control-button-idle:
    backgroundColor: "{colors.control-button-fill}"
    textColor: "{colors.control-dim}"
    rounded: "{rounded.control-pill}"
    padding: "10px 18px"
    height: "44px"
  control-field:
    backgroundColor: "{colors.control-well-fill}"
    textColor: "{colors.control-ink}"
    rounded: "{rounded.control-field}"
    padding: "10px 14px"
    height: "44px"
  control-task-tab:
    backgroundColor: "{colors.control-background}"
    textColor: "{colors.control-accent}"
    rounded: "{rounded.control-pill}"
    padding: "10px 18px"
    height: "44px"
  control-flyout:
    backgroundColor: "{colors.control-flyout-fill}"
    textColor: "{colors.control-ink}"
    rounded: "{rounded.control-panel}"
    padding: "24px"
---

# 观众端设计决定

用户否决了深蓝长横条，以及赛事紫搭配高饱和黄绿的大色块。最新视觉依据是用户提供的英超品牌规范参考，尤其是浅色队名横条、独立中央比分和下挂时钟的比例。

该页面服务于比赛观看，采用 Read 模式。设计尺度为 DESIGN_VARIANCE 3、MOTION_INTENSITY 2、VISUAL_DENSITY 6：优先对称、短运动和紧凑可读的数据。重要性依次为：比分与时间；事件及球员；名单中的号码与姓名。避免用装饰占据球队和球员信息的位置。

## 调色

浅灰白 `#f7f9f9` 用于信息板，石墨 `#20282b` 用于主文字，青灰 `#526267` 用于辅助文字，深青灰 `#263137` 用于细标题带。标题带只有轻微深青渐变；比分区保持中性明暗对比。队色和红黄牌色只承担识别作用，不扩散到全组件。

## 构图

比分条两队等宽，队徽保留对称位置，比分单独居中，时钟下挂在比分单元正下方。赛事阶段是时钟下方的细标签，暂停状态独立置于横条上方，互不遮挡。

比分条可切换队徽：有队徽时最小宽 650px；无队徽时最小宽 306px，两个队名单元各 102px，中央比分单元 102px。长队名按当前字体实际字宽扩展两侧，短队名恢复基准；比分位数较多时中央单元也扩展，下挂时间与阶段跟随同宽。两侧保持等宽，极长队名在画布宽度限制内缩小文字。外层位置和缩放仍使用保存值，不因切换队徽而重置。

事件模块统一 650px 宽，32px 标题带表示事件名称，下面的信息行以号码、姓名、球队和比分组织。图标缩小为辅助标识。所有比赛图形采用直角，不增加切角、单侧圆角、霓虹条或大面积高饱和渐变。

名单采用横向队名标题、独立名单类型条、对齐的号码和姓名列。默认以一个 1200px 面板同时呈现两队，左右等宽，首发与替补的标题及分隔位置一致。号码使用不同的主客队底色，按底色亮度选择文字颜色。四种单独名单仍保留，超过 14 人排两列。完整名单使用独立位置/缩放，初始中心为 (960,580)。辅助信息不与姓名争夺字号。

数字使用 Bahnschrift 等宽数字特性，中文使用系统雅黑后备，继续尊重用户选择及上传的字体。主姓名约 28px、正文名单 22px、球队 17px、事件标题 19px。4px 是间距基准，紧凑数据之间用 8–16px，组间用 20–24px。

## 运动与验证

图形整体使用从左向右的 clip-path wipe 和透明度渐入；默认入场 450ms、退场 280ms，沿用 --ease 曲线，时长可配置，计时与名单无装饰性循环动画。支持减少动态效果。修改仅在工作副本完成，不移动用户保存的组件位置。

验证须同时检查独立图形和 1920×1080 的球场背景合成，确认字体、比分单元、时钟下挂、名单列和事件之间的比例。球场背景是测试示意，生产画布仍透明。控制台继续保留原有 Apple 风格，与观众端配色分开。

预览可在固定画布内显示不同纵横比的居中构图范围，以及 95% 画面安全框、90% 文字安全框、中心线和移动网格。这些辅助线与排版临时隐藏仅属于编辑器，不写入播出状态，也不在观众页创建。坐标和缩放仍同步上屏，对齐按选定构图或安全范围的实际边界计算。

# 控制台主页面设计

## Overview

适用于 `control/panel.html`，实现来源为 `control/console-desk.css`、`control/console-desk.js` 与保留的基础控件。`control/preview.html` 的工具界面通过 `control/preview-desk.css` 沿用同一套 control 配色、字段与操作规范；不覆盖观众端或 D200 页面。主页面以纯白底、清楚的任务层级和常驻比赛操作为核心；具体工作流见 `.impeccable/surfaces/control-panel.md`。

## Colors

主文字使用 control-ink，辅助说明和未激活控件使用 control-dim。白底蓝字表示主操作与选中状态；队色用于球队资料、顶部队名外侧的细条及上屏内容。页面背景必须使用 control-background，保持纯白，不使用壁纸或装饰背景。预览中的球场属于合成内容，不是控件材质。

## Typography

沿用系统无衬线字体，中文优先系统雅黑后备；正文、字段标签、页面标题和时钟分别使用对应 control 令牌。比分与时钟使用等宽数字特性。窄屏标题降为 21px，时钟降为 32px；字号与权重明确区分读数、操作和说明。

## Layout

顶部导航与比分时钟共用一层常驻操作区；正文最大宽 1120px，桌面内边距 32px，窄屏 16px。桌面导航与比分沿页面中线排布，比赛栏计时与加分占等宽两侧；事件导航和三颗事件操作按钮居中；正文不重复显示「比赛操作」「名单准备」「设置」等导航大标题。事件导航桌面为六列等宽，窄屏为三列两行。每次显示一个事件工作区，字段以安静留白分组；双列球队与总名单在 760px 以下改为单列。布局在 1248px、1000px、760px 分级收紧，浮层位置与滚动留白跟随顶部实际高度。

使用 1px 灰色分割线建立分区：主要边界为 `#c8d0d8`，内层分隔为 `#e0e5eb`。分隔导航、常驻比赛栏、事件内容与操作区；桌面主客队资料和总名单之间使用竖线，窄屏改为两队之间的横线。预览页导航和布局工具分组使用同样的线色，保留纯白与留白。

控台顶部两条横线与比赛栏内容等宽，最大 1056px，随窄屏边距收缩。底部分割线位于 16px 白色留白带内，避免滚动正文与线叠在一起；正文上方保留独立间距。

总名单的文件选择与粘贴文本属于同一折叠导入区。新增球员使用就地表单；名单条主体负责首发选择，右侧删除是独立按钮，不能误触首发开关。删除提供单步撤销，修改统一保存，保留 GK、队长、位置与选人联动。

总名单 GK、队长使用独立小按钮，选中为白底蓝字，可直接修改已有球员标记。文件上传的选择按钮与已保存文件名各占独立区域；原生文件框隐藏，长文件名省略并保留完整标题提示。预览页桌面工具面板宽 320px，主画面留 20px 边距；680px 以下面板为可收起浮层。

## Elevation & Depth

**功能浮层规则。** 玻璃只用于悬浮操作区、设置浮层和原生下拉选择层；普通卡片与表单不加模糊、镜面高光或厚阴影。顶部材质放在独立 `::before` 合成层，文字与控件不进入 backdrop 根；浮层固定定位并挂到 body，避免嵌套 backdrop 造成模糊失效与残留文字。阴影、模糊与运动数值见 `.impeccable/design.json`。

## Shapes

字段使用 control-field 圆角与清楚的细边框；操作和任务标签使用胶囊圆角；功能浮层使用 control-panel 圆角，窄屏收为 control-mobile-panel。主内容卡片平坦，不再把每组表单包成玻璃卡。

## Components

界面只保留具体功能标题、字段标签、数值和必要状态；与导航重复的工作区大标题直接删除。删除标题副文案、操作指导、重复说明和“快速选择”等标题修饰；默认提示为空且不占位，成功匹配不补充说明。错误、号码歧义、未保存、保存结果等反馈保持简短。

按钮未激活时为灰字；主操作和选中状态为白底蓝字。控台与预览工具按钮使用清楚的双层投影，主操作略高，小按钮使用紧凑投影；悬停加深，按下收浅并轻微缩小，禁用时取消投影。内容卡片和字段保持平坦。输入框保留可见标签，键盘焦点采用蓝色描边（2px，外偏移 3px）。主标签、事件与设置子标签支持方向键、Home、End；浮层打开后移入焦点，点击外部或焦点离开时关闭，Escape 关闭并回到触发按钮。写入错误显示在常驻顶部的 `#deskNotice`，窄屏也必须可见。

## Do's and Don'ts

2.0 工作台、舞台控台与 AE 连接页继承纯白、系统字体、蓝色操作与细分割线的操作界面。舞台观众图形独立使用四套演出模板，不影响控台外观。主工作台保留模块选择和单个嵌入控台；切换销毁旧控台，预览按需启用。AE 内面板采用与宿主相容的中性深灰表面，保持字段可读与明确的应用操作。

- 保持主页面纯白；只为承担悬浮功能的层使用玻璃。
- 保持顶部加分与进球播放的职责分开；显式选择的一次性加分在提交成功后复位。
- 保留 TXT 配置、总名单、GK/队长/位置和场内球员联动；低频编辑按需展开。
- 遵循减少动态效果、减少透明度及高对比偏好；不支持模糊时使用不透明浅色材质。
- 本规范覆盖控制台与预览工具界面；不要将其圆角、配色或布局应用到观众端。
