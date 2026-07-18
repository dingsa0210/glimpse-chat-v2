#!/bin/sh
# Glimpse Chat - 数据库初始化脚本（建库）
# 创建目标业务库（如不存在）。供 db-init 一次性服务使用。
set -e

echo "[db-init] checking database \"$DB_NAME\""

if psql "$ADMIN_DATABASE_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  echo "[db-init] database \"$DB_NAME\" already exists, skip creation"
else
  echo "[db-init] creating database \"$DB_NAME\""
  psql "$ADMIN_DATABASE_URL" -c "CREATE DATABASE \"$DB_NAME\""
fi

echo "[db-init] done"
