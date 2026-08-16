import { dashboardData } from "@/lib/dashboard/data"
import { query, response } from "@/lib/dashboard/http"
export async function GET(request:Request){const {portfolioId,timeframe,limit}=query(request);return response(()=>dashboardData(portfolioId,timeframe,limit))}
