import { publishAnalyticsSnapshot } from "@/lib/analytics/engine"

/**
 * Recompute analytics for the combined scope and one portfolio, without ever
 * throwing.
 *
 * PRD §7 requires transaction mutations to refresh analytics immediately rather
 * than waiting for the next scheduled sync. But the mutation itself is the
 * user's actual intent and is already committed by the time this runs — a
 * recompute failure must not surface as "adding your purchase failed" when the
 * purchase was in fact saved. The next sync or mutation rebuilds the snapshot
 * anyway, so the correct failure mode here is a logged warning, not a 500.
 *
 * Returns the error message when publishing failed, or null on success, so a
 * caller can surface staleness if it wants to.
 */
export async function refreshAnalyticsAfterMutation(
  portfolioId: string,
  source?: { transactionId?: string }
): Promise<string | null> {
  try {
    await publishAnalyticsSnapshot({ source })
    await publishAnalyticsSnapshot({ portfolioId, source })
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      "[analytics] refresh after mutation failed; the mutation itself was saved:",
      message
    )
    return message
  }
}
