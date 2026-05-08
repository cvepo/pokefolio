"use client"

import { useEffect, useState, useCallback } from "react"
import { Portfolio } from "@/lib/supabase"

const STARRED_KEY = "starredPortfolioId"

export function getStarredPortfolioId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(STARRED_KEY)
}

export function setStarredPortfolioId(id: string | null) {
  if (typeof window === "undefined") return
  if (id == null) localStorage.removeItem(STARRED_KEY)
  else localStorage.setItem(STARRED_KEY, id)
}

/** Returns the active portfolio from the list, preferring starred, then first. */
export function resolveActivePortfolio(portfolios: Portfolio[], starredId: string | null): Portfolio | null {
  if (!portfolios.length) return null
  if (starredId) {
    const found = portfolios.find((p) => p.id === starredId)
    if (found) return found
  }
  return portfolios[0]
}

/** Hook that manages starred + active portfolio state. */
export function useActivePortfolio(portfolios: Portfolio[]) {
  const [starredId, setStarredIdState] = useState<string | null>(null)
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null)

  useEffect(() => {
    const stored = getStarredPortfolioId()
    setStarredIdState(stored)
    const active = resolveActivePortfolio(portfolios, stored)
    setActivePortfolioId(active?.id ?? null)
  }, [portfolios])

  const starPortfolio = useCallback((id: string) => {
    setStarredPortfolioId(id)
    setStarredIdState(id)
  }, [])

  const activePortfolio = portfolios.find((p) => p.id === activePortfolioId) ?? null

  return {
    activePortfolio,
    activePortfolioId,
    setActivePortfolioId,
    starredId,
    starPortfolio,
  }
}
