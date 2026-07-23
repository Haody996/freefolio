# Handoff: Portfolio Watching & Growth Projection Dashboard

## Overview
A single-screen desktop web dashboard for retail investors (target audience: 20–35, FIRE mindset) to:
- Track total net worth across mixed asset classes (stocks/ETFs, crypto, cash, bonds, manual/other), updated daily.
- Add, edit, and delete holdings via a modal input flow.
- Visualize net worth over time, allocation by asset class, and a portfolio snapshot.
- Run a compound-interest growth projection with adjustable assumptions ("twist the settings") and a 4%-rule passive-income readout.

## About the Design Files
The file in this bundle (`Portfolio Dashboard.dc.html`) is a **design reference created in HTML** — a working prototype showing the intended look and behavior. It is **not production code to copy directly**. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, Svelte, etc.), using that codebase's established component patterns, state management, styling system, and charting library. If no environment exists yet, choose an appropriate stack (e.g. React + a charting lib such as Recharts/visx, or hand-rolled SVG as in the prototype).

The prototype was authored as a "Design Component" — a class with a `renderVals()` method feeding an HTML template. Ignore that wrapper; the meaningful parts are the layout, the computed values, and the formulas documented below.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are all specified. Recreate the UI pixel-accurately using the codebase's libraries. All charts are plain SVG in the prototype — substitute the codebase's preferred chart library if desired, matching the visual style below.

## Layout (single desktop screen)
Root: full-height flex row, background `#0E0F13`, text `#F2F4F8`, font Manrope.
- **Left sidebar** — fixed `236px`, `border-right: 1px solid rgba(255,255,255,0.07)`, sticky full height, padding `26px 20px`, vertical flex, `gap: 26px`.
  - Logo row: green diamond mark (`#22E38A`, a 45°-rotated square) + wordmark "Compound" (Space Grotesk, 700, 19px, letter-spacing -0.5px).
  - Nav (vertical, `gap: 3px`): Dashboard (active), Holdings, Projections, Transactions, Settings. Items: padding `10px 12px`, radius `10px`, 14px, weight 600–700. Active = `background rgba(34,227,138,0.12)`, `color #22E38A`. Inactive = `color #8A90A2`, hover `background rgba(255,255,255,0.04)`, `color #F2F4F8`.
  - Bottom "FIRE PROGRESS" card (`margin-top:auto`): panel style, label 11px, an 8px progress bar (track `rgba(255,255,255,0.07)`, fill `linear-gradient(90deg,#22E38A,#9B7CFF)`, width = `netWorth / 1,500,000` clamped to 100%), caption `<netWorth compact> / $1.5M · <pct>`.
- **Main** — `flex:1`, padding `30px 38px`, vertical flex, `gap: 20px`.

### Panel base style
`background:#16181F; border:1px solid rgba(255,255,255,0.07); border-radius:18px; padding:24px;`

## Screens / Views

### Header (top of main)
- Left: greeting `h1` "Good afternoon, Alex" (Space Grotesk, 700, 25px, letter-spacing -0.5px) + subtitle "Prices synced today · Jul 22, 2026 · 4:00pm ET" (`#8A90A2`, 13px).
- Right: two buttons, `gap:10px`.
  - **Hide/Show balances** (secondary): padding `11px 16px`, radius 10, `border 1px rgba(255,255,255,0.1)`, `background rgba(255,255,255,0.05)`, weight 600, 13px. Label toggles between "Hide balances" / "Show balances". Hover `background rgba(255,255,255,0.1)`.
  - **+ Add holding** (primary): padding `11px 18px`, radius 10, no border, `background #22E38A`, `color #04140C`, weight 700, 13px. Hover `filter:brightness(1.08)`. Opens the Add/Edit modal.

### Net worth panel (full width)
- Header row (space-between, align start):
  - Left: label "TOTAL NET WORTH" (11px, letter-spacing 1.2px, `#8A90A2`, 700); big value (Space Grotesk 700, 42px, letter-spacing -1px, tabular-nums); day-change line (14px 600, colored green `#22E38A` if ≥0 else red `#FF5470`) formatted `+$768 (+0.42%)` followed by muted "today".
  - Right: range switcher — pill group, `background rgba(255,255,255,0.04)`, padding 4, radius 11, containing buttons **1M / 3M / 1Y / ALL**. Each button padding `6px 14px`, radius 8, 12px/600. Active = `background rgba(34,227,138,0.16)`, `color #22E38A`; inactive `color #8A90A2`.
