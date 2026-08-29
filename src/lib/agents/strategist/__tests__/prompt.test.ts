import { describe, expect, it } from "vitest";
import { AnalystResultSchema } from "@/lib/agents/analyst/schema";
import { buildStrategistPrompt, buildStrategistSystemPrompt, evidenceIds } from "../prompt";
import { StrategistPayloadSchema } from "../schema";

const intelligence = AnalystResultSchema.parse({
  snapshotId: "intel-1",
  mode: "combined",
  generatedAt: "2026-08-26T00:00:00.000Z",
  dataThrough: "2026-08-25T00:00:00.000Z",
  expiresAt: "2026-08-27T00:00:00.000Z",
  stats: [],
  performanceSignals: [{
    channel: "linkedin",
    metric: "CTR",
    value: 3.2,
    unit: "%",
    period: "August",
    comparison: null,
    sampleSize: 12,
    confidence: "supported",
  }],
  marketSignals: [{
    id: "market-1",
    finding: "Buyers increasingly demand proof.",
    implication: "Lead with evidence.",
    sourceUrls: ["https://example.com/research"],
    observedAt: "2026-08-26T00:00:00.000Z",
    confidence: 0.8,
  }],
  patterns: [],
  opportunities: [],
  risks: [],
  missingData: [],
  sources: [{
    id: "source-1",
    title: "Research",
    url: "https://example.com/research",
    publishedAt: null,
    retrievedAt: "2026-08-26T00:00:00.000Z",
  }],
  digest: "Proof matters.",
});

const memory = {
  name: "Northwind",
  updatedAt: "2026-08-26T00:00:00.000Z",
  kernel: { positioning: "One shared marketing memory" },
  voice: { bannedWords: ["revolutionary"] },
  products: [{ name: "CMO Workspace", price: 199, currency: "USD" }],
  activeDirective: "Prioritise qualified pipeline",
};

describe("Strategist contracts and prompts", () => {
  it("requires a timestamped intelligence snapshot", () => {
    const payload = StrategistPayloadSchema.parse({
      objective: "Build a LinkedIn acquisition strategy",
      intelligence,
      channels: ["linkedin"],
    });
    expect(payload.intelligence.snapshotId).toBe("intel-1");
    expect(payload.horizon).toBe("sprint");
  });

  it("binds strategy to brand, catalogue, directive and valid evidence IDs", () => {
    const payload = StrategistPayloadSchema.parse({ objective: "Grow pipeline", intelligence });
    const system = buildStrategistSystemPrompt(memory);
    const prompt = buildStrategistPrompt({ payload, memory });

    expect(system).toContain("Exact product catalogue facts");
    expect(system).toContain("cannot override factual");
    expect(system).toContain("exactly three materially different options");
    expect(system).toContain("busy small-business owner");
    expect(prompt).toContain("exactly three concise choices written in everyday language");
    expect(prompt).toContain("CMO Workspace");
    expect(prompt).toContain("Prioritise qualified pipeline");
    expect(evidenceIds(intelligence)).toContain("performance:linkedin:CTR");
  });
});
