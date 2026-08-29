import { connection } from "next/server";
import { CampaignReviewWorkspace } from "@/components/campaigns/campaign-review-workspace";
import { PageHeading } from "@/components/ui/page-heading";
import { CampaignCriticResultSchema } from "@/lib/agents/campaign-critic/schema";
import {
  campaignDefinitionFromRecord,
  latestCampaignReview,
} from "@/lib/agents/campaign-critic/storage";
import { getActiveBrandMemory } from "@/lib/brand-memory";
import { getDb } from "@/lib/db";

export default async function CampaignsPage() {
  await connection();
  const activeBrand = await getActiveBrandMemory();
  if (!activeBrand) {
    return <div className="page-wrap">
      <PageHeading eyebrow="Campaign review" title="Connect a brand first." description="Complete onboarding before reviewing campaign readiness." />
    </div>;
  }

  const campaigns = await getDb().campaign.findMany({
    where: { brandId: activeBrand.id },
    orderBy: { updatedAt: "desc" },
  });
  const statusRank = (status: string) => status === "selected" ? 2 : status === "proposed" ? 1 : 0;
  const campaignViews = campaigns
    .map((campaign) => ({
      row: campaign,
      definition: campaignDefinitionFromRecord(campaign),
      latestReview: latestCampaignReview(campaign.executionPlan),
    }))
    .sort((left, right) => statusRank(right.row.status) - statusRank(left.row.status));
  const initialResult = campaignViews
    .map((campaign) => CampaignCriticResultSchema.safeParse(campaign.latestReview?.result))
    .find((parsed) => parsed.success);

  return <div className="page-wrap campaign-page">
    <PageHeading
      eyebrow="Campaign Critic · Pre-flight and post-flight"
      title="Spend only after the campaign earns it."
      description="Review the complete campaign against Brand Memory, launch readiness, measurement quality and observed results."
    />
    <CampaignReviewWorkspace
      brandId={activeBrand.id}
      brandName={activeBrand.name}
      initialCampaigns={campaignViews.map((campaign) => ({
        id: campaign.row.id,
        name: campaign.definition.name,
        startDate: campaign.definition.startDate,
        endDate: campaign.definition.endDate,
        definition: campaign.definition,
      }))}
      initialResult={initialResult?.success ? initialResult.data : null}
    />
  </div>;
}