- Below: **net worth area line chart** (see Charts).

### Allocation panel + Snapshot panel (2-col grid: `340px 1fr`, `gap:20px`)
- **Allocation**: title "Allocation" (Space Grotesk 16px/600). Row (`gap:18px`): donut chart (left) + legend column. Legend row per asset class: 10×10 rounded-3px color swatch, class name (`#C9CDD8`), right-aligned percent (700, tabular), right-aligned compact value (`#8A90A2`, 52px wide).
- **Snapshot**: title "Snapshot". 2×2 grid (`gap:14px`) of stat tiles. Tile: `background rgba(255,255,255,0.03)`, radius 14, padding 16. Contents: uppercase label (11px/700 `#8A90A2`), value (Space Grotesk 23px/700, colored), sub (12px `#8A90A2`). The four tiles:
  - **Today** — signed $ day change, sub signed %, green/red by sign.
  - **1-Yr Return** — signed % trailing 12 months (from history first-vs-last point), green/red.
  - **Crypto Exposure** — % of portfolio in crypto, color `#FFB020`, sub "of portfolio".
  - **Cash Buffer** — % in cash, color `#35A0FF`, sub compact cash value.

### Holdings panel (full width)
- Title "Holdings".
- Column header grid (`grid-template-columns: 2fr 1.1fr 1fr 1fr 1.1fr`, `gap:12px`, bottom border `1px rgba(255,255,255,0.07)`, 11px/700 uppercase `#8A90A2` letter-spacing 0.6px): `Asset | Price | 24h | Holdings | Value / Alloc` (last four right-aligned).
- One row per holding, same grid, padding `14px 8px`, radius 10, bottom border `1px rgba(255,255,255,0.05)`, tabular-nums, **cursor pointer**, hover `background rgba(255,255,255,0.035)`. **Clicking a row opens the Edit modal for that holding.**
  - Asset cell: 34×34 rounded-9px badge (`background` = category color, `color #04140C`, 11px/800) showing the ticker, then a stacked block: ticker (700/14px) over name (12px `#8A90A2`, truncated with ellipsis).
  - Price: `$` formatted, 2 decimals, 14px.
  - 24h: signed %, 14px/600, green/red by sign.
  - Holdings: `<n> sh`, or `—` when quantity is 1 or category is Cash/Other, `#C9CDD8`.
  - Value / Alloc: value (700/14px) over allocation % (12px `#8A90A2`).

### Projection panel (full width)
- Header: title "Compound growth projection" + subtitle "Twist the assumptions to see where you land."
- Body grid (`grid-template-columns: 290px 1fr`, `gap:28px`, align start):
  - **Left — controls** (vertical, `gap:18px`). Five slider rows. Each: label (13px/600 `#8A90A2`) with right-aligned current value (Space Grotesk 14px/700, tabular), then a full-width `range` input (accent/thumb `#22E38A`, track `rgba(255,255,255,0.09)`, thumb 16px with `0 0 0 4px rgba(34,227,138,0.18)` halo).
    - Starting capital — min 0, max 1,000,000, step 5,000, shown as `$`.
    - Monthly contribution — 0 … 15,000, step 250, `$`.
    - Annual return — 0 … 15, step 0.5, `%`.
    - Time horizon — 1 … 50, step 1, "yrs".
    - Inflation — 0 … 8, step 0.5, `%`.
  - **Right** (vertical, `gap:18px`):
    - Summary: 3-col grid — **Projected · `<Ny>`** (Space Grotesk 27px/700, `#22E38A`), **In today's dollars** (27px/700, `#9B7CFF`), **Investment gains** (27px/700, `#F2F4F8`) with sub "on `<total contributed>` contributed". Each has an uppercase 11px label above.
    - **Projection growth chart** (see Charts).
    - Legend chips (12px `#8A90A2`, `gap:18px`): 16×3 line swatch + label — Nominal (`#22E38A`), Real (inflation-adj) (`#9B7CFF`), Contributions (`#5B6172`).
    - **FIRE callout**: `background rgba(34,227,138,0.07)`, `border 1px rgba(34,227,138,0.22)`, radius 14, padding `16px 18px`, flex row. Big number (Space Grotesk 24px/700 `#22E38A`) = `finalReal × 0.04` + "/yr", then copy: "Safe passive income at the 4% rule — enough to consider coasting around **`<2026 + years>`**."

