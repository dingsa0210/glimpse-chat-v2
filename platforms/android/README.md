# Glimpse Chat Android (TWA)

这个目录是 `https://glimpsechat.com` 的 Trusted Web Activity Android 外壳，包名固定为 `com.glimpsechat.app`。网页功能更新会随线上站点自动生效；包名、图标、权限或原生依赖改变时才需要重新发布 AAB/APK。

## 构建环境

- Node.js 14.15 或更高版本。
- JDK 17（不能使用更低或更高主版本）。
- Android command-line tools / Android SDK。
- Bubblewrap 由脚本固定使用 `1.24.1`，无需全局安装。

首次运行 `./build.ps1` 时，Bubblewrap 会询问 JDK 和 Android SDK 路径，并把本机路径保存在用户目录的 `.bubblewrap/config.json` 中。

## 首次签名构建

```powershell
cd platforms/android
./build.ps1
```

如果 `android-keystore.jks` 不存在，Bubblewrap 会询问是否创建。密钥库、别名密码必须离线备份；密钥文件和密码均被 Git 忽略，不能提交。成功后输出通常包含 `app-release-signed.apk`（真机测试）和 `app-release-bundle.aab`（Google Play）。

只验证工程能否编译、不进行签名：

```powershell
./build.ps1 -Unsigned
```

修改 `twa-manifest.json` 后重新生成 Android 工程：

```powershell
./sync-project.ps1
```

## 去掉浏览器地址栏（Digital Asset Links）

取得发布证书 SHA-256 指纹：

```powershell
& "$env:JAVA_HOME/bin/keytool.exe" -list -v -keystore ./android-keystore.jks -alias glimpsechat
```

在云服务器 `.env` 中设置并重启 Web 服务：

```dotenv
ANDROID_TWA_PACKAGE_ID=com.glimpsechat.app
ANDROID_TWA_SHA256_CERT_FINGERPRINTS=AA:BB:...:FF
```

访问 `https://glimpsechat.com/.well-known/assetlinks.json`，返回内容必须包含正确包名和发布证书指纹。启用 Google Play App Signing 后，还要加入 Play Console 的“应用签名证书”SHA-256 指纹（多个指纹用分号分隔）。

## 版本发布

每次上传 Google Play 前：增大 `appVersionCode`，修改 `appVersion`，执行 `./sync-project.ps1` 和 `./build.ps1`，并始终使用同一份永久签名密钥。最后在真机验证登录、通知、麦克风、摄像头、语音播放和文件上传。
