# 注册邮箱验证码实现与集成说明

注册时邮箱验证码的真实实现、配置方式、运行边界，以及后续集成或重构时应关注的问题。

## 1. 需求

邮箱验证码功能使用 **Nodemailer + SMTP** 发送真实邮件，使用 **Redis** 保存验证码和发送频率；Redis 在启动时不可用或未配置时，会降级到 API 进程内存。

但是要区分“代码能力”和“当前部署配置”：

- 代码可以连接腾讯企业邮箱、Gmail 或其他标准 SMTP 服务并向外部邮箱真实投递。
- 根目录 `.env.example` 展示的是腾讯企业邮箱风格的真实 SMTP 配置。
- `apps/api/.env.example` 和当前 `docker-compose.yml` 使用 Mailpit。Mailpit 是开发环境邮件捕获器，只在 `http://localhost:8025` 展示邮件，不会向互联网真实投递。
- `docker-compose.yml` 中 API 的 SMTP 地址目前直接写成 `mailpit:1025`，并没有从宿主机透传 `SMTP_HOST` 等变量。因此，仅修改根目录 `.env` 的 SMTP 配置并不能让当前 Compose 改为真实投递，还需要修改 Compose 的 API 环境变量或用部署平台覆盖容器环境。


## 2. 完整实现逻辑

### 2.1 模块装配

`AppModule` 全局加载 `ConfigModule`，随后加载全局 `MailModule` 和 `AuthModule`。`AuthModule` 又导入 `VerificationModule`，所以 `AuthService` 可以同时注入：

- `PrismaService`：查询和创建用户；
- `VerificationService`：生成、保存和消费验证码；
- `MailService`：通过 SMTP 发送邮件；
- `JwtService`：注册成功后签发访问令牌。

SMTP transporter 在 `MailService` 构造时创建，配置也在此时读取。更改 SMTP 环境变量后必须重启 API 进程。

### 2.2 用户请求验证码

前端注册界面的 “Send code” 按钮执行：

```http
POST /auth/send-code
Content-Type: application/json

{
  "email": "user@example.com"
}
```

前端只做简单的非空和 `@` 检查；后端通过 `SendCodeDto` 的 `@IsEmail()` 做正式格式校验。全局 `ValidationPipe` 已启用 `whitelist` 和 `transform`。

`AuthService.sendVerificationCode()` 的执行顺序如下：

1. 对邮箱执行 `trim().toLowerCase()`，统一作为用户查询、验证码和限流的键。
2. 查询 Prisma `User` 表。如果邮箱已注册，返回 HTTP `409`，消息为 `Email is already registered.`。
3. 调用 `VerificationService.canSend(email)` 检查发送频率。
4. 不允许发送时返回 HTTP `429`，响应消息包含剩余等待秒数。
5. 使用 `crypto.randomInt(0, 1_000_000)` 生成密码学随机的 6 位数字，不足 6 位时在左侧补零。
6. 先保存验证码和限流状态。
7. 调用 `MailService.sendVerificationCode()`，通过 SMTP 等待邮件服务器接受邮件。
8. SMTP 调用成功后返回 `{ "ok": true }`。前端随后启动 60 秒重发倒计时。

注意：接口成功表示 SMTP 服务器已接受该邮件，并不等同于邮件一定到达收件箱。后续仍可能退信、进入垃圾邮件或被收件方策略拦截。

### 2.3 邮件发送

`MailService` 使用 `nodemailer.createTransport()` 创建 SMTP transporter，传入：

- `host`；
- `port`；
- `secure`；
- 当 `SMTP_USER` 和密码都非空时传入 `auth: { user, pass }`。

邮件包含 HTML 正文，正文显示 6 位验证码和 10 分钟有效期。当前主题也包含验证码：

```text
Verification Code: 123456 — Glimpse Chat
```

发送成功会记录收件邮箱和 SMTP `messageId`；失败会记录错误并继续抛出，所以 `/auth/send-code` 会失败，而不会向前端返回伪成功。

### 2.4 验证码存储与限流

固定规则目前直接写在 `verification.service.ts` 中，不是环境变量：

| 规则 | 当前值 |
| --- | ---: |
| 验证码长度 | 6 位数字 |
| 验证码有效期 | 10 分钟 |
| 同邮箱发送冷却 | 60 秒 |
| 同邮箱发送上限 | 每小时 5 次 |

#### Redis 模式

配置且启动时能够连接 `REDIS_URL` 时，使用以下 key：

| Key | 内容 | TTL |
| --- | --- | ---: |
| `verify:code:<normalized-email>` | 明文验证码 | 600 秒 |
| `verify:cooldown:<normalized-email>` | `1` | 60 秒 |
| `verify:count:<normalized-email>` | 当前窗口发送次数 | 首次发送时设为 3600 秒 |