### Add / Edit Holding modal
- Overlay: `position:fixed; inset:0; z-index:50; background rgba(6,7,10,0.65); backdrop-filter: blur(5px)`, centered, padding 24. Clicking the overlay closes; clicking the card does not (stop propagation).
- Card: 460px (max 100%), panel background `#16181F`, `border 1px rgba(255,255,255,0.1)`, radius 20, padding 26, shadow `0 24px 60px rgba(0,0,0,0.5)`.
- Header: title "Add holding" or "Edit holding" (Space Grotesk 19px/700) + round 32px close "×" button.
- Fields (vertical `gap:16px`):
  - **Asset class** — row of 5 equal-width buttons: Stocks, Crypto, Cash, Bonds, Other. Selected button = filled with that category color + `color #04140C` + border in the category color; unselected = transparent, `border 1px rgba(255,255,255,0.1)`, `color #8A90A2`. 8px/0 padding, radius 9, 12px/700.
  - **Ticker** (uppercase) + **Name** — 2-col grid `1fr 1.6fr`.
  - **Quantity / Price / Prev close** — 3-col grid, `type=number step=any`. Prev close is optional (defaults to Price).
  - Helper text (12px `#8A90A2`): "For cash or manual entries, set quantity to 1 and price to the total value."
  - Footer row: **Delete** (only when editing; red outline — border `rgba(255,84,112,0.35)`, bg `rgba(255,84,112,0.1)`, text `#FF5470`) on the left; **Cancel** (ghost) + **Save holding** (primary green) on the right.
- Input base style: `background rgba(255,255,255,0.05); border 1px rgba(255,255,255,0.1); border-radius 10px; padding 11px 13px; color #F2F4F8; font 14px`. Focus: `border-color #22E38A; outline none`.

## Interactions & Behavior
- **Range switch** (1M/3M/1Y/ALL) re-slices the net worth history and re-renders the chart; the line/area/end-dot color is green if the sliced range ends ≥ it started, else red.
- **Hide/Show balances** masks every monetary figure (net worth, day change, holding values, allocation values, cash buffer, donut center) with `••••••`. Percentages and returns stay visible.
- **+ Add holding** → opens modal in add mode (empty draft, category default "Stocks").
- **Click holding row** → opens modal in edit mode, prefilled; **Save** replaces it, **Delete** removes it.
- **Save** parses numbers, upper-cases the ticker, defaults name to ticker if blank, defaults prev close to price if blank, then appends or replaces the holding by ticker.
- **Any holdings change recomputes everything live**: net worth, day change, allocation, snapshot stats, the net worth chart (rescaled to new total), and the projection's default starting capital.
- **Projection sliders** recompute the projection arrays and all summary numbers + chart on every input.
- Hover states as specified on nav, buttons, and rows. No route navigation — single screen (sidebar items are non-functional placeholders in the prototype).

## State Management
- `holdings: Holding[]` — the source of truth. `Holding = { sym, name, cat, shares, price, prev }`. Seed data below.
- `range: '1M'|'3M'|'1Y'|'ALL'` (default `'1Y'`).
- `privacy: boolean` (default false) — balance masking.
- Projection inputs: `start` (defaults to current net worth), `monthly` (3000), `ret` (8), `years` (25), `infl` (3).
- Modal: `modalOpen: boolean`, `editSym: string|null` (null = add mode), `draft: { sym, name, cat, shares, price, prev }` (strings while editing).

## Formulas
- **Per holding**: `value = shares × price`; `dayChg = (price − prev) × shares`; `dayPct = (price − prev) / prev`; `alloc = value / total`.
- **Totals**: `total = Σ value`; `day = Σ dayChg`; `dayPct = day / (total − day)`.
- **Allocation**: sum `value` by category → percent of total.
- **1-yr return**: `(total − history[len−53]) / history[len−53]` (weekly points, 52 back).
- **Net worth history**: 156 weekly points, a seeded random walk (weekly factor ≈ `1.0046 ± 0.045` noise) **rescaled so the last point equals current total** (recompute the scale whenever holdings change — keep the walk shape cached). Dates step back 7 days per point from Jul 22, 2026. In production, replace with real historical valuation data.
- **Compound projection** (monthly compounding): `r = ret/100/12`, for each year `y` (0…years), months `m = y×12`:
  - `nominal(y) = start·(1+r)^m + monthly·((1+r)^m − 1)/r` (if `r=0`: `start + monthly·m`).
  - `real(y) = nominal(y) / (1 + infl/100)^y`.
  - `contributed(y) = start + monthly·12·y`.
  - `growth = finalNominal − totalContributed`.
