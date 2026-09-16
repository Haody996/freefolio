#!/bin/bash
set -e
cd "$(dirname "$0")"

# Type-check + unit tests for server and client; a failure stops the deploy
# before anything is committed, pushed or restarted.
echo "→ Running tests..."
npm test

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
