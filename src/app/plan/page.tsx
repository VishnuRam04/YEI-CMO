import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Linkedin, Mail, MoreHorizontal, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";

const items = [
  { channel:'in', icon:Linkedin, angle:'Contrarian', pillar:'Point of view', hook:'More content is not a strategy. A learning loop is.', reason:'Contrarian openings earned 42% more stops with your marketing-leader ICP.' },
  { channel:'@', icon:Mail, angle:'Proof-led', pillar:'Customer evidence', hook:'The campaign that got sharper after it launched.', reason:'Specific operational stories outperform feature lists by 3.1× in your recent data.' },
  { channel:'in', icon:Linkedin, angle:'Founder story', pillar:'Behind the build', hook:'We hired five AI specialists before we hired another marketer.', reason:'Founder-led narratives generate your strongest qualified-comment rate.' },
];

export default function PlanPage() {
  return <div className="page-wrap">
    <PageHeading eyebrow="Weekly plan · 17–23 August" title="A week with a point of view." description="The Strategist turns brand memory and learned performance patterns into an explainable channel plan." actions={<><button className="button button-ghost"><ChevronLeft size={13} /><CalendarDays size={13}/><ChevronRight size={13}/></button><button className="button button-dark"><Sparkles size={13}/> Regenerate plan</button></>} />
    <div className="week-strip">{[['Mon','17'],['Tue','18'],['Wed','19'],['Thu','20'],['Fri','21'],['Sat','22'],['Sun','23']].map(([d,n],i)=><button className={`day-tab ${i===2?'active':''}`} key={d}>{d}<strong>Aug {n}</strong></button>)}</div>
    <div className="plan-layout">
      <section className="card card-pad"><div className="card-head"><div><div className="card-note">Wednesday · 3 items</div><h2 className="section-title" style={{marginTop:5}}>Today’s narrative</h2></div><span className="tag tag-lime">Balanced mix</span></div>
        {items.map(({icon:Icon,angle,pillar,hook,reason})=><div className="plan-item" key={hook}><div className="channel-icon"><Icon size={17}/></div><div><div className="plan-meta"><span className="tag">{angle}</span><span className="tag tag-violet">{pillar}</span></div><div className="plan-hook">{hook}</div><div className="plan-reason"><strong>Why this:</strong> {reason}</div></div><div style={{display:'grid',gap:7}}><Link href="/studio/launch" className="button button-primary">Draft <ArrowRight size={12}/></Link><button className="button button-ghost icon-button" aria-label="More options"><MoreHorizontal size={14}/></button></div></div>)}
      </section>
      <aside className="card strategy-card"><div className="brief-kicker">Strategist’s reasoning</div><h2 className="section-title" style={{marginTop:8}}>Build recognition, then make the proof land.</h2><p className="brief-copy" style={{marginTop:10}}>This week moves from a sharp category point of view into operational evidence. It gives prospects a reason to care before asking them to believe.</p><div className="strategy-list">{[['01','Open with tension','Challenge volume-first marketing to create a memorable enemy.'],['02','Earn belief','Show the product learning from real campaign signals.'],['03','Humanize the system','Use the founder story to make agentic work feel practical.']].map(([n,t,c])=><div className="strategy-item" key={n}><span className="strategy-num">{n}</span><span><strong style={{display:'block',color:'white',marginBottom:3}}>{t}</strong>{c}</span></div>)}</div><div className="divider" style={{background:'rgba(255,255,255,.1)',margin:'18px 0'}}/><div className="kernel-field-label">Expected outcome</div><div style={{fontFamily:'Georgia,serif',fontSize:18,lineHeight:1.35}}>More qualified conversations, not simply more impressions.</div></aside>
    </div>
  </div>;
}
