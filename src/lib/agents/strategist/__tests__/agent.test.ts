import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findBrand: vi.fn(), generateText: vi.fn() }));

vi.mock("@/lib/db", () => ({
  getDb: () => ({ brand: { findUnique: mocks.findBrand } }),
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));

import { AnalystResultSchema } from "@/lib/agents/analyst/schema";
import { strategistAgent } from "../index";
import { StrategistPayloadSchema } from "../schema";

const intelligence = AnalystResultSchema.parse({
  snapshotId: "intel-1",
  mode: "combined",
  generatedAt: "2026-08-26T00:00:00.000Z",
  dataThrough: "2026-08-25T00:00:00.000Z",
  expiresAt: "2026-08-27T00:00:00.000Z",
  stats: [],
  performanceSignals: [],
  marketSignals: [],
  patterns: [],
  opportunities: [],
  risks: [],
  missingData: [],
  sources: [],
  digest: "No current signals.",
});

describe("Strategist agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findBrand.mockResolvedValue({
      name: "Northwind",
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      kernel: {
        positioning: "One shared memory",
        productCatalogues: [{ products: [{ name: "CMO Workspace", sku: "CMO-1", price: 199 }] }],
      },
      voice: { bannedWords: ["revolutionary"] },
      directives: [{ statement: "Prioritise pipeline" }],
    });
    mocks.generateText.mockResolvedValue({
      output: {
        ideaVerdict: "promising",
        verdictReason: "The idea is sound but needs proof-led execution.",
        strategicThesis: "Lead with evidence.",
        targetAudiences: ["B2B CMOs"],
        selectedProducts: ["CMO Workspace", "Invented Product"],
        positioningAngle: "Shared memory",
        offerStrategy: "Workflow review",
        channelRoles: [{ channel: "linkedin", purpose: "Demand", cadence: "3 weekly" }],
        contentPillars: [{ name: "Evidence", rationale: "Build trust", evidenceIds: ["fake-id"] }],
        experiments: ["lean", "balanced", "reach"].map((id, index) => ({
          id: `exp-${id}`,
          title: `${id} option`,
          approach: `Option ${index + 1} approach`,
          costLevel: index === 0 ? "low" : index === 1 ? "medium" : "high",
          riskLevel: index < 2 ? "low" : "medium",
          tradeoff: `Option ${index + 1} trade-off`,
          hypothesis: "Proof-led posts increase qualified clicks.",
          channel: "linkedin",
          assetType: "post",
          primaryMetric: "qualified CTR",
          successThreshold: ">3%",
          stopCondition: "Stop after 10 posts below 1%",
          durationDays: 14,
          productNames: ["CMO Workspace", "Invented Product"],
          evidenceIds: ["fake-id"],
        })),
        recommendedExperimentId: "exp-balanced",
        assumptions: [],
        risks: [],
        reviewTriggers: ["Review after 14 days"],
        informationRequests: [],
      },
      usage: { inputTokens: 100, outputTokens: 80 },
    });
  });

  it("filters invented catalogue products and evidence references", async () => {
    const payload = StrategistPayloadSchema.parse({
      objective: "Build a product acquisition sprint",
      intelligence,
      productSelectors: ["CMO-1"],
      channels: ["linkedin"],
    });
    const output = await strategistAgent.run({ brandId: "brand-1", traceId: "trace-1", payload });

    expect(output.ok).toBe(true);
    expect(output.result?.selectedProducts).toEqual(["CMO Workspace"]);
    expect(output.result?.experiments[0].productNames).toEqual(["CMO Workspace"]);
    expect(output.result?.experiments[0].evidenceIds).toEqual([]);
    expect(output.result?.experiments).toHaveLength(3);
    expect(output.result?.recommendedExperimentId).toBe("exp-balanced");
    expect(output.result?.executionPlan.schedule).toHaveLength(6);
    expect(output.result?.executionPlan.measurement.primaryMetric).toBe("qualified CTR");
  });

  it("returns a conservative three-option plan when structured generation times out", async () => {
    mocks.generateText.mockRejectedValue(new DOMException("The operation was aborted", "TimeoutError"));
    const payload = StrategistPayloadSchema.parse({
      objective: "Run a Merdeka campaign to recruit new students",
      intelligence,
      channels: ["facebook"],
    });
    const output = await strategistAgent.run({ brandId: "brand-1", traceId: "trace-timeout", payload });

    expect(output.ok).toBe(true);
    expect(output.result?.experiments).toHaveLength(3);
    expect(output.result?.recommendedExperimentId).toBe("exp-conversion");
    expect(output.result?.executionPlan.totalAssets).toBeGreaterThan(0);
    expect(output.summary).toContain("Fallback plan");
  });
});
