import { ArrowRight, Crosshair, Gem, Pencil, ShieldCheck, Users, Volume2 } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";

const memories = [
  { icon: Crosshair, title: 'Positioning', copy: 'The agentic marketing operating system for lean teams that need clarity before more content.' },
  { icon: Users, title: 'Ideal customer', copy: 'B2B marketing leaders managing growth with small teams, complex offers, and rising expectations.' },
  { icon: Gem, title: 'Differentiators', list: ['One shared memory across every agent','Strategy, creation, and learning in one loop','Every recommendation explains why'] },
  { icon: ShieldCheck, title: 'Proof points', list: ['14 agent tasks completed overnight','92/100 average brand alignment','3.1× lift from founder-led stories'] },
];

export default function BrandPage() {
  return (
    <div className="page-wrap">
      <PageHeading eyebrow="Brand memory · v1.4" title="The truth every agent shares." description="This kernel keeps strategy, copy, and analysis anchored to the same positioning. Edit a field once and the whole system learns it." actions={<><button className="button button-ghost"><Pencil size={13} /> Edit memory</button><button className="button button-dark">Re-analyze site <ArrowRight size={13} /></button></>} />
      <div className="brand-layout">
        <section className="kernel-card-grid">
          {memories.map(({ icon: Icon, title, copy, list }, i) => <div className="card memory-card" key={title}><div className="memory-number">0{i+1}</div><div className="memory-icon"><Icon size={14} /></div><div className="memory-title">{title}</div>{copy && <div className="memory-copy">{copy}</div>}{list && <div className="bullet-list">{list.map(item => <div className="bullet-item" key={item}>{item}</div>)}</div>}</div>)}
          <div className="card card-pad" style={{ gridColumn:'1 / -1' }}><div className="card-head"><div><div className="card-note">Handling resistance</div><h2 className="section-title" style={{ marginTop:5 }}>Objections & rebuttals</h2></div><span className="tag">3 mapped</span></div>{[['“AI content always sounds generic.”','Agents are constrained by your extracted voice, proof, and positioning—and judged before approval.'],['“We already have too many tools.”','Northwind coordinates the work and memory layer; it does not add another disconnected content queue.']].map(([q,a]) => <div key={q} style={{ display:'grid', gridTemplateColumns:'minmax(170px,.7fr) minmax(0,1fr)', gap:18, padding:'13px 0', borderTop:'1px solid #e8ebe7', fontSize:10, lineHeight:1.5 }}><strong>{q}</strong><span style={{ color:'#68736e' }}>{a}</span></div>)}</div>
        </section>
        <aside className="card voice-panel">
          <div className="card-head"><div><div className="brief-kicker">Voice profile</div><h2 className="section-title" style={{ marginTop:6 }}>How Northwind sounds</h2></div><Volume2 size={17} color="#c8f169" /></div>
          {[['Formal','Casual','62%'],['Technical','Plain','74%'],['Measured','Bold','68%'],['Neutral','Warm','77%'],['Concise','Expansive','38%'],['Serious','Playful','31%']].map(([a,b,p]) => <div className="voice-axis" key={a}><div className="voice-axis-labels"><span>{a}</span><span>{b}</span></div><div className="voice-track"><span style={{ left:p }} /></div></div>)}
          <div className="quote-card">“Move from marketing by guesswork to a system that gets sharper every week.”</div>
          <div style={{ marginTop:19 }}><div className="kernel-field-label">Language rules</div><div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>{['Clear > clever','Use concrete proof','No hype','Short openings','Operator language'].map(x => <span className="tag" key={x}>{x}</span>)}</div></div>
          <button className="button button-primary" style={{ width:'100%', marginTop:20 }}>Open full voice guide <ArrowRight size={13} /></button>
        </aside>
      </div>
    </div>
  );
}
