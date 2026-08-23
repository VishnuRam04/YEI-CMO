import { ArrowRight, Check, FlaskConical, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";

const generic = `AI is transforming the way businesses approach marketing.

With powerful automation and data-driven insights, companies can create better content, reach more customers, and drive growth.

Ready to take your marketing to the next level? Discover what AI can do for your business.`;
const grounded = `More content is not a strategy. A learning loop is.

Northwind gives lean marketing teams five specialist agents that share one brand memory—then learn from every result.

So the next campaign doesn’t start from a blank prompt. It starts from what your market already taught you.`;

export default function ProofPage() {
  return <div className="page-wrap">
    <PageHeading eyebrow="Proof lab · Brand memory test" title="See what the memory changes." description="The same brief, model, and channel—generated once without your Brand Kernel and once with it. The difference should be obvious." actions={<button className="button button-dark"><FlaskConical size={13}/> Run a new test</button>} />
    <div className="proof-split">
      <article className="card proof-card"><div className="proof-label generic"><span>Without brand memory</span><span>Generic baseline</span></div><div className="proof-body">{generic}</div><div className="proof-footer"><div><div className="card-note">Brand score</div><div className="proof-score">48<span style={{fontSize:12,color:'#89928f'}}>/100</span></div></div><span className="tag tag-orange">4 generic claims</span></div></article>
      <article className="card proof-card" style={{borderColor:'#bad67f'}}><div className="proof-label grounded"><span>With brand memory</span><span><Sparkles size={10}/> Kernel grounded</span></div><div className="proof-body">{grounded}</div><div className="proof-footer"><div><div className="card-note">Brand score</div><div className="proof-score">94<span style={{fontSize:12,color:'#89928f'}}>/100</span></div></div><span className="tag tag-lime">3 memory anchors</span></div></article>
    </div>
    <section className="card card-pad" style={{marginTop:15}}><div className="card-head"><div><div className="card-note">Judge explanation</div><h2 className="section-title" style={{marginTop:5}}>Why the grounded version wins</h2></div><span className="tag"><ShieldCheck size={11}/> Independent verdict</span></div>
      {[['Ownable category tension','“More content is not a strategy” names the enemy defined in your positioning.','Positioning · 24/25'],['Specific product mechanism','Five specialist agents and one shared brand memory replace broad AI claims.','Claim safety · 23/25'],['Audience-aware language','“Lean marketing teams” speaks directly to the primary ICP.','Audience fit · 24/25'],['Recognizable voice','Short, measured sentences and operator language match the extracted profile.','Voice · 23/25']].map(([t,c,s])=><div className="evidence-row" key={t}><div className="evidence-check"><Check size={13}/></div><div><strong style={{display:'block',marginBottom:3}}>{t}</strong><span style={{color:'#74807b'}}>{c}</span></div><span className="tag">{s}</span></div>)}
      <button className="button button-primary" style={{marginTop:14}}>Use grounded version <ArrowRight size={13}/></button>
    </section>
  </div>;
}
