# 转播包装工作台

面向 vMix 的转播包装项目，覆盖足球比赛、歌唱、舞蹈、武术与综合演出。新版采用 Windows 独立窗口，舞台、足球和 AE 直播连接分别作为可选模块，按需加载。

**当前正式版为足球转播控制台 1.1.0；包含舞台与 AE 功能的 2.0.0-beta.1 为 Beta 测试版。**

> **我尚未对 Beta 版本进行充分测试。** 真实直播环境，以及 AE、vMix、NewBlue 的连接与播出流程仍需验证。使用前请备份数据，并在自己的设备上完整测试。

## 下载

| 渠道        | 当前版本                      | GitHub                                                                          | Gitee                                                                    |
| ----------- | ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 正式版      | 1.1.0 · 足球转播控制台        | [下载正式版](https://github.com/AlanHe0728/vibe-vmix/releases/tag/v1.1.0)       | [下载正式版](https://gitee.com/alanhe0728/vibe-vmix/releases/tag/v1.1.0) |
| Beta 测试版 | 2.0.0-beta.1 · 转播包装工作台 | [下载 Beta](https://github.com/AlanHe0728/vibe-vmix/releases/tag/v2.0.0-beta.1) | [Beta 源码分支](https://gitee.com/alanhe0728/vibe-vmix/tree/beta)        |

[GitHub 历史版本（含浏览器源码版）](https://github.com/AlanHe0728/vibe-vmix/releases) · [Gitee 发行版本](https://gitee.com/alanhe0728/vibe-vmix/releases)

`main` 维护正式版，`beta` 维护测试版。Beta 使用预发行标记，不会替代最新正式版。两个渠道目前均通过发行页手动下载更新，尚无自动更新器。

Windows 便携包需完整解压后运行 EXE。浏览器源码版需安装 Node.js 并按对应版本说明启动；GitHub 历史发行页中的 `browser-source.zip` 是源码包。

## 2.0 Beta 包含什么

| 模块        | 功能                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| 舞台节目    | 歌唱、舞蹈、武术等节目单；四套模板；自定义颜色、字体与布局；台标、活动 Logo、赞助商、节目字幕条与转场 |
| 足球赛事    | 比分、比赛时钟、名单、进球、红黄牌、球员信息、换人及 D200 控制                                        |
| AE 直播连接 | 配套 CEP 开发版插件；文字、数值、颜色和开关控件；交互画面刷新、动画缓存及 vMix 播放控制               |

- **逐句歌词**：每行录入一句，保存后可直接选句、播放上一句或下一句；编辑不会自动覆盖正在播出的句子。
- **统一独立预览**：模块标签、所有已加载模块的组合预览，以及双画面、仅 PVW、仅 PGM 三种显示方式。
- **先预览，再应用**：在 PVW 拖动或输入坐标，点击“将全部调整应用到播出”后才更新模块输出。组合预览不包含 vMix 摄像机，实际叠放顺序以 vMix 为准。
- **按需加载**：未选模块不启动；关闭预览或卸载闲置模块可减少占用。实际性能取决于画面、素材与本机设备。

GT 文件交由 vMix 原生渲染；AE 工程可链接、打开或调用本机引擎渲染；NewBlue 工程需在原软件编辑后导出视频。AE 交互画面不保证复杂合成的广播帧率。

## 开始使用 Beta

1. 下载 Beta Windows x64 便携包，完整解压后运行 `转播包装工作台.exe`。需要系统的 .NET Framework 4.7.2+ 与 WebView2；无需另装 Node.js 或打开浏览器。
2. 勾选需要的模块并应用，从左侧进入。未选择的模块不加载。
3. 在模块中准备内容，打开“预览与布局”检查画面。舞台歌词每行一句，保存后逐句播出。
4. 复制模块的上屏地址，在本机 vMix 中添加网页浏览器输入，分辨率设为 1920×1080。播出期间保持工作台运行。

vMix、AE、NewBlue 及其字体、模板、插件需要自行安装。正式版 1.1.0 的操作见[足球使用说明](docs/USAGE.md)。

## 资料与开发

- [Beta 使用、数据迁移与构建](https://github.com/AlanHe0728/vibe-vmix/blob/beta/docs/WORKSPACE_2.md)
- [AE 插件安装与能力范围](https://github.com/AlanHe0728/vibe-vmix/blob/beta/ae-plugin/README.md)
- [足球使用说明](docs/USAGE.md) · [比赛配置格式](docs/MATCH_CONFIG.md) · [D200 设置](docs/D200_SETUP.md)
- [Beta 更新记录](https://github.com/AlanHe0728/vibe-vmix/blob/beta/docs/CHANGELOG.md) · [架构](https://github.com/AlanHe0728/vibe-vmix/blob/beta/docs/ARCHITECTURE.md) · [API](https://github.com/AlanHe0728/vibe-vmix/blob/beta/docs/API.md)

数据保存在便携程序的 `data` 目录。备份、升级或迁移前请先退出软件，保留旧数据；外部链接的工程与素材另行备份。正式版与 Beta 请放在不同目录使用。

开发时使用 Node.js 22+。克隆 `beta` 分支后执行 `npm ci`、`npm run start:workspace` 启动开发服务；构建 Windows EXE 的依赖与步骤见 Beta 构建文档。`main` 分支的足球浏览器版使用 `npm start` 启动。

源码：[GitHub](https://github.com/AlanHe0728/vibe-vmix) · [Gitee](https://gitee.com/alanhe0728/vibe-vmix)。问题反馈：[GitHub Issues](https://github.com/AlanHe0728/vibe-vmix/issues) · [Gitee Issues](https://gitee.com/alanhe0728/vibe-vmix/issues)。

项目许可证见 [LICENSE](LICENSE)，第三方组件遵循各自随附许可。
