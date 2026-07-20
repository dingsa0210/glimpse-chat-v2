# Glimpse Chat PWA、Android 与 Windows 发布说明

## 架构

- Web/PWA：Next.js 应用，站点为 `https://glimpsechat.com`。
- Android：Bubblewrap 生成的 Trusted Web Activity，包名 `com.glimpsechat.app`。
- Windows：Edge 安装式 PWA；需要上架时由 PWABuilder 生成 MSIX。

三端共享同一套网页和 API，不复制业务代码。线上 Web 更新会自动进入 Android/Windows 外壳。

## PWA 安全缓存策略

`apps/web/public/sw.js` 只缓存离线页、应用图标以及 `/_next/static/` 下带构建哈希的静态资源。登录、API、Socket.IO、聊天消息、语音、图片、视频、附件和 Digital Asset Links 均不进入 Service Worker 缓存。

页面导航使用网络优先；断网时只显示离线提示，不显示可能过期或属于其他账号的聊天页面。

## 发布前检查

```powershell
curl.exe -I https://glimpsechat.com/manifest.json
curl.exe -I https://glimpsechat.com/sw.js
curl.exe -I https://glimpsechat.com/icons/icon-512.png
curl.exe https://glimpsechat.com/.well-known/assetlinks.json
```

还应在 Chrome/Edge DevTools 的 **Application** 面板验证 Manifest、Service Workers 和 Installability，并在 Android 真机与 Windows 独立窗口内完成登录、聊天、语音、通知、麦克风、摄像头和上传测试。

Android 具体步骤见 `platforms/android/README.md`，Windows 具体步骤见 `platforms/windows/README.md`。
