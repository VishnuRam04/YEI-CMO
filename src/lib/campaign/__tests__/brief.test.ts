import { describe, expect, it } from "vitest";
import {
  buildPlanItemBrief,
  copywriterChannelFor,
  findScheduleItem,
} from "../brief";
import type { StoredCampaign } from "../store";

const item = {
  sequence: 2,
  date: "2026-09-01",
  day: "Tue",
  publishTimeLocal: "12:30",
  channel: "Facebook Page",
  assetType: "Photo carousel with real examples",
  theme: "Confidence for Primary School",
  action: "Share one real photo and explain what it shows.",
  purpose: "Show a real example so people can trust the offer.",
  expectedImpact: "Build trust by showing something real.",
  primaryMetric: "Number of trial inquiries on WhatsApp",
};

const campaign = {
  id: "campaign_1",
  brandId: "brand_1",
  strategyId: "strategy-1",
  objective: "Fill the new intake",
  selectedOptionId: "exp-a",
  status: "selected",
  strategy: {
    positioningAngle: "Hands-on learning that builds independence",
    offerStrategy: "Invite parents to the 3-day free trial.",
    experiments: [
      { id: "exp-a", approach: "Post real classroom clips and invite a booking." },
      { id: "exp-b", approach: "Run a paid trial pass campaign." },
    ],
  },
  executionPlan: {
    campaignName: "Real-Task Video Series",
    totalAssets: 6,
    schedule: [{ ...item, sequence: 1 }, item],
  },
} as unknown as StoredCampaign;

describe("plan item briefs", () => {
  it("maps plan channels onto what the Copywriter supports", () => {
    expect(copywriterChannelFor("LinkedIn").channel).toBe("linkedin");
    expect(copywriterChannelFor("Email newsletter").channel).toBe("email");
    // Anything else becomes social copy, and the caller is told why.
    const facebook = copywriterChannelFor("Facebook Page");
    expect(facebook.channel).toBe("instagram");
    expect(facebook.note).toContain("Facebook Page");
    expect(copywriterChannelFor("WhatsApp").channel).toBe("instagram");
  });

  it("does not flag a note when the channel maps exactly", () => {
    expect(copywriterChannelFor("LinkedIn").note).toBe("");
    expect(copywriterChannelFor("Email").note).toBe("");
  });

  it("finds a scheduled post by sequence", () => {
    expect(findScheduleItem(campaign, 2)?.theme).toBe("Confidence for Primary School");
    expect(findScheduleItem(campaign, 99)).toBeNull();
  });

  it("briefs the Copywriter on the one post, not the campaign", () => {
    const built = buildPlanItemBrief(campaign, item);
    expect(built.channel).toBe("instagram");
    expect(built.plannedChannel).toBe("Facebook Page");
    expect(built.brief).toContain("post 2 of 6");
    expect(built.brief).toContain("Confidence for Primary School");
    expect(built.brief).toContain("Share one real photo");
    expect(built.brief).toContain("Number of trial inquiries on WhatsApp");
    // The chosen option's approach is included, not the alternative's.
    expect(built.brief).toContain("Post real classroom clips");
    expect(built.brief).not.toContain("paid trial pass");
    expect(built.brief).toContain("Do not invent prices");
  });

  it("writes an image brief describing what the piece is for", () => {
    const built = buildPlanItemBrief(campaign, item);
    expect(built.imageBrief).toContain("Confidence for Primary School");
    expect(built.imageBrief).toContain("Post 2 of 6");
    expect(built.imageBrief).toContain("Facebook Page");
  });
});
