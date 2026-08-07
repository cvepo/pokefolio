import { describe, it, expect } from "vitest"
import { fetchAllPriceSnapshots } from "@/lib/price-lookup"

type Row = { product_id: string; price: number | string; snapshot_date: string }

/**
 * Minimal stand-in for the Supabase query builder, enforcing the behaviour that
 * makes this function necessary: `.range(from, to)` never returns more than
 * PAGE rows, mirroring Supabase's 1,000-row cap.
 */
function makeClient(rows: Row[], opts: { cap?: number } = {}) {
  const cap = opts.cap ?? 1000
  const calls: Array<[number, number]> = []
  const client = {
    from: () => ({
      select: () => ({
        in: () => ({
          range: async (from: number, to: number) => {
            calls.push([from, to])
            const slice = rows.slice(from, Math.min(to + 1, from + cap))
            return { data: slice }
          },
        }),
      }),
    }),
  }
  return { client, calls }
}

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    product_id: `p${i % 20}`,
    price: 10 + i,
    snapshot_date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
  }))
}

describe("fetchAllPriceSnapshots pagination", () => {
  // PRD §10 test 23. Silent truncation at 1,000 rows was the highest-severity
  // risk identified: a single `.select()` returns a plausible-looking chart
  // built from a third of the data. This is the only test that catches it.
  it("23. retrieves more than 1,000 rows by paging", async () => {
    const rows = makeRows(2_500)
    const { client, calls } = makeClient(rows)

    const out = await fetchAllPriceSnapshots(client, ["p0"])

    expect(out).toHaveLength(2_500)
    expect(out.length).toBeGreaterThan(1_000)
    // 3 pages: 0-999, 1000-1999, 2000-2999 (last is short, loop stops).
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    // Rows past the cap must actually be present, not just counted.
    expect(out[2_499]).toEqual(rows[2_499])
  })

  it("23a. stops cleanly when the total is an exact multiple of the page size", async () => {
    const { client, calls } = makeClient(makeRows(2_000))
    const out = await fetchAllPriceSnapshots(client, ["p0"])
    expect(out).toHaveLength(2_000)
    // Needs a third, empty request to learn there is nothing left.
    expect(calls).toHaveLength(3)
  })

  it("23b. single short page returns without a second request", async () => {
    const { client, calls } = makeClient(makeRows(42))
    const out = await fetchAllPriceSnapshots(client, ["p0"])
    expect(out).toHaveLength(42)
    expect(calls).toHaveLength(1)
  })

  it("23c. no product ids short-circuits without querying", async () => {
    const { client, calls } = makeClient(makeRows(10))
    expect(await fetchAllPriceSnapshots(client, [])).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it("23d. a null data page terminates the loop", async () => {
    const client = {
      from: () => ({
        select: () => ({ in: () => ({ range: async () => ({ data: null }) }) }),
      }),
    }
    expect(await fetchAllPriceSnapshots(client, ["p0"])).toEqual([])
  })
})
