# 问题修复记录

> 按时间倒序记录，每项包含：问题现象、根因分析、修复方法。

---

## 12. 文件消息发送后对方看不到、刷新后消失

**时间**：2026-07-13

**现象**：用户发送文件后，对方或群组里看不到该文件消息；发送者刷新页面后文件也消失了。

**根因**：两个独立 bug 叠加导致。

**Bug 1 — 数据库 MessageType 枚举缺少 FILE 值（主因）**：
Prisma schema 中定义了 `MessageType { TEXT, IMAGE, VIDEO, AUDIO, FILE }`，但迁移文件中只创建了 TEXT/IMAGE/VIDEO，后续仅添加了 AUDIO。`FILE` 从未被加入 PostgreSQL 枚举。保存文件消息时 Prisma 生成 `INSERT ... VALUES (... 'FILE'::"MessageType" ...)`，PostgreSQL 因枚举值不存在而直接报错。异常在 `saveMessage()` 中重新抛出，导致 `message:new` 广播从未执行，其他用户永远收不到；发送者刷新后乐观更新的本地状态也丢失。

**Bug 2 — 环境变量名不匹配**：
代码 `media.service.ts:61` 读取 `MEDIA_STORAGE_DIR`，但 `docker-compose.yml` 和 `.env.example` 中设置的是 `MEDIA_UPLOAD_DIR`，变量名不一致。Docker 中配置的上传目录 `/app/uploads`（持久卷）被忽略，文件落入容器内的默认非持久化目录，容器重启后已上传文件丢失。

**修复**：
1. 执行 `ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'FILE';` 在数据库中补齐枚举值
2. 新增 Prisma 迁移文件 `migrations/20260713000000_add_file_message_type/migration.sql` 确保后续 `prisma migrate deploy` 不遗漏
3. `docker-compose.yml` 和 `.env.example` 中 `MEDIA_UPLOAD_DIR` → `MEDIA_STORAGE_DIR`，统一变量名

> ⚠️ **部署提醒**：如果在已有数据库上部署但尚未执行过该迁移，需手动执行上述 SQL 语句。非 Docker 环境下注意 `MEDIA_STORAGE_DIR` 应指向可写路径，或注释掉让代码使用默认值 `99_输出结果/glimpse-media-uploads/`。

---

## 11. 群聊消息头像回退逻辑不合理

**时间**：2026-07-11

**现象**：群聊中没上传头像的用户，消息旁显示群头像，而非像单聊那样显示昵称首字母。

**根因**：`senderAvatarUrl` 的 fallback 用了 `?? selected.avatarUrl`（群头像），掩盖了 `Avatar` 组件自身的首字母回退逻辑。

**修复**：去掉 `?? selected.avatarUrl`，让 `avatarUrl` 为 `undefined` 时自然落到 `Avatar` 组件的 `initials`（昵称前两位大写字母）。

---

## 10. 群聊消息所有人头像相同

**时间**：2026-07-11

**现象**：群聊中所有成员的消息左侧头像都是群头像，无法区分发送者。

**根因**：第 5577 行获取别人消息头像时用了 `selected.avatarUrl`，而 `selected` 在群聊中是群会话对象，`selected.avatarUrl` 是群头像。

**修复**：对群聊消息按 `message.senderId` 从 `groupMembers` 中查找发送者的真实 `avatarUrl`：

```typescript
const senderAvatarUrl = mine
  ? (...)
  : selected.type === "group"
    ? groupMembers.find(m => m.user.id === message.senderId)?.user.avatarUrl
    : selected.avatarUrl;
```

---

## 9. /conversations 页面再次 429 Too Many Requests（trust proxy 缺失）

**时间**：2026-07-11

**现象**：修复 nginx 路由后 `/conversations` 页面仍间歇性返回 429。

**根因**：NestJS/Express 未配置 `trust proxy`。nginx 通过 `X-Forwarded-For` 传递真实客户端 IP，但 Express 默认不信任代理头，`req.ip` 始终返回直连 IP（nginx 的 `127.0.0.1`）。

全局限频 key 为 `ip:path`，导致**所有用户**的请求都被标记为 `127.0.0.1:/conversations`，共享 120次/分钟的配额。任何用户多刷新几次页面，就会耗尽全局配额，其他用户也一并被 429。

**修复**：在 `main.ts` 添加 `trust proxy` 配置：

```typescript
app.getHttpAdapter().getInstance().set("trust proxy", true);
```

Express 此后会信任 `X-Forwarded-For` 头，`req.ip` 返回真实客户端 IP，每个用户独立享有 120次/分钟的限额。

---

## 8. Cannot read properties of undefined (reading 'map') — 对话历史报错

**时间**：2026-07-11

**现象**：对话历史页面报 `Cannot read properties of undefined (reading 'map')`，前端白屏。

**根因**：nginx `location = /conversations` 被改为无条件走 web（Next.js），但前端 API 调用 `GET /conversations`（获取对话列表）也使用同一 URL。API 调用被路由到 Next.js 返回 HTML 页面，前端 `fetch` 解析后 `data.conversations` 为 `undefined`，调用 `.map()` 时报错。

**修复**：nginx 使用 `Content-Type` header 区分 API 调用和页面访问：

