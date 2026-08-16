import type { ActivityPayload } from "@/lib/dashboard/contract"
import { toCents } from "@/lib/dashboard/contract"
import type { HoldingsReplay } from "@/lib/holdings"
import type { Product, Transaction } from "@/lib/supabase"

type ActivityTransaction = Transaction & { product?: Product }

export function buildActivity(
  transactions: ActivityTransaction[],
  portfolioNames: Map<string, string>,
  replayByProduct: Map<string, HoldingsReplay>
): ActivityPayload {
  const realizedByTransaction = new Map(
    [...replayByProduct.values()].flatMap((replay) =>
      replay.transactions.map((result) => [result.transactionId, result.realizedPnl] as const)
    )
  )

  return {
    totalCount: transactions.length,
    items: [...transactions]
      .sort(
        (a, b) =>
          b.transaction_date.localeCompare(a.transaction_date) ||
          b.created_at.localeCompare(a.created_at)
      )
      .slice(0, 50)
      .map((transaction) => ({
        transactionId: transaction.id,
        portfolioId: transaction.portfolio_id,
        portfolioName: portfolioNames.get(transaction.portfolio_id) ?? "Unknown",
        productId: transaction.product_id,
        productName: transaction.product?.name ?? transaction.product_id,
        setName: transaction.product?.set_name ?? "",
        type: transaction.type,
        quantity: transaction.quantity,
        unitPrice: toCents(transaction.price),
        totalAmount: toCents(Number(transaction.price) * transaction.quantity),
        date: transaction.transaction_date,
        realizedPnl:
          transaction.type === "sell"
            ? toCents(realizedByTransaction.get(transaction.id) ?? 0)
            : null,
        notes: transaction.notes,
      })),
  }
}
