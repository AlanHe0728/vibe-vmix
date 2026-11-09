# 统一 API v1

2.0 工作台的 `GET /api/workspace` 发现模块和实际地址；`POST /api/workspace` 接收 `{ "enabled": ["stage", "football", "ae-live"] }`，允许空列表卸载全部。每个模块有独立地址，未启用时没有相应监听服务。以下 v1 API 适用于足球与舞台。舞台额外提供 `/api/stage/templates`、`library`、`upload`、`register`、`render`、`vmix`；AE 桥接使用 `/api/ae/state`、`pairing`、`command`、`output`、`settings`、`vmix` 以及需要 Bearer 密钥的 `/api/ae/agent/{hello,poll,result,frame}`。不要将 AE 控制接口当作无损视频协议；其画面为最新 PNG。新接口细节与限制见 [WORKSPACE_2.md](WORKSPACE_2.md)。

Node 服务与便携软件提供同一组接口。默认原版 `http://localhost:8123`，第二版 `http://localhost:8124`；便携版端口被占用时会自动换端口，以实际地址为准。服务实例决定当前模块，客户端不通过请求临时切换赛事。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/module` | 模块 ID、名称、API 版本与能力列表 |
| GET | `/api/v1/commands` | 当前模块的命令目录，不含执行函数 |
| GET | `/api/v1/status` | 轻量业务状态 |
| GET | `/api/v1/state` | 完整模块状态，支持 ETag / 304 |
| POST | `/api/v1/state` | 提交局部状态，由模块校验并合并 |
| POST | `/api/v1/commands/:id` | 在最新状态上执行已注册命令 |
| OPTIONS | 任一路径 | CORS 预检 |

写入使用 JSON 对象，上限 32 MiB。命令无参数时可以提交 `{}` 或空正文。命令 ID 大小写敏感；包含点号的 `title.show` 等名称可以直接使用。

模块状态与 payload 的字段由模块定义，核心不会要求舞台节目提交足球字段。高频轻量显示优先读取 `status`；需要完整模板内容时使用带 ETag 的 `state`。

## 发现能力

`GET /api/v1/module` 返回：

```json
{
  "ok": true,
  "module": {
    "id": "football",
    "name": "足球赛事",
    "apiVersion": 1,
    "capabilities": ["score", "match-clock", "timer", "roster", "graphics"]
  }
}
```

第二版另有 `batch-substitutions` 能力。`GET /api/v1/commands` 返回 `{"ok":true,"commands":[{"id":"home_score_plus","label":"…"}]}`，以服务实际目录为准。

## 读取与写入

`GET /api/v1/state` 直接返回状态对象，沿用现有渲染器的读取方式。服务返回 `ETag`；后续携带 `If-None-Match`，未变化时返回 304 且没有正文。不要把 304 当成 JSON 解析。

`GET /api/v1/status`、`POST /api/v1/state` 返回 `{"ok":true,"status":{...}}`。

例如足球比分更正：

```http
POST /api/v1/state
Content-Type: application/json

{"scoreHome":2,"scoreAway":1}
```

局部写入是一次事务。多人控制下加分建议使用命令或足球的 `scoreHome_delta`，避免先读取比分再提交覆盖值产生丢分。

```http
POST /api/v1/commands/home_score_plus
Content-Type: application/json

{}
```

返回 `{"ok":true,"command":"home_score_plus","status":{...}}`。`home_score_plus` 只修改比分；`home_goal` 沿用既有 D200 规则，包含加分与进球动画。

## 通用客户端

网页加载 `/shared/api-client.js` 后可使用 `BroadcastAPI`。该脚本也支持 CommonJS，并可注入 `fetch`。

```js
const api = BroadcastAPI.create({ baseURL: location.origin });
const module = await api.describe();
const commands = await api.commands();
const status = await api.status();
const state = await api.getState();

await api.execute('home_score_plus');
await api.update({ scoreHome: 2 });

const snapshot = await api.readState();
const next = await api.readState(snapshot.etag);
if (!next.notModified) render(next.state);
```

完整状态轮询由调用方控制；本次不提供 WebSocket。足球现有播出页仍以 200ms 间隔、条件 GET 方式同步，页面只计算时钟显示，不回写计时值。

旧控台通过 `stateURL` 与 `statusURL` 配置接入同一个客户端，以保留旧响应格式；新模块直接使用默认 v1 路径。

## 舞台示例

运行 `npm run example:stage` 后，在 8125 端口调用：

```http
POST /api/v1/commands/title.show
Content-Type: application/json

{"title":"颁奖典礼","subtitle":"最佳球员"}
```

其他命令为 `title.hide`、`timer.set`（payload：`{"durationMs":120000}`）、`timer.start`、`timer.pause`。状态包含标题、显隐、cue 序号和计时锚点；同一个标题再次执行也会产生新 cue。

该示例只有 API，没有舞台网页控台或播出模板。未来模板直接消费这些状态与命令即可。

## 错误与事务语义

错误格式：`{"ok":false,"error":"说明","code":"INVALID_REQUEST"}`。共享客户端会抛出带 `status` 和 `code` 属性的 Error。

| HTTP | 常见 code | 含义 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | JSON、payload 或业务校验失败 |
| 404 | `UNKNOWN_COMMAND` / `NOT_FOUND` | 命令或路径不存在 |
| 405 | `METHOD_NOT_ALLOWED` | 方法错误 |
| 413 | `BODY_TOO_LARGE` | 请求体超过 32 MiB |
| 500 | `SAVE_FAILED` | 文件保存失败，状态保持原值 |
| 500 | `INTERNAL_ERROR` | 未预期的服务错误 |

每次命令/写入由单个 Node 进程串行执行同步事务，读取最新已提交状态。收到成功才表示已持久化。不要并发启动多个进程写同一状态文件。

命令不提供请求级幂等键；网络超时后不要盲目重试加分或播出命令，应先读取状态确认。足球换人仍会拒绝已执行的同一组球员交换。

## 旧接口

`/state`、`/state.json`、`/api/d200/actions`、`/api/d200/status`、`/api/d200/action/:id` 继续可用，与 v1 共用一个核心状态与事务入口。旧 POST 响应保留 `score/onfield/controls` 顶层字段；新 API 使用 `status` 容器。

PowerShell 后备服务只提供旧足球接口；扩展模块和 v1 API 使用 Node 服务。原有 vMix 模板、D200 设置无需修改。
