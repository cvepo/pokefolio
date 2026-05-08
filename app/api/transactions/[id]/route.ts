import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { rebuildPortfolioSnapshots } from "@/lib/rebuild-portfolio-snapshots"
import { checkOversell } from "@/lib/holdings"
import type { Transaction } from "@/lib/supabase"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const { data: existing, error: existErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single()
  if (existErr || !existing) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
  }

  // Build the patch object — only allow specific editable fields.
  const patch: Partial<Transaction> = {}
  if (body.quantity !== undefined) {
    const q = Number.parseInt(body.quantity, 10)
    if (!Number.isFinite(q) || q < 1) {
      return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 })
    }
    patch.quantity = q
  }
  if (body.price !== undefined) {
    const p = Number.parseFloat(body.price)
    if (!Number.isFinite(p) || p < 0) {
      return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 })
    }
    patch.price = p
  }
  if (body.transaction_date !== undefined) patch.transaction_date = body.transaction_date
  if (body.notes !== undefined) patch.notes = body.notes ?? null

  // If editing a sell or changing a buy's quantity, recheck for over-selling.
  if (existing.type === "sell" || (existing.type === "buy" && patch.quantity !== undefined)) {
    const { data: siblings } = await supabase
      .from("transactions")
      .select("*")
      .eq("portfolio_id", existing.portfolio_id)
      .eq("product_id", existing.product_id)

    // Simulate the patch in memory and re-validate via FIFO.
    const simulated = (siblings ?? []).map((t) =>
      t.id === id ? { ...t, ...patch } : t
    ) as Transaction[]
    // Pretend no transaction is being added — checkOversell expects "existing" + new sell qty.
    // For an edit, we just verify the resulting set has non-negative net qty at all times.
    let running = 0
    const sorted = [...simulated].sort((a, b) => {
      const d = a.transaction_date.localeCompare(b.transaction_date)
      if (d !== 0) return d
      return (a.created_at ?? "").localeCompare(b.created_at ?? "")
    })
    for (const tx of sorted) {
      running += (tx.type === "buy" ? 1 : -1) * tx.quantity
      if (running < 0) {
        return NextResponse.json(
          { error: "Edit would cause net holdings to drop below 0 at some point in the timeline." },
          { status: 400 }
        )
      }
    }
  }

  const { data, error } = await supabase
    .from("transactions")
    .update(patch)
    .eq("id", id)
    .select("*, product:products(*)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await rebuildPortfolioSnapshots([existing.portfolio_id])
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: existing } = await supabase
    .from("transactions")
    .select("portfolio_id, product_id, type, quantity")
    .eq("id", id)
    .single()
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // If deleting a buy, ensure net holdings stay non-negative for all dates.
  if (existing.type === "buy") {
    const { data: siblings } = await supabase
      .from("transactions")
      .select("*")
      .eq("portfolio_id", existing.portfolio_id)
      .eq("product_id", existing.product_id)
    const remaining = (siblings ?? []).filter((t) => t.id !== id) as Transaction[]
    const err = checkOversell(remaining, 0) // any sell now exceeding remaining buys?
    // checkOversell with sellQty=0 only validates current net ≥ 0 trivially. Do a stricter walk:
    let running = 0
    const sorted = [...remaining].sort((a, b) => {
      const d = a.transaction_date.localeCompare(b.transaction_date)
      if (d !== 0) return d
      return (a.created_at ?? "").localeCompare(b.created_at ?? "")
    })
    for (const tx of sorted) {
      running += (tx.type === "buy" ? 1 : -1) * tx.quantity
      if (running < 0) {
        return NextResponse.json(
          { error: "Deleting this buy would cause net holdings to drop below 0 (you've sold these units)." },
          { status: 400 }
        )
      }
    }
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const { error } = await supabase.from("transactions").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await rebuildPortfolioSnapshots([existing.portfolio_id])
  return NextResponse.json({ ok: true })
}
