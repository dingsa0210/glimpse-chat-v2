# Glimpse Chat Windows

Windows 有两种交付形式，二者使用相同的线上 PWA：

1. **立即安装**：运行 `./install-from-edge.ps1`，然后在 Edge 地址栏点击“安装 Glimpse Chat”。安装后拥有独立窗口、开始菜单入口和任务栏固定能力。
2. **Microsoft Store / MSIX**：运行 `./open-pwabuilder.ps1`，通过 PWABuilder 生成 `.msixbundle` 和兼容包。

## 生成商店安装包

PWABuilder 的 Windows 包必须绑定 Microsoft Partner Center 预留应用的三个真实值：Package ID、Publisher display name、Publisher ID。仓库中的 `pwabuilder-identity.template.json` 只用于记录字段结构，不能直接打包。

1. 确认 `https://glimpsechat.com/manifest.json`、`/sw.js` 和所有图标均可公开访问。
2. 运行 `./open-pwabuilder.ps1`。
3. 在报告页修复必需项，选择 **Package For Stores → Windows → Generate Package**。
4. 填入 Partner Center 的三个身份字段并下载 ZIP。
5. 解压后运行 PWABuilder 附带的 `install.ps1` 做本机测试。
6. 将 `.msixbundle`（以及兼容旧版 Windows 时的 `.classic.appxbundle`）上传 Partner Center。

常规网页更新无需重新发布 Windows 包。只有清单身份、图标、原生权限或商店元数据变化时，才递增四段式版本号并重新生成包。
