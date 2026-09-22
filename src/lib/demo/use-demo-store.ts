"use client"

/**
 * Client hook over the demo store singleton.
 *
 * Mutations bump a version so React re-renders. Every `/demo` page reads
 * through this so Reset / add / sell update every surface at once.
 */

import { useCallback, useSyncExternalStore } from "react"
import type { AddTransactionInput, DemoStore } from "@/lib/demo/contract"
import { getDemoStore } from "@/lib/demo/get-store"

type Listener = () => void

const listeners = new Set<Listener>()
let version = 0

function emit() {
  version += 1
  for (const l of listeners) l()
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getVersion() {
  return version
}

export function useDemoStore(): DemoStore & { revision: number } {
  const revision = useSyncExternalStore(subscribe, getVersion, getVersion)
  const store = getDemoStore()

  const addTransaction = useCallback((input: AddTransactionInput) => {
    const result = getDemoStore().addTransaction(input)
    if (result.ok) emit()
    return result
  }, [])

  const deleteTransaction = useCallback((transactionId: string) => {
    getDemoStore().deleteTransaction(transactionId)
    emit()
  }, [])

  const reset = useCallback(() => {
    getDemoStore().reset()
    emit()
  }, [])

  return {
    today: store.today,
    state: store.state,
    getDashboard: store.getDashboard.bind(store),
    getPortfolios: store.getPortfolios.bind(store),
    getProduct: store.getProduct.bind(store),
    searchProducts: store.searchProducts.bind(store),
    getTransactions: store.getTransactions.bind(store),
    getCompareSeries: store.getCompareSeries.bind(store),
    addTransaction,
    deleteTransaction,
    reset,
    revision,
  }
}

/** Call after an out-of-band mutation if a page bypasses the wrapped methods. */
export function notifyDemoStoreChanged() {
  emit()
}
