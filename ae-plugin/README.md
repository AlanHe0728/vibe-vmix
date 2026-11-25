# 转播包装 Adobe 插件

支持 Windows 上使用 CEP 的 After Effects 和 Photoshop。Live Bridge 面板用于 AE 直播连接，模板制作面板用于准备包装素材。

1. 退出 Adobe 软件，在插件目录打开 PowerShell，运行 `powershell -ExecutionPolicy Bypass -File .\安装插件.ps1 -EnableUnsignedExtensions`。这个选项允许 Adobe 加载未签名 CEP 扩展。
2. 重启 Adobe 软件，从「窗口 → 扩展（旧版）」打开「转播包装模板制作」，按面板提示准备、编辑和导出模板。
3. 舞台模板选择「舞台歌词字幕」或「舞台晋级名单」，插入实时字段再导出为 JSON。在工作台对应的字幕模板或名单样式入口导入。
4. 在 After Effects 打开「转播包装 · Live Bridge」。在「首选项 → 脚本与表达式」启用「允许脚本写入文件和访问网络」，在工作台启用「AE 直播连接」，把连接地址和配对密钥填入插件，再选择合成并连接。

用 `LIVE:` 标记文字、滑块、颜色和开关。要播放动画，先生成 AE 工作区缓存，再将它添加到 vMix。

本版本未完全验证，可能存在BUG，如遇BUG请与开发者联系
