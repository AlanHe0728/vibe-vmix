# 转播包装工作台

给 vMix 用的转播包装工具。按需加载舞台节目、足球赛事和 AE 直播连接。舞台支持分轮节目单、透明动画报幕、歌词模板和独立晋级名单网页。各模块可在 PVW 调整布局，再应用到播出。

- 正式版 2.1.0 · [GitHub 下载](https://github.com/AlanHe0728/vibe-vmix/releases/tag/v2.1.0) · [Gitee 下载](https://gitee.com/alanhe0728/vibe-vmix/releases/tag/v2.1.0)
- [历史版本](https://github.com/AlanHe0728/vibe-vmix/releases)

完整解压 Windows x64 便携包，运行「转播包装工作台.exe」。启用所需模块，在「设置 → 上屏地址」复制地址，添加为 vMix 的 1920 × 1080 网页输入。

在「设置 → 工作区 → 界面外观」可以选择黑红暗色，保存后应用到工作台、控台和预览工具。

[工作台使用说明](docs/WORKSPACE_2.md) · [足球使用说明](docs/USAGE.md) · [Adobe 插件](ae-plugin/README.md) · [反馈问题](https://github.com/AlanHe0728/vibe-vmix/issues)

## API 文档

2.1.0 的舞台歌词字幕和晋级名单共用 `.vmix-graphics.json` 格式。可以让 AI 按 Schema 生成 JSON，也可以用 Photoshop 或 After Effects 的「转播包装模板制作」面板导出，再通过舞台控台或本机 API 导入。启用舞台模块后，以「设置 → 上屏地址」显示的端口为准，默认 `http://127.0.0.1:8125`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/stage/design-templates/validate` | 校验模板 JSON |
| `POST` | `/api/stage/design-templates` | 导入模板，使用 `?replace=1` 覆盖同 ID 的模板 |
| `GET` | `/api/stage/design-templates` | 查看已导入的模板 |
| `GET` | `/api/stage/design-templates/{id}` | 导出可迁移的模板 JSON |

[舞台模板 API 与封装规范](docs/stage-design/API与封装规范.md) · [JSON Schema](docs/stage-design/stage-design-v2.schema.json) · [歌词字幕示例](docs/stage-design/caption-example.vmix-graphics.json) · [晋级名单示例](docs/stage-design/promotion-example.vmix-graphics.json) · [通用控台 API v1](docs/API.md)

本版本未完全验证，可能存在BUG，如遇BUG请与开发者联系
