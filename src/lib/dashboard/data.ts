import { supabase } from "@/lib/supabase-server"
import type { ActivityPayload, ApiEnvelope, DashboardPayload, InsightsPayload, PortfolioAllocation, PortfolioPerformance, PortfolioSummary, PositionsPayload, SyncState, SyncStatusPayload, Timeframe } from "./contract"

type Snapshot = {
  id:string;as_of:string;summary:PortfolioSummary;performance:PortfolioPerformance & {seriesByTimeframe?:Record<Timeframe,PortfolioPerformance["series"]>};
  allocation:PortfolioAllocation;activity:ActivityPayload
}

export class NoPublishedSnapshotError extends Error {}

export async function latestSnapshot(portfolioId?: string): Promise<Snapshot> {
  let query = supabase.from("analytics_snapshots").select("id,as_of,summary,performance,allocation,activity").eq("status","published").order("as_of",{ascending:false}).limit(1)
  query = portfolioId ? query.eq("scope_portfolio_id",portfolioId) : query.is("scope_portfolio_id",null)
  const {data,error}=await query.maybeSingle()
  if(error) throw new Error(error.message)
  if(!data) throw new NoPublishedSnapshotError("No published analytics snapshot exists for this scope")
  return data as Snapshot
}

export function envelope<T>(snapshot:Snapshot,data:T):ApiEnvelope<T>{return {asOf:snapshot.as_of,snapshotId:snapshot.id,currency:"USD",data}}
export async function summaryData(portfolioId?:string){const s=await latestSnapshot(portfolioId);return envelope(s,s.summary)}
export async function performanceData(portfolioId:string|undefined,timeframe:Timeframe){const s=await latestSnapshot(portfolioId);return envelope(s,{...s.performance,seriesTimeframe:timeframe,series:s.performance.seriesByTimeframe?.[timeframe]??s.performance.series})}
export async function positionsData(portfolioId?:string){const s=await latestSnapshot(portfolioId);const {data,error}=await supabase.from("snapshot_positions").select("position").eq("snapshot_id",s.id);if(error)throw new Error(error.message);return envelope<PositionsPayload>(s,{positions:(data??[]).map(r=>r.position),heatmapColorDomain:{min:-0.25,max:0.25}})}
export async function allocationData(portfolioId?:string){const s=await latestSnapshot(portfolioId);return envelope(s,s.allocation)}
export async function activityData(portfolioId:string|undefined,limit:number){const s=await latestSnapshot(portfolioId);return envelope(s,{items:s.activity.items.slice(0,limit),totalCount:s.activity.totalCount})}
export async function insightsData(portfolioId?:string){const s=await latestSnapshot(portfolioId);let q=supabase.from("insight_events").select("*,product:products(name,set_name)").or(`state.eq.active,resolved_at.gte.${new Date(Date.now()-30*86400000).toISOString()}`).order("severity",{ascending:false});if(portfolioId){/* events are snapshot-scoped; published scope below filters them */q=q.eq("snapshot_id",s.id)}const {data,error}=await q;if(error)throw new Error(error.message);const events=(data??[]).map((r)=>({id:r.id,type:r.type,category:r.payload?.category??"needs_attention",state:r.state,severity:Number(r.severity),entityId:r.entity_id,entityName:r.product?.name??r.entity_id,setName:r.product?.set_name??"",headline:r.payload?.headline??r.type,detail:r.payload?.detail??null,triggeredAt:r.triggered_at,resolvedAt:r.resolved_at,seenAt:r.seen_at,snapshotId:r.snapshot_id,dedupeKey:r.dedupe_key,payload:r.payload})) as InsightsPayload["events"];return envelope<InsightsPayload>(s,{events,activeCount:events.filter(e=>e.state==="active").length,unseenCount:events.filter(e=>e.state==="active"&&!e.seenAt).length,totalCount:events.length})}
export async function syncData(portfolioId?:string){const s=await latestSnapshot(portfolioId);const {data:runs}=await supabase.from("sync_runs").select("*").order("started_at",{ascending:false}).limit(50);const latest=runs?.[0]??null;const success=runs?.find(r=>r.status==="success"||r.status==="partial")??null;const age=success?Date.now()-new Date(success.finished_at??success.started_at).getTime():Infinity;let state:SyncState=latest?.finished_at==null?"in_progress":latest?.status==="failed"?"failed":latest?.status==="partial"?"partially_priced":age>36*3600000?"stale":"fresh";const payload:SyncStatusPayload={state,lastAttemptedAt:latest?.started_at??null,lastAttemptStatus:latest?.status??null,lastSuccessfulAt:success?.finished_at??success?.started_at??null,productsTotal:latest?.products_total??0,productsSynced:latest?.products_synced??0,productsFailed:latest?.products_failed??0,failures:(latest?.failures??[]).map((f:{product_id:string;name?:string;reason:string})=>({productId:f.product_id,name:f.name??null,reason:f.reason})),stalePositionCount:s.summary.stalePositionCount,nextScheduledDescription:null};return envelope(s,payload)}
export async function dashboardData(portfolioId:string|undefined,timeframe:Timeframe,limit:number):Promise<ApiEnvelope<DashboardPayload>>{const [summary,performance,positions,allocation,activity,insights,sync]=await Promise.all([summaryData(portfolioId),performanceData(portfolioId,timeframe),positionsData(portfolioId),allocationData(portfolioId),activityData(portfolioId,limit),insightsData(portfolioId),syncData(portfolioId)]);return {asOf:summary.asOf,snapshotId:summary.snapshotId,currency:"USD",data:{summary:summary.data,performance:performance.data,positions:positions.data,allocation:allocation.data,activity:activity.data,insights:insights.data,sync:sync.data}}}
