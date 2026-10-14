# D200 足球包装按键配置

适用当前环境：Ulanzi Studio **3.4.4**、D200 固件 **2.0.3**。按键通过 Ulanzi Studio 的 API Request 插件访问本机足球包装服务器。

## 1 安装和打开

1. 在 Ulanzi Studio 应用商店搜索 **API Request** 并安装。已安装的“网页控制”负责网页视频快进/快退，不提供这里需要的 HTTP 请求功能。
2. 关闭旧服务器窗口，启动工作副本 `control\启动控制面板.bat`。在 vMix 刷新该网页输入一次，载入新增的“撤下事件动画”逻辑。
3. 在足球控制面板找到“Ulanzi D200 实体按键”，点“打开 D200 配置页”。默认地址：`http://localhost:8123/control/d200.html`。
4. Ulanzi Studio 和足球服务器均保持运行，D200 接在同一台电脑上。vMix 的上屏输入仍使用 `http://localhost:8123/titles/graphics.html`。

## 2 先配置一个键

先选择“比分条 显示 / 隐藏”，把 API Request 动作拖到 D200 的一个按键。按网页配置页填写：

| 插件字段 | 填写内容 |
|---|---|
| URL | `http://localhost:8123/api/d200/action/scoreboard_toggle` |
| HTTP Method / HTTP 方法 | `POST` |
| Content Type / 内容类型 | `application/json` |
| Request Body / 请求体 | `{}` |
| 响应 JSON 路径 | `ok` |
| 响应预期结果 | `true` |

按一次显示/隐藏比分条，再按一次恢复。配置页的“试按”按钮也会真实执行当前动作。

## 3 状态图标（可选）

- 勾选“根据响应设置按键图片”，上传匹配和未匹配两张图片，例如亮色和暗色。
- 勾选“定期轮询 URL 状态”。
- Status URL / 状态 URL：`http://localhost:8123/api/d200/status`。
- 状态 HTTP 方法：`GET`；间隔：`2` 秒。
- 勾选“从状态响应解析不同字段和值”。
- 比分条键的状态 JSON 路径：`buttons.scoreboard_toggle.active`，预期结果：`on`。
- 比赛时钟键的路径：`buttons.sb_clock_toggle.active`，预期结果：`on`，表示运行中。
- 其他键使用配置页给出的路径。进球、判罚等瞬时动画的 `ok=true` 表示接口可用，不表示动画正在播放。

动作 URL 用 POST 执行，状态 URL 用 GET 读取。GET 访问动作 URL 返回 405，不会加分或播放动画。

## 4 推荐 12 个键

| 功能 | 动作编号 |
|---|---|
| 主队进球（自动加分） | `home_goal` |
| 客队进球（自动加分） | `away_goal` |
| 主队比分 −1 | `home_score_minus` |
| 客队比分 −1 | `away_score_minus` |
| 比分条 显示 / 隐藏 | `scoreboard_toggle` |
| 比赛时钟 开始 / 暂停 | `sb_clock_toggle` |
| 计时器 显示 / 隐藏 | `clock_toggle` |
| 黄牌 | `card_yellow` |
| 红牌 | `card_red` |
| 球员信息条 | `player_show` |
| 名单 隐藏 | `lineup_hide` |
| 全部图形下屏 | `hide_all` |

配置页也提供全部 **44 个动作**：单独加减比分、比赛时钟和独立计时器、四份名单、六种发球、Logo、重播进球和撤下事件动画。可以放进其他页面或文件夹。

## 5 准备球员和名单

在网页面板填写球员、判罚原因、球队或名单，点新增的“保存内容（不播放）”或“保存名单（不上屏）”。再按 D200 播放对应画面。也可用 D200 卡片的“保存事件和名单内容（不播放）”一次准备所有内容。

- 主/客队进球：使用服务器已保存的球队名称和颜色，比分加 1，同时播放已保存的进球球员。
- 重播进球：仅播放上一次已保存的进球画面，比分不变。
- 比分 ＋1 / −1：只改分数，不播放庆祝；减分最低到 0。
- 红黄牌：读取已保存的号码、姓名、球队、原因。
- 全部图形下屏：隐藏比分条、计时器、名单、Logo，并撤下瞬时动画；时间仍继续运行，需停止时另按暂停。
- 网页面板会读取外部改分，保持显示同步；两边同时点加分时在服务器累计，不使用旧比分覆盖。

## 6 在一个按键显示实时比分（可选）

若 API Request 中提供“获取结果 / Get Result”动作，可使用 GET 请求状态 URL，响应字段填写 `{{score.home}} : {{score.away}}`，并开启 2 秒状态轮询。显示结果功能按官方公开示例核对，实际名称以应用商店安装版本为准。

## 7 排查和迁移

- 控制面板或 D200 配置页显示连接失败：确认工作副本服务器已启动，当前 URL 的端口正确。
- 返回 405：动作方法改成 POST；状态轮询方法设 GET。
- 能改分但图形没上屏：检查 vMix 浏览器输入地址、尺寸 1920×1080 和叠层；打开预览页可先检查。
- 文字与预期不同：先在控制面板保存内容。只修改输入框不会写入服务器。
- 改用 8124 时，从对应端口的配置页重新复制地址，已填在 D200 中的地址也要同步修改。
- “下载配置清单”导出每个键的 URL、方法、请求体、状态字段和官方插件参数名，供配置与迁移使用。

## 8 验证范围

已用临时状态完成 Node 和 Windows PowerShell 5.1 的 44 个动作、重复触发、并发加分、读写失败回滚及只读轮询测试；用 Edge 无界面验证配置页、上屏与面板联动。尚未在实际 D200 按键上完成硬件实测。真实比赛 state.json、原项目和 Ulanzi Studio 的现有插件/预设均未修改。

官方参考：

- [API Request 使用教程](https://bbs.ulanzistudio.com/thread-45-1-1.html)
- [官方 API Request 示例及请求/轮询实现](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK/tree/main/demo/com.ulanzi.APIRequest.ulanziPlugin)

完整名单：选择「两队首发与替补」或使用 `/api/d200/action/lineup_all`，同时显示两队首发、替补。推荐按键已包含它；四个单独名单按键仍可用。更新后重启控制服务让动作目录重新加载。

换人：先在控制页「球员事件 → 换人」选好双方球员并「保存换人（供 D200 执行）」，再配置 POST `/api/d200/action/sub_show`，即可执行并播放。重复执行已完成的同一次换人会返回失败，不会重复改动场内名单。
