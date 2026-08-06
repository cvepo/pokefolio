import { NextRequest, NextResponse } from "next/server";

// ── JustTCG lookup ──────────────────────────────────────────────────────────
// NOTE: pokefolio already has "Product search + caching" somewhere in the repo
// (the README lists it as a feature). If you have an existing helper —
// e.g. searchJustTCG() / a cached product-search util — REPLACE the body of
// justTcgSearch() below with a call to it so this route shares the same cache
// and doesn't double-spend your 100/day quota. The signature is intentionally
// simple: take a query string, return the best-match priced product (or null).

const JUSTTCG_BASE = "https://api.justtcg.com/v1";

type PricedProduct = {
  id: string;
  name: string;
  set?: string;
  marketPrice: number | null; // USD fair-market value
  matchedQuery: string;
};

async function justTcgSearch(query: string): Promise<PricedProduct | null> {
  const key = process.env.JUSTTCG_API_KEY;
  if (!key) throw new Error("JUSTTCG_API_KEY not set");

  // JustTCG search endpoint — adjust path/params to match what your existing
  // sync code already uses. Kept generic here.
  const url = new URL(`${JUSTTCG_BASE}/cards`);
  url.searchParams.set("game", "pokemon");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: { "x-api-key": key },
    // cache the upstream response for a day; lot pricing doesn't need to be
    // real-time and this protects the daily quota on repeat lookups
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!res.ok) {
    // surface rate-limit distinctly so the UI can back off
    if (res.status === 429) throw new Error("RATE_LIMIT");
    throw new Error(`JustTCG ${res.status}`);
  }

  const json = await res.json();
  const hit = json?.data?.[0];
  if (!hit) return null;

  // JustTCG returns variants/prices; take the market/mid price of the first.
  const price =
    hit.variants?.[0]?.price ??
    hit.price ??
    hit.marketPrice ??
    null;

  return {
    id: String(hit.id ?? hit.cardId ?? query),
    name: hit.name ?? query,
    set: hit.set ?? hit.setName,
    marketPrice: typeof price === "number" ? price : null,
    matchedQuery: query,
  };
}

export async function POST(req: NextRequest) {
  let body: { queries?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const queries = (body.queries ?? [])
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 20); // hard cap so one lot can't blow the per-minute limit

  if (queries.length === 0) {
    return NextResponse.json({ error: "No queries" }, { status: 400 });
  }

  // Sequential with a small gap keeps us under JustTCG's 10 req/min ceiling.
  // For a typical lot (≤10 lines) this finishes in a few seconds.
  const results: Array<PricedProduct | { matchedQuery: string; error: string }> =
    [];
  for (const q of queries) {
    try {
      const hit = await justTcgSearch(q);
      results.push(hit ?? { matchedQuery: q, error: "NO_MATCH" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ERROR";
      results.push({ matchedQuery: q, error: msg });
      if (msg === "RATE_LIMIT") break; // stop hammering once limited
    }
    // ~120ms spacing → safely under 10/min even with overhead
    await new Promise((r) => setTimeout(r, 120));
  }

  return NextResponse.json({ results });
}
