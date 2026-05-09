# Pokéfolio

Personal Pokémon TCG sealed collection tracker.

Built mainly for tracking booster boxes, ETBs, tins, and other sealed products across multiple collections with historical value tracking and transaction history.

Started as a replacement for spreadsheets and slowly turned into a full collection dashboard.

---

# Current Features

- Multiple portfolios/collections
- Buy/sell transaction history
- Historical value charts
- Realized/unrealized value tracking
- Daily price syncing
- Product search + caching
- Portfolio analytics dashboard
- Light/dark mode
- Password-gated single-user setup

---

# Stack

Frontend:
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Recharts

Backend / Data:
- Supabase Postgres
- JustTCG API
- Vercel Cron

---

# Running Locally

## Requirements

- Node.js 18+
- Supabase project
- JustTCG API key

## Install

```bash
npm install
```

Create `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ADMIN_PASSWORD=
JUSTTCG_API_KEY=
CRON_SECRET=
```

Run database setup:

```txt
supabase/schema.sql
supabase/migrations/002_transactions.sql
```

Start dev server:

```bash
npm run dev
```

---

# Notes

The app is intentionally single-user and optimized around free-tier infrastructure.

Most of the logic revolves around:
- transaction history
- historical snapshots
- FIFO tracking
- minimizing API usage

The JustTCG free tier is heavily rate limited:

```txt
1000 requests/month
100 requests/day
10 requests/minute
```

Because of that:
- searches are cached
- syncing is batched
- charts are rebuilt locally from stored snapshots instead of constantly hitting the API

Historical data coverage depends on what JustTCG has available for each product.
