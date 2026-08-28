import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  MessageSquare,
  Sparkles,
  Youtube,
} from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";
import { loadLatestCampaign, type StoredCampaign } from "@/lib/campaign/store";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const basisLabels = {
  "owned-and-market-evidence": "Built from your own results and current market research.",
  "market-evidence-directional": "Built from current market research. Your own results are not available yet.",
  "brand-led-assumption": "Built from your brand details only. Treat the timings as a first test.",
} as const;

function channelIcon(channel: string) {
  if (/linkedin/i.test(channel)) return Linkedin;
  if (/instagram/i.test(channel)) return Instagram;
  if (/facebook|meta/i.test(channel)) return Facebook;
  if (/youtube/i.test(channel)) return Youtube;
  if (/email|mail/i.test(channel)) return Mail;
  return MessageSquare;
}

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

function UnavailablePlan({ detail }: { detail: string }) {
  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Campaign plan"
        title="The plan could not be loaded."
        description="The saved campaign could not be read just now. Your plan has not been lost."
      />
      <section className="card card-pad plan-empty">
        <Sparkles size={19} />
        <div>
          <strong>Try again in a moment</strong>
          <p>{detail}</p>
        </div>
        <Link href="/cmo" className="button button-dark">
          Open the CMO <ArrowRight size={12} />
        </Link>
      </section>
    </div>
  );
}

function EmptyPlan() {
  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow="Campaign plan"
        title="No plan has been approved yet."
        description="Talk an idea through with your CMO. Once you pick one of its three options, the full schedule appears here."
      />
      <section className="card card-pad plan-empty">
        <Sparkles size={19} />
        <div>
          <strong>Start with a conversation</strong>
          <p>
            Your CMO will discuss the idea, tell you plainly whether it is worth
            doing, and only then offer to build the plan. Pick the option you
            prefer and it is scheduled here.
          </p>
        </div>
        <Link href="/cmo" className="button button-dark">
          Open the CMO <ArrowRight size={12} />
        </Link>
      </section>
    </div>
  );
}

