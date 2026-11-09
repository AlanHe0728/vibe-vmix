# 转播包装工作台 2.0.0-beta.1

> **Beta 测试版：我尚未对本版本进行充分测试。** 尤其是真实直播环境，以及 AE、vMix 和 NewBlue 的连接与播出流程，仍需实际验证。程序可能存在问题；用于重要播出前，请先备份数据并在自己的设备上完整测试。

面向 vMix 的 Windows 桌面包装程序。首次选择模块，未选择的模块不加载；双击 EXE 使用，无需打开浏览器或另装 Node。需要系统的 .NET Framework 4.7.2+ 与 WebView2。

## 下载渠道

| 渠道 | 版本 | 下载 | 适用情况 |
| --- | --- | --- | --- |
| 正式版 | 1.1.0 足球转播控制台 | [正式版下载](https://github.com/AlanHe0728/vibe-vmix/releases/latest) | 已公开的足球包装；[Gitee 镜像](https://gitee.com/alanhe0728/vibe-vmix/releases/tag/v1.1.0) |
| Beta 测试版 | 2.0.0-beta.1 转播包装工作台 | [Beta 下载](https://github.com/AlanHe0728/vibe-vmix/releases/tag/v2.0.0-beta.1) | 舞台、足球与 AE 模块；尚未充分测试 |

历史版（包括浏览器源码版）见 [全部 Releases](https://github.com/AlanHe0728/vibe-vmix/releases)。`main` 为正式版分支，`beta` 为测试版分支；Beta 使用 GitHub 的预发行标记，不会替代最新正式版。两个渠道目前通过发行页手动下载更新，不包含自动更新器。

- **舞台节目**：歌唱、舞蹈、武术等节目单，四套模板、自定义颜色和坐标，台标、活动 Logo、赞助商、逐句歌词字幕与转场。
- **足球赛事**：保留现有比分、计时、名单、球员事件和 D200。
- **AE 直播连接**：随包 CEP 开发版插件，提供文字、数值、颜色、开关、交互画面刷新、动画缓存与 vMix 播放控制。需 AE 真机联调，不保证复杂合成的广播帧率。

GT 文件由 vMix 原生渲染；AE 原工程可链接、打开并调用本机引擎渲染；NewBlue 原工程在原软件编辑后导出视频。专有工程不会直接转为内置模板。

[2.0 使用与构建说明](docs/WORKSPACE_2.md) · [AE 插件安装](ae-plugin/README.md) · [资源采样](docs/native-resources.json)

预览与布局在独立窗口中提供模块标签和总览，可切换双画面、仅 PVW 或仅 PGM。拖动或输入坐标只改变 PVW，点击“将全部调整应用到播出”后才更新对应模块输出。总览按足球、舞台、AE 顺序叠加，不包含 vMix 摄像机，实际叠放以 vMix 为准。

也可以按[构建说明](docs/WORKSPACE_2.md#开发与验证)自行构建 Beta：执行 `npm run build:workspace` 生成 EXE 文件夹和 ZIP，随后用 `npm start` 启动；`npm run start:workspace` 用于开发服务。

数据保存在程序文件夹的 `data`，关闭后备份。旧版可迁入原 `data/state.json` 后启用足球；外部工程另行备份。已运行部分自动化测试，但尚未完成真实 AE / NewBlue / vMix 环境联调。

## 其他文档

- [足球功能与操作](docs/USAGE.md)、[比赛配置格式](docs/MATCH_CONFIG.md)、[D200 按键设置](docs/D200_SETUP.md)
- [架构说明](docs/ARCHITECTURE.md)、[API 文档](docs/API.md)、[更新记录](docs/CHANGELOG.md)
- [足球 1.1.0 历史便携版](https://gitee.com/alanhe0728/vibe-vmix/releases/tag/v1.1.0)、[第二版足球包装](v2/README.md)

项目许可证见 [LICENSE](LICENSE)。源码：[GitHub](https://github.com/AlanHe0728/vibe-vmix) 和 [Gitee](https://gitee.com/alanhe0728/vibe-vmix)。
