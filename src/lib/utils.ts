import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

/**
 * Format a YYYY-MM-DD snapshot date as "May 11" without timezone shifting.
 * `new Date("2026-05-11")` parses as UTC midnight, which in negative-UTC
 * timezones (e.g. ET) renders as the previous day. We parse the parts
 * directly into a local-midnight Date so the label matches the row's date.
 */
export function formatSnapshotDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number)
  if (!y || !m || !d) return yyyyMmDd
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * Format a calendar span (YYYY-MM-DD inputs) as "1y 3mo", "5mo 12d", "9d", etc.
 * Drops `d` once the span is ≥ 3 months to avoid clutter.
 */
export function formatSpan(startDate: string, endDate: string): string {
  const s = new Date(startDate + "T00:00:00Z")
  const e = new Date(endDate + "T00:00:00Z")
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return ""

  let years = e.getUTCFullYear() - s.getUTCFullYear()
  let months = e.getUTCMonth() - s.getUTCMonth()
  let days = e.getUTCDate() - s.getUTCDate()
  if (days < 0) {
    months -= 1
    const prevMonth = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 0))
    days += prevMonth.getUTCDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }

  const parts: string[] = []
  if (years > 0) parts.push(`${years}y`)
  if (months > 0) parts.push(`${months}mo`)
  if (years === 0 && months < 3 && days > 0) parts.push(`${days}d`)
  if (parts.length === 0) return "0d"
  return parts.join(" ")
}
