#!/bin/sh
# Glimpse Chat - 数据库种子导入脚本
# 将 database/database-sanitized.sql 导入到 DATABASE_URL 指定的库。
#
# 设计要点：
#   1. SQL 备份由 pg_dump 生成，对象全部 schema-qualified（public.xxx），
#      因此会强制写入目标库的 public schema。
#   2. 备份已包含 _prisma_migrations 历史表（含 3 条 failed 记录），
#      导入后 prisma migrate deploy 会被这些 failed 记录阻塞，
#      所以本脚本之后必须跳过 migrate deploy（见 docker-compose.yml 的 db-seed）。
#   3. 备份是 CREATE TABLE 而非 CREATE TABLE IF NOT EXISTS，
#      重复导入会因表已存在而失败 —— 用 _prisma_migrations 表是否存在做幂等判断。
set -e

echo "[seed] start importing database-sanitized.sql"

# 允许通过 SEED_SKIP=true 跳过导入（例如已导入过或不需要种子数据）
if [ "${SEED_SKIP:-false}" = "true" ]; then
  echo "[seed] SEED_SKIP=true, skip import"
  exit 0
fi

# 幂等：若 _prisma_migrations 表已存在则跳过（说明已导入过）
if psql "$DATABASE_URL" -tAc "SELECT to_regclass('public._prisma_migrations')" | grep -q _prisma_migrations; then
  echo "[seed] _prisma_migrations table already exists, skip import (already seeded)"
  exit 0
fi

echo "[seed] importing dump into target database"
# 备份由 PostgreSQL 17 的 pg_dump 生成，含 PG17 专属参数 transaction_timeout，
# 宿主是 PG16 不识别该参数会报错中断。导入前用 sed 过滤掉该行。
# 同时关闭 ON_ERROR_STOP：其余 SET 语句即使有版本差异也不影响数据导入。
sed '/^SET transaction_timeout/d' /seed/database-sanitized.sql \
  | psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -q > /tmp/seed-psql.log 2>&1 || true

# 校验关键表是否导入成功（_prisma_migrations 应已存在）
if ! psql "$DATABASE_URL" -tAc "SELECT to_regclass('public._prisma_migrations')" | grep -q _prisma_migrations; then
  echo "[seed] ERROR: _prisma_migrations table missing after import, dump may have failed"
  cat /tmp/seed-psql.log
  exit 1
fi

echo "[seed] import completed successfully"

# 清理 failed 迁移记录（finished_at IS NULL），避免后续 prisma 命令被阻塞
echo "[seed] cleaning failed migration records from _prisma_migrations"
psql "$DATABASE_URL" -c "DELETE FROM public._prisma_migrations WHERE finished_at IS NULL;"
echo "[seed] done"