```nginx
location = /conversations {
    set $backend "web";
    if ($http_content_type = "application/json") { set $backend "api"; }
    proxy_pass http://glimpse_$backend;
    ...
}
```

- 前端 API 调用带 `Content-Type: application/json` → 路由到 API
- 浏览器页面访问不带此头 → 路由到 Web（Next.js）

同时恢复 `location /conversations/` → API（子路由如 `/conversations/:id/messages` 永远是 API 调用）。

---

## 7. 文件上传返回 500 Internal Server Error

**时间**：2026-07-11

**现象**：`POST /media/upload` 返回 500。

**根因**：重启 nginx 时 API 进程（`node dist/main.js`）被意外终止，4100 端口无人监听。nginx 代理 `/media/upload` 时无法连接上游 API。

**修复**：重新启动 API 进程，同时确保上传目录 `99_输出结果/glimpse-media-uploads/` 存在（在可写 workspace 下）。

---

## 6. /conversations 页面 429 Too Many Requests

**时间**：2026-07-11

**现象**：访问 `https://glimpsechat.com/conversations` 返回 HTTP 429，页面无法加载。

**根因**：nginx 配置中 `location = /conversations` 有一段条件逻辑：

```nginx
if ($http_authorization) { set $backend "api"; }
```

已登录用户的浏览器每次请求都带上 `Authorization` header，nginx 把 `/conversations` 页面请求错误转发到 API（4100端口）。API 全局限频 120次/分钟/IP/路径，累计命中后返回 429。

**修复**：见第 8 项，改用 `Content-Type: application/json` 区分 API 调用和页面访问。

---

## 5. 数据库连接失败

**时间**：2026-07-11

**现象**：API 启动后 `PrismaClient` 报 `Can't reach database server at 'db:5432'`。

**根因**：`.env` 中 `DATABASE_URL=postgresql://...@db:5432/...`，`db` 是 Docker 容器 hostname。本机未使用 Docker，PostgreSQL 运行在 `localhost:5432`。

**修复**：将 `.env` 中 `DATABASE_URL` 的 host 从 `db` 改为 `localhost`。

---

## 4. Redis 不可用导致验证码功能失败

**时间**：2026-07-11

**现象**：ioredis 持续刷屏 `getaddrinfo ENOTFOUND redis`，验证码发送/校验均失败。

**根因**：`.env` 中 `REDIS_URL=redis://redis:6379`，`redis` 是 Docker 容器 hostname。本机未运行 Redis。

**修复**：为 `VerificationService` 添加内存 fallback：

- 新增 `Map<string, CodeEntry>` 和 `Map<string, RateEntry>` 作为内存存储
- Redis 连接成功时走 Redis，连接失败时自动切换内存存储
- `retryStrategy: () => null` 阻止 ioredis 无限重试刷屏
- 支持验证码生成/校验/频率限制（冷却60秒、每小时最多5次、10分钟过期）

同时注释 `.env` 中 `REDIS_URL`，触发 fallback 模式。

---

## 3. pnpm 依赖丢失

**时间**：2026-07-11

**现象**：`node dist/main.js` 报 `Cannot find module 'express'`，多个运行时依赖找不到。

**根因**：系统根文件系统 `/` 被挂载为只读（`ro`）。pnpm 默认的符号链接存储（symlink store）位于只读分区，`pnpm install` 后 `node_modules` 中大量符号链接断裂。

**修复**：
1. 创建 `.npmrc` 配置：
   ```
   store-dir=/tmp/pnpm-store
   node-linker=hoisted
   ```
2. `store-dir` 指向可写临时分区
3. `node-linker=hoisted` 使用扁平化 `node_modules`（类 npm 模式），避免符号链接

---

## 2. 生产环境静态资源 400 / MIME 类型错误

**时间**：2026-07-11

**现象**：`glimpsechat.com` 页面报：
- `Refused to apply style ... MIME type ('text/html')`
- `GET .../_next/static/chunks/...js net::ERR_ABORTED 400`
- `ChunkLoadError`

**根因**：`next build` 重新构建后 JS/CSS chunk hash 变更，生产环境仍在运行旧版 Next.js 服务，旧 HTML 引用的 chunk 文件已不存在。

**修复**：重新构建前端（`next build`）并重启 Next.js 进程（`next start`），使 HTML 与静态资源版本一致。

---

## 1. 注册页验证码区域样式不一致

**时间**：2026-07-11

**现象**：新增的验证码区域使用独立样式（`space-y-2`、`flex gap-2`、`bg-brand` 大按钮、`<div>` 而非 `<label>`），与表单其他字段（Nickname/Email/Password）风格格格不入。

**根因**：验证码区域未遵循表单现有样式规范。

**修复**：改为与表单完全一致的样式：
- 外层：`<label className="block text-sm font-medium text-ink">`
- Label 文字：`Verification code`
- 输入框：`h-11 w-full rounded border border-line px-3 outline-none focus:border-brand`
- 发送按钮：边框轻量风格 `border border-line text-slate-600 hover:border-brand hover:text-brand`，不再使用满色大按钮
- 提示文案：`mt-1 text-xs text-teal-700`
