import { describe, expect, it } from "vitest";
import { AnalystResultSchema } from "@/lib/agents/analyst/schema";
import { buildFallbackStrategy } from "../fallback";
import { buildExecutionPlan } from "../plan";

const intelligence = AnalystResultSchema.parse({
  snapshotId: "intel-plan",
  mode: "combined",
  generatedAt: "2026-08-27T00:00:00.000Z",
  dataThrough: "2026-08-27T00:00:00.000Z",
  expiresAt: "2026-08-28T00:00:00.000Z",
  stats: [],
  performanceSignals: [],
  marketSignals: [{
    id: "market-1",
    finding: "Competitor messages are promotion-led.",
    implication: "Concrete classroom proof is a potential whitespace.",
    sourceUrls: ["https://example.com/evidence"],
    observedAt: "2026-08-27T00:00:00.000Z",
    confidence: 0.8,
  }],
  patterns: [],
  opportunities: ["Lead with proof."],
  risks: [],
  missingData: ["Owned metrics have not been imported."],
  sources: [{
    id: "source-1",
    title: "Evidence",
    url: "https://example.com/evidence",
    publishedAt: null,
    retrievedAt: "2026-08-27T00:00:00.000Z",
  }],
  digest: "Public evidence is available; owned performance is not.",
});

describe("Strategist execution planning", () => {
  it("turns the recommended route into a dated Merdeka operating calendar", () => {
    const strategy = buildFallbackStrategy({
      objective: "Run a Merdeka campaign to recruit new students",
      brandName: "Tadika Tunas Intelek",
      kernel: {
        positioning: "Hands-on preschool education that builds independence",
        icps: ["Parents of children aged 3 to 6"],
      },
      channels: ["Facebook"],
      productNames: [],
      intelligence,
    });
    const plan = buildExecutionPlan({
      objective: "Run a Merdeka campaign to recruit new students",
      strategy,
      evidence: {
        hasOwnedPerformance: intelligence.performanceSignals.length > 0,
        hasMarketEvidence: intelligence.marketSignals.length > 0,
      },
      createdAt: "2026-08-27T09:00:00.000Z",
    });

    expect(plan.startDate).toBe("2026-08-28");
    expect(plan.endDate).toBe("2026-08-31");
    expect(plan.totalAssets).toBe(4);
    expect(plan.schedule.map((item) => item.date)).toEqual([
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
    ]);
    expect(plan.schedule.every((item) => item.channel === "Facebook")).toBe(true);
    expect(plan.schedule.every((item) => item.expectedImpact.length > 20)).toBe(true);
    expect(plan.planningBasis).toBe("market-evidence-directional");
    expect(plan.measurement.timingBasis).toContain("starting point");
    expect(plan.cadence).toContain("planned posts");
    expect(plan.schedule[0].action).toContain("one clear instruction");
  });

  it("returns three conservative options when model generation is unavailable", () => {
    const strategy = buildFallbackStrategy({
      objective: "Increase qualified enrolment conversations",
      brandName: "Tadika Tunas Intelek",
      kernel: { positioning: "Hands-on education" },
      channels: [],
      productNames: [],
      intelligence,
    });

    expect(strategy.experiments).toHaveLength(3);
    expect(strategy.recommendedExperimentId).toBe("exp-conversion");
    expect(strategy.assumptions.join(" ")).toContain("model-generated comparison");
    expect(strategy.offerStrategy).toContain("business has confirmed");
    const userFacingText = [
      strategy.verdictReason,
      ...strategy.experiments.flatMap((experiment) => [experiment.title, experiment.approach]),
    ].join(" ");
    expect(userFacingText).not.toMatch(/conversion path|proof-led|experience activation|qualified awareness|evidence-led/i);
    expect(userFacingText).toMatch(/messag|call|book/i);
  });
});
