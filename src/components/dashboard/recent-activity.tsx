"use client"

import type { ActivityItem, ActivityPayload } from "@/lib/dashboard/contract"
import { formatCents, formatSignedCents } from "@/lib/dashboard/format"
import { formatSnapshotDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

type RecentActivityProps = {
  activity: ActivityPayload
}

export function RecentActivity({ activity }: RecentActivityProps) {
  return (
    <section className="border border-border rounded-md bg-card p-3 3xl:p-4 space-y-2 h-full">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Recent activity
        </h2>
        {activity.totalCount > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {activity.items.length} shown
            {activity.totalCount > activity.items.length
              ? ` / ${activity.totalCount} total`
              : ""}
          </span>
        )}
      </div>

      {activity.items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
          No transactions in this scope yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {activity.items.map((item) => (
            <ActivityRow key={item.transactionId} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const isBuy = item.type === "buy"
  return (
    <li className="py-2 flex items-start justify-between gap-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{item.productName}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
          <span
            className={cn(
              "font-semibold uppercase tracking-wide",
              isBuy ? "text-sky-600 dark:text-sky-400" : "text-violet-600 dark:text-violet-400"
            )}
          >
            {isBuy ? "Buy" : "Sell"}
          </span>
          {" · "}
          {item.quantity} × {formatCents(item.unitPrice)}
          {" · "}
          {item.setName}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold tabular-nums">{formatCents(item.totalAmount)}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {formatSnapshotDate(item.date)}
        </p>
        {!isBuy && (
          <p
            className={cn(
              "text-[10px] font-medium tabular-nums",
              item.realizedPnl == null && "text-muted-foreground",
              item.realizedPnl != null && item.realizedPnl >= 0 && "text-emerald-500",
              item.realizedPnl != null && item.realizedPnl < 0 && "text-red-500"
            )}
          >
            {item.realizedPnl == null ? "—" : formatSignedCents(item.realizedPnl)} realized
          </p>
        )}
      </div>
    </li>
  )
}