每次重发会覆盖旧验证码，因此同一邮箱只有最新验证码有效。成功校验后删除 `verify:code:*`，实现一次性使用；输错不会删除验证码。

#### 内存降级模式

以下两种情况会在启动时切换到内存 Map：

- 未配置 `REDIS_URL`；
- API 启动时 Redis 连接失败。

内存模式实现了相同的 10 分钟有效期、60 秒冷却和每小时 5 次限制，但仅适合本地开发或单实例临时运行：

- API 重启后验证码和限流全部丢失；
- 多个 API 实例各自保存一份数据，请求落到不同实例时可能无法校验，也可绕过单实例限流；
- 过期 Map 项不会主动定时清理，验证码只在校验时清理，频率记录也会持续驻留；
- 不适合生产环境。

### 2.5 用户提交注册

前端提交：

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "at-least-8-characters",
  "nickname": "Alice",
  "language": "zh",
  "code": "123456"
}
```

后端 DTO 约束：

- `email`：合法邮箱；
- `password`：字符串，至少 8 个字符；
- `nickname`：字符串，至少 2 个字符；
- `language`：可选，只能是 `zh` 或 `en`；
- `code`：字符串，长度必须正好为 6。当前 DTO 没有额外声明只能为数字，但生成端和前端输入只产生数字。

注册过程：

1. 再次标准化邮箱。
2. 按标准化邮箱读取验证码并比较。
3. 验证码不存在、过期或不匹配时返回 HTTP `400`。
4. 匹配成功后立即删除验证码。
5. 再查询邮箱是否已经注册，已存在则返回 HTTP `409`。
6. 使用 Argon2id 对密码哈希后创建用户。
7. 写入公开用户 ID。
8. 签发访问令牌并返回用户信息，前端直接进入登录状态。

## 3. 必要环境变量

### 3.1 真实 SMTP 投递所需变量

| 变量 | 必需性 | 说明 |
| --- | --- | --- |
| `SMTP_HOST` | 必需 | SMTP 服务器域名，例如 `smtp.exmail.qq.com`。代码虽有默认值，但生产环境不应依赖默认值。 |
| `SMTP_PORT` | 必需 | SMTP 端口。常见为隐式 TLS 的 `465` 或 STARTTLS 的 `587`。 |
| `SMTP_SECURE` | 必需 | 字符串 `true`/`false`。Nodemailer 中 `true` 通常对应 465；587 通常使用 `false` 并由连接升级为 STARTTLS。代码只把精确字符串 `"true"` 识别为 true。 |
| `SMTP_USER` | 通常必需 | SMTP 登录账号，一般也是发件邮箱。 |
| `SMTP_PASS` | 通常必需 | SMTP 密码或服务商提供的应用专用密码/授权码。 |
| `SMTP_FROM` | 强烈建议 | 邮件 `From` 地址；未设置时依次回退到 `SMTP_USER` 和代码内默认地址。应使用服务商允许代发且完成域名验证的地址。 |

密码变量兼容关系：代码优先读取 `SMTP_PASS`；如果它未设置，再读取 `SMTP_PASSWORD`。根目录和 API 示例使用 `SMTP_PASS`，后台系统配置定义的却是 `SMTP_PASSWORD`。建议新部署统一使用 `SMTP_PASS`，重构时消除双命名。

腾讯企业邮箱示例：

```dotenv
SMTP_HOST=smtp.exmail.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@example.com
SMTP_PASS=replace_with_smtp_authorization_code
SMTP_FROM=noreply@example.com
```

587/STARTTLS 示例：

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASS=replace_with_smtp_password
SMTP_FROM=noreply@example.com
```

不要提交真实密码到 Git；应使用部署平台 Secret、Docker Secret 或受控环境变量注入。

### 3.2 验证码状态变量

| 变量 | 必需性 | 说明 |
| --- | --- | --- |
| `REDIS_URL` | 生产必需 | 例如 `redis://redis:6379`。代码允许缺省并降级，但生产环境应保证 Redis 可用。若需要认证/TLS，应使用对应的 Redis URL。 |

### 3.3 完成注册链路还依赖的变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 查询邮箱是否已注册并创建用户。 |
| `JWT_ACCESS_SECRET` | 注册成功后签发访问令牌。生产环境必须使用高强度随机值。 |
| `JWT_ACCESS_TTL` | 访问令牌有效期，虽然不影响邮件发送，但影响注册成功响应。 |
| `WEB_ORIGIN` | 浏览器跨域访问 API 时必须允许前端来源；生产环境不能为 `*`。 |
| `NEXT_PUBLIC_API_URL` | 前端构建时的 API 地址。未配置时，本地域名默认访问 `http://localhost:4100`，公网环境倾向同源。该变量属于 Web 构建环境，不是 API 运行环境。 |

