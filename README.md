# freefolio

A portfolio-watching and net-worth-tracking web app with a compound-growth / early-retirement (FIRE) calculator. Live at **[getfreefolio.com](https://getfreefolio.com)**.

Track total net worth across mixed asset classes, watch holdings revalue from live market prices, see real historical net worth reconstructed from actual market data, and project your path to financial independence.

## Features

- **Single-screen dashboard** — dark, high-contrast UI (the "Compound" design; see `Portfolio Dashboard.dc.html` for the original reference prototype).
- **Net worth over time** — an interactive area chart. Hover to read the exact value/date; click-drag across a span to see the % and $ change.
- **Real historical data** — net-worth history is reconstructed from actual daily prices (Yahoo Finance for stocks/ETFs, CoinGecko for crypto), not synthetic. Backfilled automatically and refreshable on demand.
- **Holdings** — add/edit/delete via a modal. Categorized as Stocks, Crypto, Cash, Bonds, or Other. A curated **top-10 crypto** picker maps tickers to their market data, and entering a ticker **auto-fills the live price + previous close**.
- **Allocation** donut + legend, and a **Snapshot** (today's change, 1-yr return, crypto exposure, cash buffer).
- **Compound-growth projection** — five live sliders (starting capital, monthly contribution, return, horizon, inflation) drive a nominal / inflation-adjusted / contributions chart plus a 4%-rule passive-income (FIRE) readout.
- **Live prices** — a background worker refreshes market-priced holdings on a schedule. **No API keys required.**
- **Auth** — email/password + Google sign-in (JWT).

## Architecture

Monorepo (mirrors the JobsClaw stack):

```
freefolio/
├── client/     React 19 + Vite 7 + Tailwind v4 + React Router 7 + TanStack Query
│   └── src/
│       ├── pages/Dashboard.tsx          the single-screen app
│       ├── components/dashboard/*        Sidebar, panels, SVG charts, holding modal
│       └── lib/portfolio.ts              formulas, formatters, chart helpers
├── server/     Node + Express 5 + TypeScript, Prisma 7 + Postgres, BullMQ + Redis
│   └── src/
│       ├── routes/                       auth, holdings, networth, prices, projection, profile
│       ├── lib/prices.ts                 Yahoo Finance + CoinGecko (quotes & history)
│       ├── lib/networth.ts               net-worth compute + real-history backfill
│       ├── workers/                      price-refresh + networth-snapshot
│       └── scheduler.ts                  repeatable BullMQ jobs
├── docker-compose.yml   postgres, redis, app, 2 workers
├── Dockerfile           builds client + server into one image
├── nginx/               getfreefolio.com server block (host nginx + certbot TLS)
└── deploy.sh            push → build → migrate → up
```

### Data model

- **Holding** — a flat, categorized position: `symbol`, `name`, `category`, `quantity`, `price`, `prevClose`. Net worth = Σ (quantity × price). Cash/Other are manual entries (quantity 1, price = total value).
- **NetWorthSnapshot** — one row per user per day (assets only; the model has no liabilities).
- **ProjectionSettings** — the user's FIRE slider positions.
- **User / Profile** — auth + display name.

## Local development

```bash
docker compose up -d postgres redis          # infra
cd server && npm install && cd ../client && npm install && cd ..
cp .env.example .env                          # fill JWT_SECRET, GOOGLE_CLIENT_ID (optional)
cd server && npx prisma migrate dev && npm run seed && cd ..   # seed = demo@freefolio.net / password123
npm run dev                                   # client :5173, server :3001
npm run worker:prices                         # (optional) live-price worker
npm run worker:networth                       # (optional) daily snapshot worker
```

Market data (quotes + history) needs no API keys. Google sign-in needs `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID`.

## Deploy

Runs on a single host: docker-compose stack (app on host port **8090**) behind **host nginx** with Let's Encrypt TLS.

```bash
./deploy.sh    # commit + push, build images, prisma migrate deploy, restart containers
```

nginx/TLS is configured once via `nginx/getfreefolio.com` + `certbot --nginx`; see that file's header for the commands.
