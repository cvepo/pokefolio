import { activityData } from "@/lib/dashboard/data"
import { query, response } from "@/lib/dashboard/http"

export async function GET(request: Request) {
  const { portfolioId, limit } = query(request)
  return response(() => activityData(portfolioId, limit))
}