- **FIRE passive income**: `finalReal × 0.04`. **FIRE progress bar**: `total / 1,500,000`.

## Formatting
- USD: `$` + `toLocaleString('en-US')`, 0 decimals (2 for prices).
- Compact: `≥1e6 → $X.XM` (1 decimal ≥ 1e7, else 2), `≥1e3 → $Xk`, else `$X`.
- Signed USD: `+$…` / `−$…` (unicode minus U+2212). Signed %: `+X.XX%` / `−X.XX%`. Plain %: `X.X%`.

## Seed Holdings
| Ticker | Name | Class | Qty | Price | Prev close |
|---|---|---|---|---|---|
| NVDA | NVIDIA Corp | Stocks | 60 | 178.30 | 171.20 |
| AAPL | Apple Inc | Stocks | 40 | 244.10 | 246.50 |
| VTI | Vanguard Total Market | Stocks | 18 | 315.20 | 312.80 |
| VXUS | Vanguard Intl Stock | Stocks | 50 | 72.40 | 71.90 |
| BTC | Bitcoin | Crypto | 0.85 | 118400 | 119000 |
| ETH | Ethereum | Crypto | 6.2 | 4120 | 3980 |
| BND | Vanguard Total Bond | Bonds | 60 | 71.80 | 71.60 |
| CASH | HYSA · Ally Bank | Cash | 1 | 14250 | 14250 |
| RSU | Vested RSUs (manual) | Other | 1 | 8600 | 8600 |

Data is realistic mock data — wire to a real prices API in production.

## Charts (all plain SVG in the prototype)
- **Net worth area line**: viewBox `0 0 760 260`, padding L/R 6, T 16, B 26. Vertical scale padded 12% above/below. 3 faint horizontal gridlines (`rgba(255,255,255,0.05)`). Area fill = vertical gradient of the line color 0.3 → 0 opacity. Line 2.5px, round joins/caps. 4px end dot. 5 x-axis month labels (11px `#8A90A2`), first left-anchored / last right-anchored. Line color green `#22E38A` (up) or red `#FF5470` (down).
- **Allocation donut**: 190×190 viewBox, `cx=cy=95`, `r=70`, stroke width 22, group rotated `-90°`. Each segment a `<circle>` with `stroke-dasharray = segLen (C−segLen)` and cumulative negative `stroke-dashoffset`. Center: compact total (Space Grotesk 22px/700) over "NET WORTH" (10px `#8A90A2`, letter-spacing 1.5).
- **Projection growth**: viewBox `0 0 680 270`, padding L 6 / R 46 / T 16 / B 24, y-min forced to 0. 4 gridlines with right-edge compact y-labels. Green area+line for nominal (2.5px), violet dashed line for real (`#9B7CFF`, `stroke-dasharray 2 3`, 2px), gray dashed line for contributions (`#5B6172`, `4 4`, 1.5px). 5 x-axis year labels (`0y…Ny`).

## Design Tokens
Colors:
- Background `#0E0F13`; panel `#16181F`; tile `rgba(255,255,255,0.03)`; borders `rgba(255,255,255,0.07)` / `rgba(255,255,255,0.1)`.
- Text primary `#F2F4F8`; secondary `#C9CDD8`; muted `#8A90A2`.
- Primary / gain green `#22E38A` (on-green text `#04140C`); loss red `#FF5470`.
- Category & accent: Stocks `#22E38A`, Crypto `#FFB020`, Cash `#35A0FF`, Bonds `#9B7CFF`, Other `#FF6FB5`. Contributions line gray `#5B6172`.

Typography: **Manrope** (400/500/600/700/800) for UI/body; **Space Grotesk** (500/600/700) for headings and all numeric displays. Numeric elements use `font-variant-numeric: tabular-nums`.

Radii: tiles/inputs/buttons 9–14px; panels 18px; modal 20px. Shadow (modal): `0 24px 60px rgba(0,0,0,0.5)`.

Spacing: main gutter 30–38px; panel padding 24–26px; inter-panel gap 20px; control gap 16–18px.

## Assets
No external images. The only graphics are the logo diamond (rotated square) and the SVG charts — all code-drawn. Fonts load from Google Fonts (Manrope, Space Grotesk).

## Files
- `Portfolio Dashboard.dc.html` — the full prototype (layout, formulas, and interactions). Reference implementation for everything above.
