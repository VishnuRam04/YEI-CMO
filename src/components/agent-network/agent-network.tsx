"use client";

import { useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  BarChart3,
  BrainCircuit,
  PenTool,
  Scale,
  Sparkles,
} from "lucide-react";
import { CmoChatPanel } from "./cmo-chat-panel";

type AgentData = {
  label: string;
  model: string;
  task: string;
  icon?: string;
  active?: boolean;
};

const icons = {
  brain: BrainCircuit,
  spark: Sparkles,
  pen: PenTool,
  scale: Scale,
  chart: BarChart3,
};

function AgentNode({ data }: NodeProps<Node<AgentData>>) {
  const Icon = icons[(data.icon ?? "spark") as keyof typeof icons];
  return (
    <div className={`network-agent-node ${data.active ? "active" : ""}`}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="node-head">
        <div className="node-icon"><Icon size={14} /></div>
        <div>
          <div className="node-name">{data.label}</div>
          <div className="node-model">{data.model}</div>
        </div>
        {data.active && <span className="status-dot" style={{ marginLeft: "auto" }} />}
      </div>
      <div className="node-task">{data.task}</div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

function CmoNode() {
  return (
    <button type="button" className="kernel-node nodrag" aria-label="Open CMO chat">
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <span className="kernel-node-content">
        <BrainCircuit
          size={22}
          color="#c8f169"
          style={{ margin: "0 auto 9px" }}
        />
        <strong>CMO Agent</strong>
        <span>Gemini 3.7 Flash<br />Click to start a chat</span>
      </span>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </button>
  );
}

const nodeTypes = { agent: AgentNode, kernel: CmoNode };

const nodes: Node[] = [
  { id: "cmo", type: "kernel", position: { x: 430, y: 205 }, data: {} },
  {
    id: "brand-analyst",
    type: "agent",
    position: { x: 60, y: 55 },
    data: {
      label: "Brand Analyst",
      model: "Gemini 3.1 Pro Preview",
      task: "Ready to extract brand memory",
      icon: "brain",
      active: true,
    },
  },
  {
    id: "strategist",
    type: "agent",
    position: { x: 60, y: 355 },
    data: {
      label: "Strategist",
      model: "Gemini 3.7 Flash",
      task: "Ready to turn intelligence into sprints",
      icon: "spark",
      active: true,
    },
  },
  {
    id: "writer",
    type: "agent",
    position: { x: 795, y: 55 },
    data: {
      label: "Copywriter",
      model: "Gemini 3.6 Flash",
      task: "Ready to draft three angles",
      icon: "pen",
      active: true,
    },
  },
  {
    id: "judge",
    type: "agent",
    position: { x: 795, y: 210 },
    data: {
      label: "Brand Judge",
      model: "Future agent",
      task: "Idle · later phase",
      icon: "scale",
    },
  },
  {
    id: "perf",
    type: "agent",
    position: { x: 795, y: 365 },
    data: {
      label: "Analyst",
      model: "Gemini 3.7 Flash",
      task: "Ready for trends and performance",
      icon: "chart",
      active: true,
    },
  },
  {
    id: "critic",
    type: "agent",
    position: { x: 430, y: 475 },
    data: {
      label: "Campaign Critic",
      model: "Future agent",
      task: "Idle · later phase",
      icon: "scale",
    },
  },
];

const edge = (
  id: string,
  source: string,
  target: string,
  animated = false,
): Edge => ({
  id,
  source,
  target,
  animated,
  markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
  style: { stroke: animated ? "#88b938" : "#9fac9f" },
});

const edges = [
  edge("ba-cmo", "brand-analyst", "cmo"),
  edge("s-cmo", "strategist", "cmo"),
  edge("cmo-w", "cmo", "writer", true),
  edge("w-j", "writer", "judge"),
  edge("j-p", "judge", "perf"),
  edge("p-cmo", "perf", "cmo"),
  edge("cmo-c", "cmo", "critic"),
];

export function AgentNetwork() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.id === "cmo") setChatOpen(true);
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.55}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={25} size={1} color="#d9ded9" />
        <Controls position="bottom-left" />
      </ReactFlow>
      <CmoChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
