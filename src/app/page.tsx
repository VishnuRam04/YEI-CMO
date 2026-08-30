import Link from "next/link";
import { ArrowRight, CircleDollarSign, MousePointerClick, Sparkles, Target, TrendingUp, WandSparkles, BrainCircuit, PenTool, BarChart3 } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";

const metrics = [
  { icon: MousePointerClick, value: "4.8%", label: "Average click-through rate", trend: "+18.4%" },
  { icon: Target, value: "28", label: "Qualified conversions", trend: "+7 this week" },
  { icon: Sparkles, value: "92", label: "Average brand score", trend: "+4.2 pts" },
  { icon: CircleDollarSign, value: "$12.40", label: "Cost per conversion", trend: "−14.8%" },
];

const activity = [
  { icon: BrainCircuit, agent: "Brand Analyst", copy: "refined the enterprise ICP using 3 new proof points", time: "4m" },
  { icon: PenTool, agent: "Copywriter", copy: "created 3 launch variants for LinkedIn", time: "18m" },
  { icon: Sparkles, agent: "Brand Judge", copy: "scored “Operator’s playbook” at 94/100", time: "23m" },
  { icon: BarChart3, agent: "Performance Analyst", copy: "found founder stories outperform by 3.1×", time: "1h" },
];

export default function OverviewPage() {
  return (
    <div className="page-wrap">
      <PageHeading eyebrow="Wednesday, 19 August" title="Good morning, Alex." description="Your agent team has completed 14 tasks since yesterday. Here’s what is moving the brand forward." actions={<Link className="button button-dark" href="/cmo">Talk to your CMO <ArrowRight size={13} /></Link>} />
      <div className="grid-4">
        {metrics.map(({ icon: Icon, value, label, trend }) => <div className="card card-pad metric-card" key={label}><span className="metric-icon"><Icon size={15} /></span><div className="metric-value">{value}</div><div className="metric-label">{label}</div><span className="metric-trend">{trend}</span></div>)}
      </div>
      <div className="split" style={{ marginTop: 16 }}>
        <section className="card card-pad">
          <div className="card-head"><div><div className="card-note">This week</div><h2 className="section-title" style={{ marginTop: 5 }}>Campaign pulse</h2></div><span className="tag tag-lime"><TrendingUp size={11} /> On track</span></div>
          <div className="brief-card">
            <div className="brief-kicker">Priority brief · Launch narrative</div>
            <div className="brief-title">Make the cost of “marketing by guesswork” impossible to ignore.</div>
            <div className="brief-copy">The Strategist recommends a proof-led founder series across LinkedIn and email. It is grounded in your operations ICP and strongest customer evidence.</div>
            <Link href="/plan" className="button button-primary" style={{ marginTop: 17, position: "relative", zIndex: 2 }}>Open weekly plan <ArrowRight size={13} /></Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12 }}>
            {[['8','Assets planned'],['5','Ready to approve'],['3','Channels active']].map(([v,l]) => <div key={l} style={{ padding: '14px', background: '#f6f7f3', borderRadius: 11 }}><div style={{ fontFamily: 'Georgia,serif', fontSize: 23 }}>{v}</div><div style={{ fontSize: 9, color: '#7b8581', marginTop: 3 }}>{l}</div></div>)}
          </div>
        </section>
        <section className="card card-pad">
          <div className="card-head"><div><div className="card-note">Live log</div><h2 className="section-title" style={{ marginTop: 5 }}>Agent activity</h2></div><span className="tag">Live</span></div>
          {activity.map(({ icon: Icon, agent, copy, time }) => <div className="activity-row" key={agent + time}><div className="agent-avatar"><Icon size={14} /></div><div className="activity-copy"><strong>{agent}</strong> {copy}</div><div className="activity-time">{time}</div></div>)}
          <Link href="/plan" className="button button-ghost" style={{ width: '100%', marginTop: 13 }}><WandSparkles size={13} /> Open the campaign plan</Link>
        </section>
      </div>
    </div>
  );
}
