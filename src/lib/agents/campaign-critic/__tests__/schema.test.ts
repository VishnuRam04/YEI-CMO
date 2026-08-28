import { describe, expect, it } from "vitest";
import {
  CampaignCriticPayloadSchema,
  PreflightModelEvaluationSchema,
} from "../schema";

describe("Campaign Critic schemas", () => {
  it("accepts incomplete campaign fields so the critic can report blockers", () => {
    const parsed = CampaignCriticPayloadSchema.parse({
      mode: "preflight",
      campaign: {
        name: "Incomplete launch",
        startDate: "2026-09-01",
        endDate: "2026-09-10",
      },
    });
    expect(parsed.mode).toBe("preflight");
    if (parsed.mode === "preflight") {
      expect(parsed.campaign.audiences).toEqual([]);
      expect(parsed.campaign.tracking.analyticsConfigured).toBe(false);
    }
  });

  it("rejects model output that repeats a criterion", () => {
    const result = PreflightModelEvaluationSchema.safeParse({
      criteria: Array.from({ length: 7 }, () => ({
        key: "alignment",
        score: 80,
        finding: "Repeated criterion",
        evidenceIds: [],
      })),
      issues: [],
      recommendations: [],
      executiveSummary: "Invalid assessment",
    });
    expect(result.success).toBe(false);
  });
});
