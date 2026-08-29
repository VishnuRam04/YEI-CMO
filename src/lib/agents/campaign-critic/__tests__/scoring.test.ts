import { describe, expect, it } from "vitest";
import {
  aggregateCampaignPerformance,
  campaignOutcome,
  finalisePreflight,
  preflightRuleIssues,
} from "../scoring";
import {
  CampaignAssetSnapshotSchema,
  CampaignDefinitionSchema,
  CampaignMetricSnapshotSchema,
  PreflightModelEvaluationSchema,
} from "../schema";

const campaign = CampaignDefinitionSchema.parse({
  name: "Founder proof sprint",
  objective: "Generate qualified demo requests from operations leaders.",
  hypothesis: "Proof-led founder stories will increase qualified demo requests from operations leaders over fourteen days.",
  offer: {
    name: "Workflow review",
    valueProposition: "A practical review of the team's campaign workflow.",
    callToAction: "Book a review",
    proofPoints: ["Used in three approved pilot workspaces"],
  },
  audiences: [{
    name: "Operations leaders",
    need: "Reduce disconnected campaign work.",
    targeting: "Malaysia, operations leadership titles, B2B software interest.",
  }],
  channels: ["linkedin"],
  budget: {
    amount: 1_000,
    currency: "MYR",
    allocations: [{ channel: "linkedin", amount: 1_000 }],
  },
  startDate: "2026-09-01",
  endDate: "2026-09-14",
  primaryKpi: "Cost per lead",
  targetValue: 80,
  targetUnit: "MYR",
  landingPage: {
    url: "https://example.com/review",
    headline: "Make campaign work easier to operate",
    offer: "A practical workflow review",
    callToAction: "Book a review",
  },
  tracking: {
    analyticsConfigured: true,
    pixelConfigured: true,
    conversionEvent: "demo_request_submitted",
    utmPlan: "source / medium / campaign / content",
  },
});

const assets = [CampaignAssetSnapshotSchema.parse({
  id: "asset-1",
  channel: "linkedin",
  format: "post",
  audience: "Operations leaders",
  message: "Disconnected campaign work creates avoidable rework. Book a review.",
  callToAction: "Book a review",
  landingPageUrl: "https://example.com/review",
  brandScore: 91,
  approved: true,
})];

function recommendation(rank: number) {
  return {
    rank,
    action: `Action ${rank}`,
    rationale: `Reason ${rank}`,
    evidence: [],
    expectedImpact: { low: null, high: null, unit: "not estimated", basis: "No history." },
    effort: "low" as const,
    confidence: "medium" as const,
    planItem: null,
  };
}

describe("campaign critic scoring", () => {
  it("marks a complete, strongly assessed campaign ready", () => {
    const issues = preflightRuleIssues(campaign, assets);
    expect(issues).toEqual([]);
    const modelEvaluation = PreflightModelEvaluationSchema.parse({
      criteria: [
        "alignment", "targeting", "offer", "creative-fit", "message-match", "tracking", "feasibility",
      ].map((key) => ({ key, score: 92, finding: `${key} is supported.`, evidenceIds: [] })),
      issues: [],
      recommendations: [recommendation(1), recommendation(2), recommendation(3)],
      executiveSummary: "The campaign is coherent and measurable.",
    });
    const result = finalisePreflight({ campaign, ruleIssues: issues, modelEvaluation });
    expect(result.verdict).toBe("ready");
    expect(result.readinessScore).toBe(92);
    expect(result.criteria).toHaveLength(7);
  });

  it("holds spend when conversion tracking is absent", () => {
    const incomplete = CampaignDefinitionSchema.parse({
      ...campaign,
      tracking: { analyticsConfigured: false, pixelConfigured: false, conversionEvent: "", utmPlan: "" },
    });
    const issues = preflightRuleIssues(incomplete, assets);
    const result = finalisePreflight({ campaign: incomplete, ruleIssues: issues, modelEvaluation: null });
    expect(result.verdict).toBe("hold");
    expect(result.blockingIssues.map((item) => item.id)).toContain("conversion-event-missing");
    expect(result.recommendations).toHaveLength(3);
  });

  it("calculates campaign performance and applies the minimum-sample guard", () => {
    const metrics = [CampaignMetricSnapshotSchema.parse({
      date: "2026-09-14T00:00:00.000Z",
      channel: "linkedin",
      assetId: "asset-1",
      audience: "Operations leaders",
      impressions: 2_000,
      clicks: 100,
      spend: 600,
      conversions: 6,
      revenue: 1_200,
    })];
    const performance = aggregateCampaignPerformance(campaign, metrics);
    expect(performance.totals.ctr).toBe(5);
    expect(performance.totals.cpa).toBe(100);
    expect(performance.primaryKpi.confidence).toBe("directional");
    expect(campaignOutcome(performance)).toBe("missed");
    expect(performance.caveats.join(" ")).toContain("n=6");
  });
});
