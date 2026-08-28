import { z } from "zod";
import { CampaignCriticResultSchema } from "@/lib/agents/campaign-critic/schema";
import { findCampaignReview } from "@/lib/agents/campaign-critic/storage";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const RequestSchema = z.object({
  brandId: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  reviewId: z.string().trim().min(1),
  rank: z.number().int().min(1).max(3),
});

function nextMonday(): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const days = (8 - date.getUTCDay()) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Invalid recommendation request." }, { status: 400 });
  }

  const db = getDb();
  const campaign = await db.campaign.findFirst({
    where: { id: parsed.data.campaignId, brandId: parsed.data.brandId },
    select: { executionPlan: true },
  });
  const review = findCampaignReview(campaign?.executionPlan, parsed.data.reviewId);
  if (!review) {
    return Response.json({ ok: false, error: "Campaign review not found." }, { status: 404 });
  }
  const result = CampaignCriticResultSchema.safeParse(review.result);
  if (!result.success) {
    return Response.json({ ok: false, error: "Stored campaign review is invalid." }, { status: 409 });
  }
  const recommendation = result.data.recommendations.find((item) => item.rank === parsed.data.rank);
  if (!recommendation?.planItem) {
    return Response.json({ ok: false, error: "This recommendation is an operational fix, not a content-plan item." }, { status: 409 });
  }

  const weekOf = nextMonday();
  let plan = await db.plan.findFirst({
    where: { brandId: parsed.data.brandId, weekOf },
    select: { id: true },
  });
  plan ??= await db.plan.create({
    data: { brandId: parsed.data.brandId, weekOf },
    select: { id: true },
  });
  const item = await db.planItem.create({
    data: {
      planId: plan.id,
      channel: recommendation.planItem.channel,
      format: recommendation.planItem.format,
      hook: recommendation.planItem.hook,
      pillar: recommendation.planItem.pillar,
      rationale: recommendation.planItem.rationale,
      status: "idea",
    },
  });
  return Response.json({ ok: true, planItemId: item.id, weekOf: weekOf.toISOString() });
}
