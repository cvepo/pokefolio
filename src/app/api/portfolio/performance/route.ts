import { performanceData } from "@/lib/dashboard/data"
import { query, response } from "@/lib/dashboard/http"
export async function GET(request:Request){const {portfolioId,timeframe}=query(request);return response(()=>performanceData(portfolioId,timeframe))}
