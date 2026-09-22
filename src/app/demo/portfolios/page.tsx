"use client"

import Link from "next/link"
import { FolderOpen } from "lucide-react"
import { useDemoStore } from "@/lib/demo/use-demo-store"
import { centsToDollars } from "@/lib/dashboard/contract"
import { formatCurrency } from "@/lib/utils"

export default function DemoPortfoliosPage() {
  const store = useDemoStore()
  const portfolios = store.getPortfolios()

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Portfolios</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Sample collections — open one to add or sell holdings
        </p>
      </div>

      {portfolios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-lg">
          <FolderOpen size={40} className="text-muted-foreground mb-3" />
          <p className="font-medium">No portfolios in this demo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {portfolios.map((p) => {
            const envelope = store.getDashboard(p.id, "1M")
            const value = centsToDollars(envelope.data.summary.totalValue)
            const positions = envelope.data.summary.positionCount
            return (
              <Link
                key={p.id}
                href={`/demo/portfolios/${p.id}`}
                className="flex items-center justify-between border border-border rounded-lg p-4 bg-card hover:bg-accent/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{p.name}</p>
                  {p.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {positions} position{positions === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums shrink-0 ml-4">
                  {formatCurrency(value)}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
