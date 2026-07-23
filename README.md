# freefolio

A portfolio-watching and net-worth-tracking web app with a built-in early-retirement (FIRE) calculator.

- **Track net worth over time.** Add asset & liability accounts, record balances, and freefolio snapshots your total net worth daily so you can watch it trend.
- **Watch your portfolio.** Investment accounts hold securities (stocks, ETFs, crypto). A background worker pulls live market prices and revalues holdings automatically.
- **Plan early retirement.** A FIRE calculator projects your path to financial independence from your current savings, contributions, expected returns, and target withdrawal rate.

## Architecture

Monorepo mirroring the JobsClaw stack:

```
freefolio/
├── client/     React 19 + Vite 7 + Tailwind v4 + React Router 7 + TanStack Query
├── server/     Node + Express 5 + TypeScript, Prisma 7 + Postgres, BullMQ + Redis
│   ├── src/routes/      REST API under /api
│   ├── src/workers/     price-refresh + networth-snapshot background workers
│   ├── src/scheduler.ts repeatable BullMQ jobs (daily snapshot, price refresh)
│   └── prisma/          schema
├── docker-compose.yml   postgres, redis, app, 2 workers
├── Dockerfile           builds client + server into one image
└── deploy.sh            push → build → migrate → up
```

### Data model

- **Account** — an asset or liability (cash, investment, retirement, real estate, crypto, loan, credit card…).
- **Balance** — a dated balance for a manually-tracked account.
- **Holding** — a security (symbol + quantity + cost basis) inside an investment account.
- **PriceQuote** — cached latest market price per symbol.
- **NetWorthSnapshot** — a user's daily total assets / liabilities / net worth.
- **RetirementPlan** — the user's FIRE calculator inputs.

An account's current value is either its latest `Balance` (manual accounts) or the sum of its `Holding` market values (investment accounts).

## Local development

```bash
# 1. Postgres + Redis
docker compose up -d postgres redis

# 2. Install deps
cd server && npm install && cd ../client && npm install && cd ..

# 3. Env
cp .env.example .env   # fill in JWT_SECRET, GOOGLE_CLIENT_ID, FINNHUB_API_KEY

# 4. DB
cd server && npx prisma migrate dev && npx prisma generate && cd ..

# 5. Run everything (client :5173, server :3001)
npm run dev
# workers, separately:
npm run worker:prices
npm run worker:networth
```

## Deploy

`./deploy.sh` — commits, pushes, rebuilds Docker images, runs `prisma migrate deploy`, and restarts containers.
