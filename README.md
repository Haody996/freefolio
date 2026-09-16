# freefolio

A portfolio-watching and net-worth-tracking web app with a compound-growth / early-retirement (FIRE) calculator. Live at **[getfreefolio.com](https://getfreefolio.com)**.

Track total net worth across mixed asset classes and debts, watch holdings revalue from live market prices, see real historical net worth and time-weighted returns reconstructed from actual market data, and project your path to financial independence.

## Features

- **Single-screen dashboard** — dark, high-contrast UI (the "Compound" design; see `Portfolio Dashboard.dc.html` for the original reference prototype).
- **Net worth over time** — an interactive area chart. Hover to read the exact value/date; click-drag across a span to see the % and $ change.
- **Real historical data** — net-worth history is reconstructed from actual daily prices (Yahoo Finance for stocks/ETFs, CoinGecko for crypto), not synthetic. Backfilled automatically and refreshable on demand.
- **Holdings** — add/edit/delete via a modal. Categorized as Stocks, Crypto, Cash, Bonds, Metals, Real estate, Vehicles, or Other. Entering a ticker **auto-fills the live price + previous close**.
  - **Crypto picker** browses the top 100 coins and searches every coin CoinGecko lists (the exact coin id is stored, so ambiguous tickers price correctly).
  - **Precious metals** — gold, silver, platinum, palladium held in troy oz (enter oz, grams or kg), priced per oz from COMEX/NYMEX futures.
  - **Real estate & vehicles** — a manual value, or an estimate compounded from purchase price, date and an annual appreciation/depreciation rate (re-valued daily). Counted in net worth but not in investable assets.
- **Debts** — mortgages, HELOCs, auto/student/personal loans, credit cards, medical. Balances come off net worth everywhere (dashboard, history, snapshots, admin). A debt can be secured by a property or vehicle to show equity/LTV.
- **Debt payoff planner** — avalanche vs. snowball vs. minimums-only: debt-free date, total interest, balance chart and payoff order. The chosen strategy + extra payment feed the retirement sim (paid-off payments can be redirected to savings; payments still due after retiring are added to spending).
- **Cost basis & gains** — tax lots rebuilt from logged buys/sells (FIFO), with an opening lot at the holding's average cost for shares entered without transactions. Unrealized gain per holding and per account (short- vs long-term), realized gains per tax year for taxable accounts, and **tax-loss harvesting** candidates with wash-sale warnings (recent buys in any account, or an upcoming auto-invest). Adding to an existing position and auto-invest contributions are logged as BUY transactions; mistaken transactions can be deleted (their share/cash effects are reversed).
- **Performance** — time-weighted return (deposits don't count as growth) and money-weighted return (XIRR) for 1M / 3M / YTD / 1Y on dividend-adjusted prices, compared with SPY, VTI, QQQ or VT.
- **Allocation** donut + legend, and a **Snapshot** (today's change, time-weighted 1-yr return vs. S&P 500, crypto exposure, cash buffer, total debt).
- **Compound-growth projection** — five live sliders (starting capital, monthly contribution, return, horizon, inflation) drive a nominal / inflation-adjusted / contributions chart plus a 4%-rule passive-income (FIRE) readout.
- **Live prices** — a background worker refreshes market-priced holdings on a schedule. **No API keys required.**
- **Email digest** — opt-in weekly (Mondays) or monthly (1st) email: net-worth change, top movers, FIRE progress, with one-click unsubscribe. Preview and send-a-test from Settings. Needs SMTP settings.
- **Public calculators** (no sign-in) — FIRE, Coast FIRE, compound interest and debt payoff at `/calculators/*`, with server-rendered titles/descriptions/Open Graph tags, `robots.txt` and `sitemap.xml` for search.
- **Auth** — email/password + Google sign-in (JWT).

## Architecture

Monorepo (mirrors the JobsClaw stack):

```
freefolio/
├── client/     React 19 + Vite 7 + Tailwind v4 + React Router 7 + TanStack Query
│   └── src/
│       ├── pages/                        Dashboard, Performance, Debts, Retirement, Settings, Admin
│       ├── pages/calculators/            public FIRE / Coast FIRE / compound / debt payoff pages
│       ├── components/dashboard/*        Sidebar, panels, SVG charts, holding/debt modals, payoff planner
│       └── lib/                          portfolio.ts (formulas, formatters), retirement.ts (sim),
│                                         debts.ts (payoff), calculators.ts (FIRE math)
├── server/     Node + Express 5 + TypeScript, Prisma 7 + Postgres, BullMQ + Redis
│   └── src/
│       ├── routes/                       auth, holdings, liabilities, transactions, networth, prices,
│       │                                 gains, performance, projection, digest, insights, profile, admin
│       ├── lib/prices.ts                 Yahoo Finance + CoinGecko (quotes, history, crypto search)
│       ├── lib/networth.ts               net worth (assets − debts) + real-history backfill
│       ├── lib/gains.ts                  tax lots, realized/unrealized gains, loss harvesting
│       ├── lib/performance.ts            time- & money-weighted returns vs. a benchmark
│       ├── lib/digest.ts, mailer.ts      email digest (nodemailer / SMTP)
│       ├── seo.ts                        head tags for the public calculator pages
│       ├── workers/                      price-refresh, networth-snapshot, auto-invest, digest
│       └── scheduler.ts                  repeatable BullMQ jobs
├── docker-compose.yml   postgres, redis, app, 4 workers
├── Dockerfile           builds client + server into one image
├── nginx/               getfreefolio.com server block (host nginx + certbot TLS)
└── deploy.sh            push → build → migrate → up
```

### Data model

- **Holding** — a flat, categorized position: `symbol`, `name`, `category`, `accountType`, `institution`, `quantity`, `price`, `prevClose`, optional auto-invest schedule, `openingCostPerShare` / `openingAcquiredAt` (cost basis of shares not covered by transactions; purchase price/date for property), `providerId` (CoinGecko id) and `appreciationPct` (estimated property value). Cash/Other/property are single-value entries (quantity 1, price = value).
- **Transaction** — a BUY/SELL against a holding (`source`: manual, added via "Add holding", or auto-invest). Drives tax lots and returns.
- **Liability** — a debt: `type`, `balance`, `interestRatePct` (APR), `minPayment` (monthly), optional secured `holdingId`. Net worth = Σ holdings − Σ liability balances.
- **NetWorthSnapshot** — one row per user per day (assets − liabilities).
- **ProjectionSettings** — the retirement plan inputs, FIRE goal, and debt plan (`debtStrategy`, `debtExtraPayment`, `redirectDebtPayments`).
- **User / Profile** — auth, display name, `digestFrequency` (OFF / WEEKLY / MONTHLY).

## Local development

```bash
docker compose up -d postgres redis          # infra
cd server && npm install && cd ../client && npm install && cd ..
cp .env.example .env                          # fill JWT_SECRET, GOOGLE_CLIENT_ID (optional)
cd server && npx prisma migrate dev && npm run seed && cd ..   # seed = demo@freefolio.net / password123
npm run dev                                   # client :5173, server :3001
npm run worker:prices                         # (optional) live-price worker
npm run worker:networth                       # (optional) daily snapshot worker
npm run worker:autoinvest                     # (optional) auto-invest (DCA) worker
npm run worker:digest                         # (optional) email digest worker (needs SMTP_*)
```

Market data (quotes + history) needs no API keys. Google sign-in needs `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID`. AI insights need `GEMINI_API_KEY`. The email digest needs `SMTP_HOST` (+ `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`); without it the digest worker skips sending and Settings shows that email isn't switched on.

## Tests

```bash
npm test          # server + client: type-check, then Vitest
cd server && npx vitest        # watch mode
```

Unit tests sit next to the code (`*.test.ts`). They cover the money math — tax lots and realized/unrealized gains, loss harvesting and wash-sale warnings, time- and money-weighted returns, net worth with debts (history backfill and the intraday series), auto-invest scheduling, the email digest (due dates, escaping, unsubscribe tokens), SEO head tags, debt payoff, FIRE / Coast FIRE / compound growth, and the retirement simulation with debts. Database and market-data calls are mocked, so tests need no Postgres, Redis or network. `deploy.sh` runs them first and aborts on failure.

## Deploy

Runs on a single host: docker-compose stack (app on host port **8090**) behind **host nginx** with Let's Encrypt TLS.

```bash
./deploy.sh    # run tests, commit + push, build images, prisma migrate deploy, restart containers
```

nginx/TLS is configured once via `nginx/getfreefolio.com` + `certbot --nginx`; see that file's header for the commands.
