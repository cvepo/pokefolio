"use client"

import { useEffect, useState } from "react"
import type { Portfolio } from "@/lib/supabase"

export type PortfolioOption = {
  id: string
  name: string
}

type PortfolioSwitcherProps = {
  value: string
  onChange: (value: string) => void
  /**
   * When provided, skip the authenticated /api/portfolios fetch.
   * Demo mode passes store portfolios so the switcher never hits the network.
   */
  portfolios?: PortfolioOption[]
}

/** Defaults to all portfolios combined (PRD §6). Names from GET /api/portfolios unless `portfolios` is passed. */
export function PortfolioSwitcher({ value, onChange, portfolios: portfoliosProp }: PortfolioSwitcherProps) {
  const [fetched, setFetched] = useState<Portfolio[]>([])

  useEffect(() => {
    if (portfoliosProp) return
    fetch("/api/portfolios")
      .then((r) => r.json())
      .then((data) => setFetched(Array.isArray(data) ? data : []))
      .catch(() => setFetched([]))
  }, [portfoliosProp])

  const portfolios = portfoliosProp ?? fetched

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Portfolio scope"
      className="px-2 py-1 rounded-sm border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="all">All portfolios</option>
      {portfolios.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )
}