API 还受全局 `API_RATE_LIMIT_MAX` 和 `API_RATE_LIMIT_WINDOW_MS` 影响。全局限流按 `IP + path` 计数，默认每 60 秒最多 120 次；它与验证码自己的“同邮箱 60 秒/每小时 5 次”限制同时生效。

### 3.4 配置加载与后台配置的实际边界

`ConfigModule.forRoot()` 没有指定自定义文件名，默认从 API 进程环境和其运行目录下的 `.env` 读取。使用 `pnpm --filter @glimpse/api dev` 时通常对应 `apps/api/.env`；容器则以 `docker-compose.yml` 的 `environment` 为准。部署时应通过进程实际环境确认，而不要只看某个 `.env` 文件。

后台系统配置列表虽然展示了 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD`，但当前 `MailService` 直接使用同步的 `ConfigService`，不会读取数据库中的 `SystemSetting`。因此：

- 在后台修改 SMTP 配置当前不会改变邮件 transporter；
- `SMTP_SECURE` 和 `SMTP_FROM` 甚至没有出现在后台定义中；
- 真正生效的 SMTP 配置仍是 API 启动时的进程环境；
- 如果未来让后台配置生效，需要统一改为读取 `SystemConfigService`，并设计 transporter 的安全重建/连接验证机制。

## 4. 本地验证与生产验收

### 4.1 使用 Mailpit 做无外发测试

当前 Compose 已配置 Mailpit：

```bash
docker compose up -d db redis mailpit api web
```

请求验证码后，打开 `http://localhost:8025` 查看捕获到的邮件。API 容器访问 Mailpit 使用内部地址 `mailpit:1025`；宿主机直接运行 API 时使用 `localhost:1025`。

### 4.2 用接口验证完整流程

```bash
curl -i http://localhost:4100/auth/send-code \
  -H 'Content-Type: application/json' \
  --data '{"email":"verification-test@example.com"}'
```

从 Mailpit 或真实收件箱取得验证码后：

```bash
curl -i http://localhost:4100/auth/register \
  -H 'Content-Type: application/json' \
  --data '{"email":"verification-test@example.com","password":"a-strong-test-password","nickname":"Verification Test","language":"zh","code":"123456"}'
```

验收时至少检查：

1. 正常邮件到达、发件人正确、正文和验证码可读；
2. 60 秒内重发返回 429；
3. 同一邮箱第 6 次/小时被限制；
4. 重发后旧验证码失效；
5. 错误验证码和过期验证码返回 400；
6. 正确验证码只能成功使用一次；
7. 已注册邮箱请求验证码返回 409；
8. API 多实例时，在不同实例之间发送和注册仍能成功，证明共用 Redis；
9. API 重启后 Redis 中未过期验证码仍有效；
10. 检查 SPF、DKIM、DMARC、退信和垃圾邮件表现，而不仅是 SMTP 接口返回成功。

生产环境建议在启动探针或运维检查中增加 SMTP `transporter.verify()`；当前代码启动时只创建 transporter，不主动验证账号、网络或证书，往往要到首次发送才暴露配置错误。


### 5.3 一致性与可维护性

- 将验证码 TTL、冷却时间、小时上限提取为经过校验的配置，并让邮件模板中的“10 minutes”和服务端 TTL 使用同一配置源。
- 统一 `SMTP_PASS` 与 `SMTP_PASSWORD` 命名，补齐 `SMTP_SECURE`、`SMTP_FROM` 的后台定义，或者明确 SMTP 只允许运维 Secret 配置。
- 当前注册先消费验证码，再检查用户是否存在；在并发注册或重复提交时可能出现“验证码已消费但注册失败”。建议把用户存在检查前移，同时仍依赖数据库 email 唯一约束处理竞争；对创建失败是否允许重试应有明确策略。
- 用户创建和写入 `publicId` 是两个数据库操作，第二步失败会留下部分创建的用户。注册链路重构时应使用数据库事务。
- 内存 Map 没有定时清理，应增加清理任务或只在测试环境启用。
- Redis 在启动后断线时，当前调用会抛错，并不会动态切换到内存 fallback。建议明确设计为“生产失败关闭、开发可降级”，并提供健康状态。
- 邮件发送位于 HTTP 请求内，SMTP 慢会直接增加接口延迟。规模增大后可使用任务队列，但必须保证只有任务被可靠接受后才向前端返回成功，并设计重试、幂等和退信监控。
- 建议为 `VerificationService` 和 `AuthService` 增加单元/集成测试，重点覆盖时间边界、并发、Redis 故障、SMTP 失败补偿和一次性消费。

