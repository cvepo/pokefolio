import { allocationData } from "@/lib/dashboard/data"
import { query, response } from "@/lib/dashboard/http"

export async function GET(request: Request) {
  const { portfolioId } = query(request)
  return response(() => allocationData(portfolioId))
}
