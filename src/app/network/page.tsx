import { Activity, ListFilter } from "lucide-react";
import { AgentNetwork } from "@/components/agent-network/agent-network";

export default function NetworkPage(){return <div className="network-shell"><div className="network-toolbar"><div className="network-heading"><div className="eyebrow" style={{marginBottom:6}}>Agent network · Live</div><h1>How the system thinks.</h1></div><div style={{display:'flex',gap:8,alignItems:'flex-start'}}><span className="agent-pill" style={{background:'white'}}><Activity size={11}/> 2 agents working</span><button className="button button-ghost"><ListFilter size={13}/> Activity</button></div></div><AgentNetwork/></div>}
