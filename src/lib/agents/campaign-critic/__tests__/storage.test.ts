import { describe, expect, it } from "vitest";
import { CampaignDefinitionSchema } from "../schema";
import {
  campaignDefinitionFromRecord,
  executionPlanWithDefinition,
} from "../storage";

describe("Campaign Critic storage adapter", () => {
  it("round-trips a manually entered definition without replacing shared plan fields", () => {
    const definition = CampaignDefinitionSchema.parse({
      name: "Founder proof sprint",
      objective: "Generate qualified demos",
      hypothesis: "Proof-led posts will increase demo requests.",
      audiences: [{ name: "Operations leaders" }],
      channels: ["linkedin"],
      budget: { amount: 1_000, currency: "MYR" },
      startDate: "2026-09-01",
      endDate: "2026-09-14",
      primaryKpi: "Cost per lead",
      targetValue: 80,
      targetUnit: "MYR",
    });
    const executionPlan = executionPlanWithDefinition({ owner: "strategist" }, definition);
    const adapted = campaignDefinitionFromRecord({
      id: "campaign-1",
      objective: definition.objective,
      selectedOptionId: "manual",
      strategy: {},
      executionPlan,
      createdAt: "2026-09-01T00:00:00.000Z",
    });

    expect(adapted).toEqual({ ...definition, id: "campaign-1" });
    expect(executionPlan).toMatchObject({ owner: "strategist" });
  });

  it("derives a reviewable definition from a Strategist campaign", () => {
    const adapted = campaignDefinitionFromRecord({
      id: "campaign-2",
      objective: "Recruit qualified students",
      selectedOptionId: "exp-proof",
      createdAt: "2026-09-01T00:00:00.000Z",
      strategy: {
        strategicThesis: "Student proof will make the programme tangible.",
        targetAudiences: ["Final-year students"],
        offerStrategy: "Show verified graduate outcomes.",
        experiments: [{
          id: "exp-proof",
          title: "Graduate proof",
          hypothesis: "Proof will increase applications.",
          channel: "instagram",
          primaryMetric: "Applications",
        }],
      },
      executionPlan: {
        campaignName: "Graduate outcomes sprint",
        startDate: "2026-09-05",
        endDate: "2026-09-19",
        measurement: { primaryMetric: "Applications" },
        schedule: [{ channel: "email" }],
      },
    });

    expect(adapted.name).toBe("Graduate outcomes sprint");
    expect(adapted.hypothesis).toBe("Proof will increase applications.");
    expect(adapted.audiences[0].name).toBe("Final-year students");
    expect(adapted.channels).toEqual(["instagram", "email"]);
    expect(adapted.tracking.analyticsConfigured).toBe(false);
  });
});
