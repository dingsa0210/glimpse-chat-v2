# Glimpse CAXA 原文件矢量预览转换器

`GlimpseCaxaConverter.crx` 是基于 CAXA CAD 2024 ObjectCRX SDK 构建的 x64 插件。API 启动 CAXA CAD 后，插件直接读取 EXB/CAXA 原文件的模型空间图元并输出 SVG，不依赖同名 DWG/PDF，也不是放大内嵌缩略图。

## 运行依赖

- CAXA CAD 2024 与有效的本机使用环境。
- 插件安装到 `C:\Program Files\CAXA\CAXA CAD\2024\Modules\GlimpseCaxaConverter.crx`。
- `CxAutorun.cx` 为 `ID_DEFAULT_TMPL` 和 `ID_DFT_TMPL` 注册插件。

## API 配置

- `CAXA_CAD_PATH`：可选，CAXA CAD 可执行文件路径。
- `CAXA_CRX_PLUGIN_PATH`：可选，CRX 插件路径。
- 插件通过 `GLIMPSE_CAXA_INPUT`、`GLIMPSE_CAXA_OUTPUT`、`GLIMPSE_CAXA_STATUS` 接收单次任务参数。

转换任务在 API 内串行执行，超时为 120 秒；失败时才回退到原有系统缩略图路径。生成的 `*-caxa-vector-v132.svg` 会作为预览缓存复用。

## 源码与构建

源码保存在 `source/`，Release x64 输出为 `GlimpseCaxaConverter.crx`。当前支持线、圆弧、圆、椭圆、多段线、样条、文字、多行文字及递归块引用展开。遇到不能安全分解的专有复杂实体时会跳过该实体，避免 CAXA 进程卡死。
