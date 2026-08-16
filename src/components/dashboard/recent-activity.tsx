"use client"

import type { ActivityItem, ActivityPayload } from "@/lib/dashboard/contract"
import { formatCents, formatSignedCents } from "@/lib/dashboard/format"
import { formatSnapshotDate } from "@/lib/utils"
import { DashboardPanel } from "@/components/dashboard/panel"
import { cn } from "@/lib/utils"

type RecentActivityProps = {
  activity: ActivityPayload
  /** When false, omit the panel chrome (used inside a shared Activity/Holding tab). */
  bare?: boolean
}

export function RecentActivity({ activity, bare = false }: RecentActivityProps) {
  const body =
    activity.items.length === 0 ? (
      <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-sm">
        No transactions in this scope yet.
      </p>
    ) : (
      <ul className="divide-y divide-border">
        {activity.items.map((item) => (
          <ActivityRow key={item.transactionId} item={item} />
        ))}
      </ul>
    )

  if (bare) return body

  return (
    <DashboardPanel
      title="Recent activity"
      actions={
        activity.totalCount > 0 ? (
          <span className="tabular-nums">
            {activity.items.length} shown
            {activity.totalCount > activity.items.length
              ? ` / ${activity.totalCount} total`
              : ""}
          </span>
        ) : undefined
      }
      bodyClassName="!p-1.5"
    >
      {body}
    </DashboardPanel>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const isBuy = item.type === "buy"
  return (
    <li className="py-1.5 flex items-start justify-between gap-2 first:pt-0 last:pb-0 min-h-[22px]">
      <div className="min-w-0">
        <p className="text-xs font-medium truncate leading-5">{item.productName}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums leading-4">
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
        <p className="text-xs font-semibold tabular-nums leading-5">{formatCents(item.totalAmount)}</p>
        <p className="text-[10px] text-muted-foreground tabular-nums leading-4">
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