function ApprovedPlan({ campaign }: { campaign: StoredCampaign }) {
  const { strategy, executionPlan } = campaign;
  const chosen = strategy.experiments.find(
    (experiment) => experiment.id === campaign.selectedOptionId,
  ) ?? strategy.experiments[0];
  const alternatives = strategy.experiments.filter(
    (experiment) => experiment.id !== chosen.id,
  );

  return (
    <div className="page-wrap">
      <PageHeading
        eyebrow={`Campaign plan · ${readableDate(executionPlan.startDate)} – ${readableDate(executionPlan.endDate)}`}
        title={executionPlan.campaignName}
        description={campaign.objective}
        actions={
          <Link href="/cmo" className="button button-dark">
            <Sparkles size={13} /> Change the plan
          </Link>
        }
      />

      <div className="plan-summary">
        <div><b>{executionPlan.totalAssets}</b><span>posts planned</span></div>
        <div><b>{executionPlan.schedule[0]?.channel ?? "—"}</b><span>channel</span></div>
        <div><b>{executionPlan.costLevel}</b><span>cost</span></div>
        <div><b>{chosen.riskLevel}</b><span>risk</span></div>
        <div><b>{readableDate(executionPlan.measurement.reviewDate)}</b><span>review date</span></div>
      </div>

      <div className="plan-layout">
        <section className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-note">{executionPlan.cadence}</div>
              <h2 className="section-title" style={{ marginTop: 5 }}>
                What to post, and when
              </h2>
            </div>
            <span className="tag tag-lime">{chosen.title}</span>
          </div>

          {executionPlan.schedule.map((item) => {
            const Icon = channelIcon(item.channel);
            return (
              <div className="plan-item" key={item.sequence}>
                <div className="channel-icon"><Icon size={17} /></div>
                <div>
                  <div className="plan-meta">
                    <span className="tag">{item.day} {readableDate(item.date)}</span>
                    <span className="tag">{item.publishTimeLocal}</span>
                    <span className="tag tag-violet">{item.assetType}</span>
                  </div>
                  <div className="plan-hook">{item.theme}</div>
                  <div className="plan-reason"><strong>Do this:</strong> {item.action}</div>
                  <div className="plan-reason"><strong>Why:</strong> {item.purpose}</div>
                  <div className="plan-reason"><strong>What it should do:</strong> {item.expectedImpact}</div>
                  <div className="plan-reason"><strong>Watch:</strong> {item.primaryMetric}</div>
                </div>
                <div style={{ display: "grid", gap: 7 }}>
                  <Link
                    href={`/studio/${item.sequence}?strategy=${encodeURIComponent(campaign.strategyId)}`}
                    className="button button-primary"
                  >
                    Write it <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            );
          })}

          <div className="plan-measure">
            <div className="kernel-field-label">How you will know it worked</div>
            <ul>
              <li><b>What to watch</b>{executionPlan.measurement.primaryMetric}</li>
              <li><b>A good result</b>{executionPlan.measurement.successThreshold}</li>
              <li><b>When to pause</b>{executionPlan.measurement.stopCondition}</li>
              <li><b>Review on</b>{readableDate(executionPlan.measurement.reviewDate)}</li>
              <li><b>How this plan was made</b>{basisLabels[executionPlan.planningBasis]}</li>
            </ul>
            <p>{executionPlan.measurement.timingBasis}</p>
          </div>
        </section>

        <aside className="card strategy-card">
          <div className="brief-kicker">Why this plan</div>
          <h2 className="section-title" style={{ marginTop: 8 }}>
            {chosen.title}
          </h2>
          <p className="brief-copy" style={{ marginTop: 10 }}>{chosen.approach}</p>

          <div className="strategy-list">
            {strategy.contentPillars.slice(0, 3).map((pillar, index) => (
              <div className="strategy-item" key={pillar.name}>
                <span className="strategy-num">{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong style={{ display: "block", color: "white", marginBottom: 3 }}>
                    {pillar.name}
                  </strong>
                  {pillar.rationale}
                </span>
              </div>
            ))}
          </div>

          <div className="divider" style={{ background: "rgba(255,255,255,.1)", margin: "18px 0" }} />
          <div className="kernel-field-label">What you are betting on</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 17, lineHeight: 1.35 }}>
            {chosen.hypothesis}
          </div>

          <div className="divider" style={{ background: "rgba(255,255,255,.1)", margin: "18px 0" }} />
          <div className="kernel-field-label">The trade-off</div>
          <p className="brief-copy">{chosen.tradeoff}</p>

          {alternatives.length > 0 && (
            <>
              <div className="divider" style={{ background: "rgba(255,255,255,.1)", margin: "18px 0" }} />
              <div className="kernel-field-label">You did not pick</div>
              <div className="plan-alternatives">
                {alternatives.map((option) => (
                  <div key={option.id}>
                    <strong>{option.title}</strong>
                    <span>{option.costLevel} cost · {option.riskLevel} risk</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>

      {strategy.risks.length > 0 && (
        <section className="card card-pad plan-risks">
          <div className="card-head">
            <div>
              <div className="card-note">Before you publish</div>
              <h2 className="section-title" style={{ marginTop: 5 }}>Keep these in mind</h2>
            </div>
            <CalendarDays size={15} />
          </div>
          <ul>
            {strategy.risks.slice(0, 5).map((risk) => <li key={risk}>{risk}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

export default async function PlanPage() {
  // Only the data access is guarded: a database or stale-client problem should
  // render a calm message, not replace the page with a runtime error screen.
  // Rendering stays outside the try so genuine render errors still surface.
  let campaign: StoredCampaign | null = null;
  let failure = "";
  try {
    const brand = await getDb().brand.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    campaign = brand ? await loadLatestCampaign(brand.id) : null;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  if (failure) return <UnavailablePlan detail={failure} />;
  return campaign ? <ApprovedPlan campaign={campaign} /> : <EmptyPlan />;
}
