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

/** Currency with an explicit +/− sign (e.g. "+$12.50", "−$3.00"). */
export function formatSignedCurrency(value: number): string {
  const abs = formatCurrency(Math.abs(value))
  if (value > 0) return `+${abs}`
  if (value < 0) return `−${abs}`
  return abs
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
 * UTC hour at which the scheduled sync fires.
 * MUST stay in sync with `crons[0].schedule` in vercel.json ("0 9 * * *").
 */
export const SYNC_CRON_UTC_HOUR = 9

/**
 * Describe when the scheduled sync actually fires, in both the timezone the
 * day selection is evaluated in and the viewer's own timezone.
 *
 * These can disagree about which DAY it is: 09:00 UTC is Wed 5:00 AM in
 * America/New_York but Tue 11:00 PM in Pacific/Honolulu. Selecting "Wed" means
 * the Eastern Wednesday, so a viewer further west sees it run the evening
 * before. Surfacing both sides is the difference between that being a
 * documented behaviour and looking like an off-by-one bug.
 */
export function describeSyncTime(scheduleTimeZone: string, at: Date = new Date()): {
  scheduleLabel: string
  localLabel: string
  localTimeZone: string
  differentDay: boolean
} {
  // Reference instant: today's cron firing, in UTC.
  const ref = new Date(at)
  ref.setUTCHours(SYNC_CRON_UTC_HOUR, 0, 0, 0)

  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const label = (tz: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(ref)
  const day = (tz: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(ref)

  return {
    scheduleLabel: label(scheduleTimeZone),
    localLabel: label(localTimeZone),
    localTimeZone,
    differentDay: day(scheduleTimeZone) !== day(localTimeZone),
  }
}

/**
 * Format a timestamptz as "Aug 6, 2026 at 3:42 PM" in the viewer's local time.
 * Used for the sync log, where the exact minute matters.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Compact variant for tight spaces: "Aug 6, 3:42 PM". */
export function formatDateTimeShort(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
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
