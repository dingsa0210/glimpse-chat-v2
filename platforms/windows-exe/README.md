# Glimpse Chat Windows EXE

这是直接加载 `https://glimpsechat.com` 的 Windows 桌面客户端，用于生成无需 Microsoft Store 的 x64 NSIS 安装程序。

## 构建

```powershell
cd platforms/windows-exe
npm install
npm run dist
```

`npm run dist` 会先通过 Electron 官方安装器准备运行时，再使用本地运行时构建，避免重复下载。

安装程序输出到 `release-artifacts/windows-1.0.0/`。当前安装包未使用商业代码签名证书签名，因此 Windows SmartScreen 可能在首次运行时显示提示。

桌面壳启用了 Electron 安全隔离并关闭 Node.js 页面集成；非 `glimpsechat.com` 链接会交给系统默认浏览器打开。
