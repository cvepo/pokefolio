"use client"

import { useEffect } from "react"

/**
 * Constrain the app shell's <main> to one viewport for /dashboard-v2 only.
 * Other routes keep `overflow-auto` from (app)/layout.tsx.
 */
export function useDashboardViewportLock() {
  useEffect(() => {
    const main = document.querySelector("main")
    if (!(main instanceof HTMLElement)) return

    const prev = {
      overflow: main.style.overflow,
      height: main.style.height,
      maxHeight: main.style.maxHeight,
      minHeight: main.style.minHeight,
    }

    main.style.overflow = "hidden"
    main.style.height = "100dvh"
    main.style.maxHeight = "100dvh"
    main.style.minHeight = "0"

    return () => {
      main.style.overflow = prev.overflow
      main.style.height = prev.height
      main.style.maxHeight = prev.maxHeight
      main.style.minHeight = prev.minHeight
    }
  }, [])
}
