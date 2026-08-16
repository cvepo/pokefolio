import { NextResponse } from "next/server"
import { NoPublishedSnapshotError } from "./data"
import { TIMEFRAMES, type Timeframe } from "./contract"

export function query(request:Request){const p=new URL(request.url).searchParams;const raw=p.get("timeframe")??"1M";return {portfolioId:p.get("portfolioId")??undefined,timeframe:(TIMEFRAMES.includes(raw as Timeframe)?raw:"1M") as Timeframe,limit:Math.min(100,Math.max(0,Number.parseInt(p.get("limit")??"10",10)||10))}}
export async function response<T>(work:()=>Promise<T>){try{return NextResponse.json(await work())}catch(error){if(error instanceof NoPublishedSnapshotError)return NextResponse.json({error:error.message,code:"no_snapshot"},{status:503});console.error("[dashboard]",error);return NextResponse.json({error:"Dashboard data is unavailable",code:"internal"},{status:500})}}
