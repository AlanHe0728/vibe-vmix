# 转播包装 · Live Bridge

连接 Windows 上支持 CEP 的 After Effects 和转播包装工作台。

1. 退出 AE，在插件目录运行 `powershell -ExecutionPolicy Bypass -File .\安装插件.ps1 -EnableUnsignedExtensions`。该选项允许加载未签名 CEP 扩展。
2. 启动 AE，在「首选项 → 脚本与表达式」启用「允许脚本写入文件和访问网络」，再从「窗口 → 扩展」打开 Live Bridge。
3. 在工作台启用「AE 直播连接」，把模块提供的连接地址和配对密钥填入插件，选中合成并连接。

用 `LIVE:` 标记文字、滑块、颜色和开关控件。点击「持续生成当前画面」刷新预览。要播放动画，渲染 AE 工作区，再将生成的缓存添加到 vMix。

本版本未完全验证，可能存在BUG，如遇BUG请与开发者联系
