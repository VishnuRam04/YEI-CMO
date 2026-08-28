"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface PerformancePoint {
  day: string;
  ctr: number;
}

export function PerformanceChart({ data }: { data: PerformancePoint[] }) {
  if (data.length === 0) {
    return <div className="chart-wrap chart-empty">Import performance metrics to see daily click-through rate.</div>;
  }
  return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:10,right:8,left:-25,bottom:0}}><defs><linearGradient id="ctrFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8ecb24" stopOpacity={.3}/><stop offset="100%" stopColor="#8ecb24" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e9ece8" vertical={false}/><XAxis dataKey="day" tick={{fontSize:9,fill:'#7d8783'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:9,fill:'#7d8783'}} axisLine={false} tickLine={false}/><Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, "CTR"]} contentStyle={{border:'1px solid #dde2dd',borderRadius:10,fontSize:10,boxShadow:'none'}}/><Area type="monotone" dataKey="ctr" stroke="#6e9d19" strokeWidth={2} fill="url(#ctrFill)"/></AreaChart></ResponsiveContainer></div>;
}
