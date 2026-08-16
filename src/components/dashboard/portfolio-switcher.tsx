"use client"

import { useEffect, useState } from "react"
import type { Portfolio } from "@/lib/supabase"

type PortfolioSwitcherProps = {
  value: string
  onChange: (value: string) => void
}

/** Defaults to all portfolios combined (PRD §6). Names from GET /api/portfolios. */
export function PortfolioSwitcher({ value, onChange }: PortfolioSwitcherProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])

  useEffect(() => {
    fetch("/api/portfolios")
      .then((r) => r.json())
      .then((data) => setPortfolios(Array.isArray(data) ? data : []))
      .catch(() => setPortfolios([]))
  }, [])

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
