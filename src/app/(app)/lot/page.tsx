"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Lot pricing page for pokefolio.
 *
 * Flow:
 *  1. Upload a screenshot of a Facebook listing.
 *  2. Tesseract.js OCRs it in-browser (no API, no quota cost).
 *  3. We split the text into candidate product lines; you confirm/edit/check.
 *  4. Checked lines POST to /api/lot/search which hits JustTCG server-side.
 *  5. Results table with quantities + a % control that toggles between
 *     "share of lot" and "offer at X% of fair value".
 *
 * Tesseract is loaded dynamically from a CDN at click-time so it isn't in your
 * main bundle. If you'd rather vendor it: `npm i tesseract.js` and
 * `import Tesseract from "tesseract.js"` instead of the loader below.
 */

// ── types ───────────────────────────────────────────────────────────────────
type Line = {
  id: string;
  text: string; // editable search query
  qty: number;
  checked: boolean;
};

type Priced = {
  matchedQuery: string;
  name?: string;
  set?: string;
  marketPrice?: number | null;
  error?: string;
};

type Row = Line & {
  result?: Priced;
  loading?: boolean;
};

type Mode = "share" | "offer";

// ── tesseract CDN loader ─────────────────────────────────────────────────────
let tesseractPromise: Promise<any> | null = null;
function loadTesseract(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject("no window");
  if ((window as any).Tesseract) return Promise.resolve((window as any).Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = () => resolve((window as any).Tesseract);
    s.onerror = () => reject(new Error("Failed to load Tesseract"));
    document.body.appendChild(s);
  });
  return tesseractPromise;
}

