"use client";

import { useState } from "react";
import { Check, Copy, RefreshCw, Send, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";

const variants = [
  { angle:'Pain-led', score:91, text:"Your team doesn’t need another content calendar.\n\nIt needs a system that remembers what worked, understands why, and makes the next campaign sharper.\n\nNorthwind gives every specialist agent the same brand memory—so strategy, copy, and analysis finally move as one.", bars:[23,22,23,23] },
  { angle:'Proof-led', score:94, text:"14 tasks completed while the team slept.\n92/100 average brand alignment.\nOne system learning from every result.\n\nThat’s what changes when AI stops being a chat window and starts operating like a marketing team.\n\nMeet Northwind.", bars:[24,24,23,23] },
  { angle:'Contrarian', score:87, text:"More content is not a growth strategy.\n\nNeither is adding five AI tools that forget your brand between prompts.\n\nThe advantage is a shared memory and a feedback loop: one truth, specialist agents, measurable learning.\n\nThat’s the operating system we built.", bars:[21,23,22,21] },
];

export default function StudioPage() {
  const [selected,setSelected]=useState(1);
  return <div className="page-wrap">
    <PageHeading eyebrow="Content studio · LinkedIn" title="Three angles. One brand truth." description="The Copywriter generates distinct strategic routes; the Brand Judge independently scores each one against your memory." actions={<button className="button button-dark"><RefreshCw size={13}/> Regenerate all</button>} />
    <div className="studio-layout">
      <aside className="card brief-panel"><div className="card-head"><div><div className="card-note">Source brief</div><h2 className="section-title" style={{marginTop:5}}>Launch narrative</h2></div><Sparkles size={16}/></div>{[['Hook','More content is not a strategy. A learning loop is.'],['Audience','B2B marketing leaders'],['Pillar','Category point of view'],['Goal','Qualified conversations'],['Channel','LinkedIn · Text post']].map(([l,v])=><div className="brief-field" key={l}><div className="brief-field-label">{l}</div><div className="brief-field-value">{v}</div></div>)}<div className="quote-card" style={{background:'#172522',color:'#dce4e1',marginTop:8}}>Judge model is separate from the generator to reduce self-preference bias.</div></aside>
      <section className="variants">{variants.map((v,i)=><article className={`card variant-card ${selected===i?'selected':''}`} key={v.angle}><div className="variant-top"><div><div className="variant-angle">Variant {String.fromCharCode(65+i)}</div><span className={`tag ${i===1?'tag-lime':''}`} style={{marginTop:7}}>{v.angle}</span></div><div className="score-ring" style={{'--score':`${v.score}%`} as React.CSSProperties}><strong>{v.score}</strong></div></div><div className="post-copy">{v.text}</div><div className="score-bars">{['Voice match','Positioning','Claim safety','Audience fit'].map((label,j)=><div className="score-bar" key={label}><span>{label}</span><div className="score-bar-track"><span style={{width:`${v.bars[j]*4}%`}}/></div><strong>{v.bars[j]}</strong></div>)}</div><div className="variant-actions"><button className={`button ${selected===i?'button-primary':'button-ghost'}`} style={{flex:1}} onClick={()=>setSelected(i)}>{selected===i?<><Check size={12}/>Selected</>:"Select"}</button><button className="button button-ghost icon-button" aria-label="Copy variant"><Copy size={13}/></button></div></article>)}</section>
    </div>
    <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:14}}><button className="button button-ghost">Save as draft</button><button className="button button-dark"><Send size={13}/> Approve selected</button></div>
  </div>;
}
