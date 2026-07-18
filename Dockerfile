#
# Glimpse Chat - multi-stage Dockerfile
# 构建 pnpm monorepo，产出 api 与 web 两个运行时镜像。
#
# 构建目标：
#   --target api-runtime  -> apps/api 生产镜像
#   --target web-runtime  -> apps/web 生产镜像
#
# 构建参数（影响 web 前端构建时注入的公开变量）：
#   NEXT_PUBLIC_API_URL     默认 http://localhost:4100
#   NEXT_PUBLIC_SOCKET_URL  默认 http://localhost:4100
#
# 适用环境：WSL2 / Linux，需 Docker BuildKit（DOCKER_BUILDKIT=1）。

# ===== 基础镜像 =====
FROM node:24-alpine AS base
# alpine: tini 在 tini 包；curl 用于 healthcheck；corepack 由 node 24 自带（版本够新）
RUN apk add --no-cache ca-certificates tini curl \
    && corepack enable
WORKDIR /workspace

# ===== 依赖安装阶段 =====
FROM base AS installer
# argon2 等原生模块需要 python3/make/g++ 编译（alpine 用 build-base）
RUN apk add --no-cache python3 make g++ build-base
# 先复制 manifest，利用 docker 层缓存
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ===== 构建阶段 =====
FROM installer AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:4100
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:4100
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY apps/web ./apps/web
# shared 必须先 build，产出 dist/index.js 供 api 运行时解析
# prisma generate 必须在 api build 之前，否则 @prisma/client 无类型导出导致 201 个 TS 错误
RUN pnpm --filter @glimpse/shared build \
    && pnpm --filter @glimpse/api exec prisma generate \
    && pnpm --filter @glimpse/api build \
    && pnpm --filter @glimpse/web build

# ===== API 运行时 =====
FROM base AS api-runtime
ENV NODE_ENV=production
WORKDIR /app
# 安装 postgresql-client，用于 entrypoint 中 CREATE DATABASE
RUN apk add --no-cache postgresql-client
# 复制入口脚本（负责建库 + 迁移 + 启动）
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# 复制整个 workspace 的 node_modules（含 .pnpm 虚拟存储和符号链接），
# pnpm 的依赖解析依赖完整的 node_modules 结构，单独复制子目录会导致
# 传递依赖（如 express）无法解析。
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /workspace/packages/shared/node_modules ./packages/shared/node_modules
# 复制构建产物（不复制 prisma.config.ts，避免 tsx 依赖；schema.prisma 自带 env() 读取）
COPY --from=builder /workspace/apps/api/dist ./apps/api/dist
COPY --from=builder /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=builder /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=builder /workspace/packages/shared/dist ./packages/shared/dist
COPY --from=builder /workspace/packages/shared/package.json ./packages/shared/package.json
EXPOSE 4100
ENTRYPOINT ["/sbin/tini", "--"]
# 入口脚本：1) 创建目标数据库（如不存在） 2) prisma migrate deploy 3) 启动 node
# 依赖环境变量 ADMIN_DATABASE_URL / DATABASE_URL / DB_NAME（见 docker-compose.yml）
CMD ["/usr/local/bin/docker-entrypoint.sh"]

# ===== Web 运行时 =====
FROM base AS web-runtime
ENV NODE_ENV=production
WORKDIR /app/apps/web
COPY --from=installer /workspace/node_modules /app/node_modules
COPY --from=installer /workspace/apps/web/node_modules /app/apps/web/node_modules
COPY --from=builder /workspace/apps/web/.next /app/apps/web/.next
COPY --from=builder /workspace/apps/web/public /app/apps/web/public
COPY --from=builder /workspace/apps/web/package.json /app/apps/web/package.json
COPY --from=builder /workspace/apps/web/next.config.ts /app/apps/web/next.config.ts
COPY --from=builder /workspace/packages/shared/dist /app/packages/shared/dist
COPY --from=builder /workspace/packages/shared/package.json /app/packages/shared/package.json
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