// ── listing parser ───────────────────────────────────────────────────────────
// Heuristic: keep lines that look like a product, strip leading qty markers
// ("2x", "3 -", "x4"), capture that as quantity, drop obvious noise.
function parseListing(raw: string): Line[] {
  const noise =
    /^(for sale|fs|asking|obo|price|pickup|porch|shipping|ship|venmo|paypal|cash|dm|message|located|located in|no |firm|local|meetup)/i;

  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 4)
    .filter((l) => /[a-zA-Z]/.test(l)) // must contain letters
    .filter((l) => !noise.test(l))
    .map((line, i) => {
      let qty = 1;
      let text = line;

      // leading "2x ", "2 x ", "x2 ", "2 - ", "2) "
      const lead = text.match(/^\s*(?:x\s*)?(\d{1,2})\s*(?:x|\)|-|\.|:)?\s+/i);
      if (lead) {
        const n = parseInt(lead[1], 10);
        if (n >= 1 && n <= 50) {
          qty = n;
          text = text.slice(lead[0].length);
        }
      }
      // trailing "(x3)" / "x3"
      const trail = text.match(/\(?x\s*(\d{1,2})\)?\s*$/i);
      if (trail) {
        const n = parseInt(trail[1], 10);
        if (n >= 1 && n <= 50) {
          qty = n;
          text = text.replace(trail[0], "").trim();
        }
      }

      // drop trailing prices like "$45" so they don't pollute the search query
      text = text.replace(/\$\s?\d+(\.\d{2})?/g, "").trim();
      text = text.replace(/[•\-–—*]+\s*$/g, "").trim();

      return {
        id: `${i}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        qty,
        checked: text.length >= 4,
      };
    })
    .filter((l) => l.text.length >= 4);
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// ── component ────────────────────────────────────────────────────────────────
export default function LotPage() {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("offer");
  const [pct, setPct] = useState(80);

  const fileRef = useRef<HTMLInputElement>(null);

  // 1 + 2: upload → OCR
  const onFile = useCallback(async (file: File) => {
    setSearchError(null);
    setRows([]);
    setOcrText("");
    setImgUrl(URL.createObjectURL(file));
    setOcrProgress(0);
    try {
      const Tesseract = await loadTesseract();
      const { data } = await Tesseract.recognize(file, "eng", {
        logger: (m: any) => {
          if (m.status === "recognizing text") setOcrProgress(m.progress);
        },
      });
      setOcrText(data.text);
      setRows(parseListing(data.text));
    } catch (e) {
      setSearchError(
        e instanceof Error ? e.message : "OCR failed — try pasting text instead"
      );
    } finally {
      setOcrProgress(null);
    }
  }, []);

  // re-parse when user edits the raw OCR box
  const reparse = useCallback(() => setRows(parseListing(ocrText)), [ocrText]);

  // 4: search only checked rows
  const runSearch = useCallback(async () => {
    const checked = rows.filter((r) => r.checked && r.text.trim());
    if (checked.length === 0) return;
    setSearching(true);
    setSearchError(null);
    setRows((prev) =>
      prev.map((r) => (r.checked ? { ...r, loading: true } : r))
    );
    try {
      const res = await fetch("/api/lot/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: checked.map((r) => r.text.trim()) }),
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const { results } = (await res.json()) as { results: Priced[] };
      const byQuery = new Map(results.map((r) => [r.matchedQuery, r]));
      setRows((prev) =>
        prev.map((r) =>
          r.checked
            ? { ...r, loading: false, result: byQuery.get(r.text.trim()) }
            : r
        )
      );
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
      setRows((prev) => prev.map((r) => ({ ...r, loading: false })));
    } finally {
      setSearching(false);
    }
  }, [rows]);

  // ── derived totals ──
  const priced = rows.filter(
    (r) => r.checked && typeof r.result?.marketPrice === "number"
  );
  const lotTotal = useMemo(
    () =>
      priced.reduce(
        (sum, r) => sum + (r.result!.marketPrice as number) * r.qty,
        0
      ),
    [priced]
  );

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Lot Calculator</h1>
        <p className="text-sm text-muted-foreground">
          Upload a listing screenshot, confirm the items, then pull fair-market
          value and run the numbers.
        </p>
      </header>

      {/* Step 1 — upload */}
      <section className="space-y-3">
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8 text-center transition hover:bg-card"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          {imgUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgUrl}
              alt="listing"
              className="max-h-64 rounded-md object-contain"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Click or drop a screenshot of the Facebook listing
            </p>
          )}
        </div>

        {ocrProgress !== null && (
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round(ocrProgress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Reading text… {Math.round(ocrProgress * 100)}%
            </p>
          </div>
        )}
      </section>

      {/* Step 2 — editable OCR text */}
      {ocrText && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Detected text</h2>
            <button
              onClick={reparse}
              className="text-xs text-primary hover:underline"
            >
              Re-parse into items
            </button>
          </div>
          <textarea
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
            className="h-32 w-full rounded-md border border-border bg-background p-2 text-sm font-mono"
          />
        </section>
      )}

      {/* Step 3 — confirm items */}
      {rows.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">
              Items ({rows.filter((r) => r.checked).length} selected)
            </h2>
            <button
              onClick={runSearch}
              disabled={searching || !rows.some((r) => r.checked)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {searching ? "Searching…" : "Get fair value →"}
            </button>
          </div>

          {searchError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {searchError}
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 p-2"></th>
                  <th className="p-2">Item (editable)</th>
                  <th className="w-16 p-2">Qty</th>
                  <th className="w-28 p-2 text-right">Fair value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const unit = r.result?.marketPrice;
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2 align-top">
                        <input
                          type="checkbox"
                          checked={r.checked}
                          onChange={(e) =>
                            updateRow(r.id, { checked: e.target.checked })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={r.text}
                          onChange={(e) =>
                            updateRow(r.id, { text: e.target.value })
                          }
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:outline-none"
                        />
                        {r.result?.set && (
                          <span className="text-xs text-muted-foreground">
                            {r.result.name} · {r.result.set}
                          </span>
                        )}
                        {r.result?.error && (
                          <span className="text-xs text-amber-500">
                            {r.result.error === "NO_MATCH"
                              ? "no match"
                              : r.result.error}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={1}
                          value={r.qty}
                          onChange={(e) =>
                            updateRow(r.id, {
                              qty: Math.max(1, parseInt(e.target.value) || 1),
                            })
                          }
                          className="w-12 rounded border border-border bg-background px-1 py-0.5"
                        />
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {r.loading
                          ? "…"
                          : typeof unit === "number"
                          ? money(unit * r.qty)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Step 5 — % calculator */}
      {priced.length > 0 && (
        <section className="space-y-4 rounded-lg border border-border bg-card/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                Total fair-market value
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {money(lotTotal)}
              </p>
            </div>

            {/* mode toggle */}
            <div className="flex rounded-md border border-border p-0.5 text-xs">
              <button
                onClick={() => setMode("offer")}
                className={`rounded px-3 py-1 ${
                  mode === "offer"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Offer at %
              </button>
              <button
                onClick={() => setMode("share")}
                className={`rounded px-3 py-1 ${
                  mode === "share"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Share of lot
              </button>
            </div>
          </div>

          {mode === "offer" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={pct}
                  onChange={(e) => setPct(parseInt(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={pct}
                  onChange={(e) =>
                    setPct(
                      Math.min(100, Math.max(1, parseInt(e.target.value) || 0))
                    )
                  }
                  className="w-16 rounded border border-border bg-background px-2 py-1 text-sm"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">
                  Offer at {pct}% of fair value
                </span>
                <span className="text-2xl font-semibold tabular-nums text-primary">
                  {money((lotTotal * pct) / 100)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                You&apos;d save {money(lotTotal - (lotTotal * pct) / 100)} vs.
                fair value.
              </p>
            </div>
          ) : (
            // share of lot: each item's % of total
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Item</th>
                    <th className="w-28 p-2 text-right">Value</th>
                    <th className="w-20 p-2 text-right">% of lot</th>
                  </tr>
                </thead>
                <tbody>
                  {priced.map((r) => {
                    const v = (r.result!.marketPrice as number) * r.qty;
                    const share = lotTotal > 0 ? (v / lotTotal) * 100 : 0;
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="p-2">
                          {r.qty > 1 ? `${r.qty}× ` : ""}
                          {r.result?.name ?? r.text}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {money(v)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {share.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
