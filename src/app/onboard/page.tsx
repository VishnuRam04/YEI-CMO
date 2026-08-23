"use client";

import { useState } from "react";
import { ArrowRight, Check, FileText, Globe2, Radar, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";

export default function OnboardPage() {
  const [url, setUrl] = useState("northwindlabs.com");
  const [scanning, setScanning] = useState(false);

  function scan() {
    setScanning(true);
    window.setTimeout(() => setScanning(false), 1400);
  }

  return (
    <div className="page-wrap">
      <PageHeading eyebrow="Brand onboarding · Step 1 of 3" title="Teach the system your brand." description="Give the Brand Analyst a URL. It will read your positioning, audience, proof, and language—then assemble a durable source of truth for every agent." />
      <div className="stepper"><span className="step active" /><span className="step" /><span className="step" /><span className="card-note">About 2 minutes</span></div>
      <div className="onboard-grid">
        <section className="card url-box">
          <div className="metric-icon" style={{ background: '#eff8dd', color: '#5e8216' }}><Radar size={15} /></div>
          <h2 className="section-title" style={{ marginTop: 18 }}>Start with your website</h2>
          <p className="lede" style={{ fontSize: 11 }}>We scan your homepage, about page, and pricing page. You can edit everything before it becomes brand memory.</p>
          <label className="url-label" htmlFor="brand-url">Company website</label>
          <div className="input-wrap"><Globe2 size={15} color="#83908b" /><input id="brand-url" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Company website" /><button onClick={scan} className="button button-dark" disabled={scanning}>{scanning ? "Reading…" : "Analyze"} {!scanning && <ArrowRight size={13} />}</button></div>
          <div className="scan-list">
            {[{i:Globe2,t:'Homepage messaging and core claims'},{i:FileText,t:'About page story and differentiators'},{i:ShieldCheck,t:'Pricing language and proof points'}].map(({i:Icon,t}) => <div className="scan-row" key={t}><Icon size={14} /><span>{t}</span><span className="scan-check"><Check size={11} /></span></div>)}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'flex-start', marginTop:18, color:'#8a9490', fontSize:9, lineHeight:1.5 }}><ShieldCheck size={13} style={{ flex:'0 0 auto' }} />Your pages are used only to build this workspace’s private brand memory.</div>
        </section>
        <section className="card kernel-preview">
          <div className="kernel-top"><div><div className="brief-kicker">Live extraction preview</div><h2 className="section-title" style={{ marginTop:7 }}>Brand kernel</h2></div><span className="tag tag-lime"><Sparkles size={10} /> 7 fields found</span></div>
          <div className="kernel-fields">
            <div className="kernel-field wide"><div className="kernel-field-label">Positioning</div><div className="kernel-field-copy">An AI operating layer for lean marketing teams who need senior-level strategy without adding headcount.</div></div>
            <div className="kernel-field"><div className="kernel-field-label">Primary ICP</div><div className="kernel-field-copy">B2B marketing leaders at growing, operationally complex companies.</div></div>
            <div className="kernel-field"><div className="kernel-field-label">Category</div><div className="kernel-field-copy">Agentic marketing intelligence</div></div>
            <div className="kernel-field"><div className="kernel-field-label">Differentiators</div><div className="kernel-field-copy">Persistent brand memory · measurable learning loop · specialist agent team</div></div>
            <div className="kernel-field"><div className="kernel-field-label">Voice signature</div>{[['Measured','Bold','68%'],['Technical','Plain','74%'],['Serious','Playful','32%']].map(([a,b,p]) => <div className="tone-line" key={a}><span>{a}</span><div className="tone-track"><span style={{ left:p }} /></div><span>{b}</span></div>)}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
