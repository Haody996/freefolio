#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "→ Pushing to GitHub..."
git add -A && git diff --cached --quiet || git commit -m "Deploy $(date '+%Y-%m-%d %H:%M')"
git push

echo "→ Building containers..."
docker compose build

echo "→ Running database migrations..."
docker compose run --rm app npx prisma migrate deploy

echo "→ Restarting services..."
docker compose up -d

echo "✓ Deployed → https://getfreefolio.com"
