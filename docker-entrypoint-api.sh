#!/bin/sh
set -e

echo "==> Running Prisma migrations..."
pnpm --filter @glimpse/api exec prisma migrate deploy --schema=prisma/schema.prisma

echo "==> Starting API server..."
exec node apps/api/dist/main.js
