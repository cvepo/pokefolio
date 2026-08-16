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
      className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
