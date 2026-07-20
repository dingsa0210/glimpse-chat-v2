# Glimpse Chat

Web/PWA-first cross-border chat application for Windows browsers and Android phones.

## Stack

- Web: Next.js, React, TypeScript, Tailwind CSS
- API: NestJS, Socket.IO, Prisma
- Data: PostgreSQL, Redis
- Media storage: MinIO locally, S3-compatible storage in production

## Layout

- `apps/web`: responsive Web/PWA client
- `apps/api`: REST + WebSocket backend
- `packages/shared`: shared TypeScript types and constants

## Local Development

1. Install dependencies:

   ```powershell
   pnpm install
   ```

2. Start local infrastructure:

   ```powershell
   docker compose up -d
   ```

3. Copy environment files:

   ```powershell
   Copy-Item apps\api\.env.example apps\api\.env
   Copy-Item apps\web\.env.example apps\web\.env.local
   ```

4. Generate Prisma client and run migrations:

   ```powershell
   pnpm db:generate
   pnpm db:migrate
   ```

5. Start development servers:

   ```powershell
   corepack pnpm dev
   ```

## Current Dev URLs

- Windows local: `http://127.0.0.1:3100` via `corepack pnpm dev:web`
- LAN / Android phone: `http://<your-computer-lan-ip>:3101` via `corepack pnpm dev:web:lan`

The current verified LAN IP is `10.119.123.108`; it can change when the network changes.

## Realtime Dev Services

- Web/PWA: `http://127.0.0.1:3101` via `corepack pnpm dev:web:lan`
- API + Socket.IO: `http://127.0.0.1:4100` via `corepack pnpm dev:api`
- Android on same Wi-Fi: open `http://192.168.31.229:3101` and ensure Windows firewall allows ports `3101` and `4100`.
- HTTPS phone test: open `https://10.119.123.108:3443` after installing the local Root CA certificate described in `10_环境配置/本地HTTPS测试证书/安装说明-10.119.123.108.txt`.
## One-Command Local Startup

After Docker Desktop is running, start infrastructure plus Prisma-mode API and Web with:

```powershell
.\启动开发服务-GlimpseChat.ps1
```

Use `-SkipInfraCheck` when Docker compose services are already running and you only need to start API/Web.

## PWA / Android / Windows

Glimpse Chat 可作为 PWA 安装，并提供 Android Trusted Web Activity 与 Windows PWABuilder/MSIX 发布配置。完整说明见 [`docs/PWA_NATIVE_RELEASE.md`](docs/PWA_NATIVE_RELEASE.md)。
