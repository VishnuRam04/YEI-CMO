import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findBrand: vi.fn(),
  findCampaign: vi.fn(),
  findCampaignUnique: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    brand: { findUnique: mocks.findBrand },
    campaign: {
      findFirst: mocks.findCampaign,
      findUnique: mocks.findCampaignUnique,
      create: mocks.createCampaign,
      update: mocks.updateCampaign,
    },
  }),
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
}));

import { campaignCriticAgent } from "../index";
import { CampaignCriticPayloadSchema } from "../schema";

const campaign = {
  id: "campaign-1",
  name: "Incomplete campaign",
  objective: "Generate leads",
  hypothesis: "A proof-led campaign will generate qualified leads.",
  offer: { name: "", valueProposition: "", callToAction: "", proofPoints: [] },
  audiences: [],
  channels: ["linkedin"],
  budget: { amount: 500, currency: "MYR", allocations: [{ channel: "linkedin", amount: 500 }] },
  startDate: "2026-09-01",
  endDate: "2026-09-14",
  primaryKpi: "Cost per lead",
  targetValue: 80,
  targetUnit: "MYR",
  landingPage: { headline: "", offer: "", callToAction: "" },
  tracking: { analyticsConfigured: false, pixelConfigured: false, conversionEvent: "", utmPlan: "" },
};

describe("Campaign Critic agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findBrand.mockResolvedValue({
      id: "brand-1",
      name: "Northwind",
      kernel: { positioning: "One shared memory" },
      voice: { bannedWords: ["guaranteed"] },
    });
    mocks.createCampaign.mockResolvedValue({
      id: "campaign-1",
      brandId: "brand-1",
      objective: campaign.objective,
      selectedOptionId: "manual",
      strategy: {},
      executionPlan: {},
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    mocks.findCampaignUnique.mockResolvedValue({ executionPlan: {} });
    mocks.updateCampaign.mockResolvedValue({ id: "campaign-1" });
    mocks.generateText.mockRejectedValue(new Error("Model unavailable"));
  });

  it("falls back to deterministic blockers and persists the review", async () => {
    const payload = CampaignCriticPayloadSchema.parse({
      mode: "preflight",
      campaign,
      assets: [],
    });
    mocks.findCampaign.mockResolvedValueOnce(null);
    const output = await campaignCriticAgent.run({
      brandId: "brand-1",
      traceId: "trace-1",
      payload,
    });
    expect(output.ok).toBe(true);
    expect(output.result?.mode).toBe("preflight");
    if (output.result?.mode === "preflight") {
      expect(output.result.verdict).toBe("hold");
      expect(output.result.blockingIssues.length).toBeGreaterThan(0);
    }
    expect(mocks.updateCampaign).toHaveBeenCalledOnce();
  });

  it("refuses a post-flight verdict when no campaign metrics exist", async () => {
    mocks.findCampaign.mockResolvedValue({
      id: "campaign-1",
      brandId: "brand-1",
      objective: campaign.objective,
      selectedOptionId: "manual",
      strategy: {},
      executionPlan: { campaignCritic: { definition: campaign, reviews: [] } },
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    const payload = CampaignCriticPayloadSchema.parse({
      mode: "postflight",
      campaignId: "campaign-1",
    });
    const output = await campaignCriticAgent.run({
      brandId: "brand-1",
      traceId: "trace-2",
      payload,
    });
    expect(output.ok).toBe(false);
    expect(output.error?.code).toBe("INPUT_ERROR");
    expect(output.error?.message).toContain("Import campaign metrics");
  });
});
