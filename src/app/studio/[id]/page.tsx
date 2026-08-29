import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";
import { PlanItemWriter } from "@/components/studio/plan-item-writer";
import {
  buildPlanItemBrief,
  findScheduleItem,
} from "@/lib/campaign/brief";
import {
  loadCampaignByStrategyId,
  loadLatestCampaign,
  type StoredCampaign,
} from "@/lib/campaign/store";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readableDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
}

function Unavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="page-wrap">
      <PageHeading eyebrow="Content studio" title={title} description={detail} />
      <section className="card card-pad plan-empty">
        <Sparkles size={19} />
        <div>
          <strong>Open a post from your plan</strong>
          <p>
            Every scheduled post on the plan page has a Write it button. That is
            what tells the Copywriter which post to write.
          </p>
        </div>
        <Link href="/plan" className="button button-dark">
          Go to the plan
        </Link>
      </section>
    </div>
  );
}

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ strategy?: string }>;
}) {
  const { id } = await params;
  const { strategy } = await searchParams;
  const sequence = Number.parseInt(id, 10);

  let campaign: StoredCampaign | null = null;
  let brandId = "";
  let failure = "";
  try {
    campaign = strategy
      ? await loadCampaignByStrategyId(strategy)
      : await (async () => {
          const brand = await getDb().brand.findFirst({
            orderBy: { updatedAt: "desc" },
            select: { id: true },
          });
          return brand ? loadLatestCampaign(brand.id) : null;
        })();
    brandId = campaign?.brandId ?? "";
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  if (failure) {
    return <Unavailable title="The post could not be loaded." detail={failure} />;
  }
  if (!campaign || !Number.isFinite(sequence)) {
    return (
      <Unavailable
        title="There is no approved plan yet."
        detail="Approve a campaign with your CMO, then write its posts from here."
      />
    );
  }

  const item = findScheduleItem(campaign, sequence);
  if (!item) {
    return (
      <Unavailable
        title="That post is not in the current plan."
        detail="The plan changed after this link was opened. Pick the post again from the plan."
      />
    );
  }

  const planItem = buildPlanItemBrief(campaign, item);

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow={`Post ${item.sequence} of ${campaign.executionPlan.totalAssets} · ${item.day} ${readableDate(item.date)} · ${item.publishTimeLocal}`}
        title={item.theme}
        description={item.action}
        actions={
          <Link href="/plan" className="button button-ghost">
            <ArrowLeft size={13} /> Back to the plan
          </Link>
        }
      />

      <div className="studio-layout">
        <aside className="card brief-panel">
          <div className="card-head">
            <div>
              <div className="card-note">From your plan</div>
              <h2 className="section-title" style={{ marginTop: 5 }}>
                {planItem.campaignName}
              </h2>
            </div>
            <Sparkles size={16} />
          </div>
          {[
            ["Channel", item.channel],
            ["Format", item.assetType],
            ["Theme", item.theme],
            ["Why this post", item.purpose],
            ["It should", item.expectedImpact],
            ["Watch", item.primaryMetric],
          ].map(([label, value]) => (
            <div className="brief-field" key={label}>
              <div className="brief-field-label">{label}</div>
              <div className="brief-field-value">{value}</div>
            </div>
          ))}
          <div
            className="quote-card"
            style={{ background: "#172522", color: "#dce4e1", marginTop: 8 }}
          >
            The Copywriter writes only from this brief and your confirmed brand
            memory. It will not invent prices, dates or results.
          </div>
        </aside>

        <PlanItemWriter
          brandId={brandId}
          channel={planItem.channel}
          channelNote={planItem.channelNote}
          brief={planItem.brief}
          imageBrief={planItem.imageBrief}
        />
      </div>
    </div>
  );
}
