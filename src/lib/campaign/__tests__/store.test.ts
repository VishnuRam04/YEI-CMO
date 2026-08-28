import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    campaign: {
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
      update: mocks.update,
      upsert: mocks.upsert,
    },
  }),
}));

import { loadLatestCampaign, selectCampaignOption } from "../store";

function experiment(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Option ${id}`,
    approach: "Post real examples and ask people to message.",
    costLevel: "low",
    riskLevel: "low",
    tradeoff: "Cheap, but slower reach.",
    hypothesis: "Real proof beats generic promotion.",
    channel: "Instagram",
    assetType: "Simple social posts",
    primaryMetric: "New enquiries",
    successThreshold: "More enquiries than last month.",
    stopCondition: "Two posts with no enquiries.",
    durationDays: 7,
    productNames: [],
    evidenceIds: [],
    ...overrides,
  };
}

const strategy = {
  ideaVerdict: "promising",
  verdictReason: "Worth a short test.",
  strategicThesis: "Show independence, not slogans.",
  targetAudiences: ["Parents of children aged 3 to 6"],
  selectedProducts: [],
  positioningAngle: "Hands-on learning",
  offerStrategy: "Invite parents to a free trial.",
  channelRoles: [],
  contentPillars: [],
  experiments: [
    experiment("exp-a"),
    experiment("exp-b", { channel: "Email", durationDays: 21, riskLevel: "medium" }),
    experiment("exp-c"),
  ],
  recommendedExperimentId: "exp-a",
  assumptions: [],
  risks: [],
  reviewTriggers: [],
  informationRequests: [],
  strategyId: "strategy-1",
  createdAt: "2026-08-27T09:00:00.000Z",
  intelligenceSnapshotId: "intel-1",
  brandMemoryUpdatedAt: "2026-08-27T09:00:00.000Z",
  horizon: "sprint",
  objective: "Fill the new intake",
  nextReviewAt: "2026-09-10T09:00:00.000Z",
  executionPlan: {
    selectedExperimentId: "exp-a",
    campaignName: "Option exp-a",
    startDate: "2026-08-28",
    endDate: "2026-09-03",
    timezone: "Brand local time",
    totalAssets: 4,
    cadence: "4 planned posts over 7 days on Instagram.",
    costLevel: "low",
    planningBasis: "market-evidence-directional",
    schedule: [{
      sequence: 1,
      date: "2026-08-28",
      day: "Fri",
      publishTimeLocal: "08:00",
      channel: "Instagram",
      assetType: "Short introduction video",
      theme: "Show what makes you different",
      action: "Explain the offer in one short post.",
      purpose: "Tell the right people what to do next.",
      expectedImpact: "Bring the first enquiries.",
      primaryMetric: "New enquiries",
    }],
    measurement: {
      primaryMetric: "New enquiries",
      successThreshold: "More enquiries than last month.",
      stopCondition: "Two posts with no enquiries.",
      reviewDate: "2026-09-03",
      timingBasis: "These posting times are a starting point.",
    },
  },
};

const row = {
  id: "campaign_1",
  brandId: "brand_1",
  strategyId: "strategy-1",
  objective: "Fill the new intake",
  selectedOptionId: "exp-a",
  status: "proposed",
  strategy,
  executionPlan: strategy.executionPlan,
  createdAt: new Date("2026-08-27T09:00:00.000Z"),
  updatedAt: new Date("2026-08-27T09:00:00.000Z"),
};

describe("campaign store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(row);
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...row,
      ...data,
    }));
  });

  it("rebuilds the schedule around the option the user picked", async () => {
    const campaign = await selectCampaignOption({
      brandId: "brand_1",
      strategyId: "strategy-1",
      optionId: "exp-b",
    });

    expect(campaign?.selectedOptionId).toBe("exp-b");
    expect(campaign?.status).toBe("selected");
    // exp-b runs on Email for 21 days, so the plan is not the stored exp-a one.
    expect(campaign?.executionPlan.selectedExperimentId).toBe("exp-b");
    expect(campaign?.executionPlan.schedule[0].channel).toBe("Email");
    expect(campaign?.executionPlan.endDate).not.toBe("2026-09-03");
    expect(campaign?.executionPlan.totalAssets).toBeGreaterThan(4);
  });

  it("keeps the planning basis when the option changes", async () => {
    const campaign = await selectCampaignOption({
      brandId: "brand_1",
      strategyId: "strategy-1",
      optionId: "exp-c",
    });
    expect(campaign?.executionPlan.planningBasis).toBe("market-evidence-directional");
  });

  it("refuses an option that is not in the strategy", async () => {
    expect(await selectCampaignOption({
      brandId: "brand_1",
      strategyId: "strategy-1",
      optionId: "exp-invented",
    })).toBeNull();
  });

  it("refuses a campaign belonging to another brand", async () => {
    expect(await selectCampaignOption({
      brandId: "brand_2",
      strategyId: "strategy-1",
      optionId: "exp-b",
    })).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("prefers a chosen campaign over a newer unchosen one", async () => {
    mocks.findMany.mockResolvedValue([
      { ...row, id: "campaign_2", strategyId: "strategy-2", status: "proposed" },
      { ...row, id: "campaign_1", status: "selected" },
    ]);
    const campaign = await loadLatestCampaign("brand_1");
    expect(campaign?.id).toBe("campaign_1");
  });

  it("ignores stored rows that no longer match the schema", async () => {
    mocks.findMany.mockResolvedValue([{ ...row, strategy: { broken: true } }]);
    expect(await loadLatestCampaign("brand_1")).toBeNull();
  });
});
