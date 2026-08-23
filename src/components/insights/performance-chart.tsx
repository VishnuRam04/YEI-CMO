"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  {day:'Mon', ctr:2.8, benchmark:2.4},{day:'Tue',ctr:3.4,benchmark:2.5},{day:'Wed',ctr:3.1,benchmark:2.5},
  {day:'Thu',ctr:4.3,benchmark:2.6},{day:'Fri',ctr:4.0,benchmark:2.6},{day:'Sat',ctr:4.9,benchmark:2.7},{day:'Sun',ctr:4.8,benchmark:2.7},
];

export function PerformanceChart() {
  return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:10,right:8,left:-25,bottom:0}}><defs><linearGradient id="ctrFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8ecb24" stopOpacity={.3}/><stop offset="100%" stopColor="#8ecb24" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e9ece8" vertical={false}/><XAxis dataKey="day" tick={{fontSize:9,fill:'#7d8783'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:9,fill:'#7d8783'}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{border:'1px solid #dde2dd',borderRadius:10,fontSize:10,boxShadow:'none'}}/><Area type="monotone" dataKey="benchmark" stroke="#aab3af" strokeDasharray="4 4" fill="none"/><Area type="monotone" dataKey="ctr" stroke="#6e9d19" strokeWidth={2} fill="url(#ctrFill)"/></AreaChart></ResponsiveContainer></div>;
}
