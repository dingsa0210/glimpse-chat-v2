#!/bin/sh
# Glimpse Chat API 容器入口脚本
# 职责：1) 执行 prisma migrate deploy，补齐种子数据导入后新增的迁移
#       2) 启动 node 应用
#
# 注意：建库由 db-init 一次性服务完成，本脚本不再负责建库。
#
# 依赖环境变量：
#   DATABASE_URL        应用连接串，指向目标业务库（已由 db-init 创建）
set -e

cd /app/apps/api

# 种子 SQL 只包含备份生成时的迁移历史，之后新增的迁移仍需执行。
# db-seed 已清理导入数据里的失败迁移记录，因此 migrate deploy 可安全重复执行。
echo "[entrypoint] applying pending prisma migrations"
npx prisma migrate deploy --schema=prisma/schema.prisma

echo "[entrypoint] starting api"
cd /app
exec node apps/api/dist/main.js
