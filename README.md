# Pokéfolio

Pokéfolio is a personal Pokémon TCG sealed product investment dashboard for tracking booster boxes, ETBs, tins, premium collections, and other sealed products.

It supports multiple portfolios, buy/sell transactions, FIFO cost basis, realized and unrealized profit/loss, historical value charts, and aggregate portfolio analytics.

---

# Features

- Multiple portfolios with one starred default portfolio
- Buy and sell transaction log with date, quantity, price, and notes
- FIFO cost basis for realized P/L
- Unrealized P/L based on current market value
- Oversell protection
- Edit and delete transaction validation
- JustTCG-backed sealed product search
- Cached product search results
- Portfolio value charts with 7D, 1M, 3M, 6M, and MAX timeframes
- Product-level historical price charts
- Daily price syncing through Vercel Cron
- Manual sync from settings
- Aggregate analytics dashboard
- Light/dark mode
- Password-gated single-user auth

---

# Tech Stack

- Next.js 16.2.6
- React 19
- TypeScript 5
- Tailwind CSS v4
- Radix UI / shadcn-style components
- Supabase PostgreSQL
- Recharts
- JustTCG API
- Vercel Cron
- lucide-react

---

# API Usage Strategy

Pokéfolio is designed around the JustTCG free tier request limits.

Optimizations include:

- Search only fires on Enter or button click
- Search results are cached locally in the database
- Prices sync once daily
- Manual sync available from settings
- Historical backfills only happen when needed

---

# Database Tables

- `products`
- `portfolios`
- `transactions`
- `price_snapshots`
- `portfolio_snapshots`

Schema files:

```txt
supabase/schema.sql
supabase/migrations/002_transactions.sql
```

---

# Project Structure

```txt
app/
  (app)/
    dashboard/
    portfolios/
    search/
    products/[id]/
    data/
    settings/

  api/
    auth/
    portfolios/
    transactions/
    products/
    search/
    sync/
    data/
    dashboard/snapshots/

  login/
  layout.tsx

components/
  sidebar.tsx
  theme-provider.tsx

lib/
  supabase.ts
  holdings.ts
  rebuild-portfolio-snapshots.ts
  backfill.ts
  use-active-portfolio.ts
  utils.ts

supabase/
  schema.sql
  migrations/002_transactions.sql

proxy.ts
vercel.json
```

---

# Setup

## Prerequisites

- Node.js 18+
- Supabase project
- JustTCG API key

## Installation

```bash
git clone <your-repo-url>
cd <your-project-name>
npm install
```

## Environment Variables

Create `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
ADMIN_PASSWORD=<your-password>
JUSTTCG_API_KEY=<your-justtcg-api-key>
CRON_SECRET=<random-string>
```

Do NOT append `/rest/v1/` to the Supabase URL.

## Database Setup

Run these inside the Supabase SQL editor:

```txt
supabase/schema.sql
supabase/migrations/002_transactions.sql
```

## Run Locally

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

Log in using your `ADMIN_PASSWORD`.

---

# Vercel Deployment

Add the same environment variables in Vercel.

`vercel.json` already configures the daily cron job for:

```txt
/api/sync
```

Cron authentication uses the `x-cron-secret` header.

---

# Core Logic

## FIFO Cost Basis

Buys are treated as chronological lots.

When a sell occurs, shares are consumed from the oldest lots first.

- Realized P/L comes from completed sells
- Unrealized P/L comes from remaining holdings using current market value

## Portfolio Snapshots

Snapshots are rebuilt after:

- Daily syncs
- Buys
- Sells
- Transaction edits/deletes

The rebuild system:

- Walks from earliest transaction date → today
- Computes holdings as-of each date
- Uses latest available market price
- Falls back to weighted average cost basis when no historical market price exists

These snapshots power the dashboard charts.

---

# Known Limitations

- Single-user only
- Password auth only
- Sealed products only
- No individual card tracking
- Historical price coverage varies depending on product popularity
- TCGPlayer CDN image URLs are unofficial
- Mobile UI is responsive but not fully optimized
- No automated tests yet

---

# Scripts

```bash
npm run dev
npm run build
npm run start
```

---

# Notes

JustTCG uses:

```txt
condition=S
```

for sealed products.

Historical prices use:

```txt
priceHistoryDuration
```

Some niche sealed products may only have limited historical data available.
