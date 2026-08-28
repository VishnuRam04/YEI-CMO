"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ListChecks,
  LoaderCircle,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type {
  CampaignCriticResult,
  CampaignMetricSnapshot,
} from "@/lib/agents/campaign-critic/schema";

type CampaignSummary = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type MetricDraft = {
  id: string;
  date: string;
  channel: string;
  assetId: string;
  audience: string;
  impressions: string;
  clicks: string;
  spend: string;
  conversions: string;
  revenue: string;
};

type Mode = "preflight" | "postflight";
type RunStatus = "idle" | "queued" | "working";

function dateInput(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function metricDraft(): MetricDraft {
  return {
    id: crypto.randomUUID(),
    date: dateInput(),
    channel: "linkedin",
    assetId: "",
    audience: "",
    impressions: "0",
    clicks: "0",
    spend: "0",
    conversions: "0",
    revenue: "0",
  };
}

function number(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function displayNumber(value: number | null, maximumFractionDigits = 2): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-MY", { maximumFractionDigits }).format(value);
}

function verdictClass(value: string): string {
  if (["ready", "met"].includes(value)) return "tag-lime";
  if (["revise", "partially-met"].includes(value)) return "tag-orange";
  return "tag-red";
}

async function agentRequest(payload: unknown, brandId: string): Promise<CampaignCriticResult> {
  const response = await fetch("/api/campaign-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId, traceId: crypto.randomUUID(), payload }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Campaign review request failed.");
  }
  if (!response.body) throw new Error("Campaign review returned no response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: CampaignCriticResult | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        type: string;
        output?: { result?: CampaignCriticResult };
        error?: { message?: string };
      };
      if (event.type === "done" && event.output?.result) result = event.output.result;
      if (event.type === "error") throw new Error(event.error?.message ?? "Campaign review failed.");
    }
    if (done) break;
  }
  if (!result) throw new Error("Campaign review finished without a result.");
  return result;
}

export function CampaignReviewWorkspace({
  brandId,
  brandName,
  initialCampaigns,
  initialResult,
}: {
  brandId: string;
  brandName: string;
  initialCampaigns: CampaignSummary[];
  initialResult: CampaignCriticResult | null;
}) {
  const [mode, setMode] = useState<Mode>("preflight");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<CampaignCriticResult | null>(initialResult);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaigns[0]?.id ?? "");
  const [draftCampaignId, setDraftCampaignId] = useState("");
  const [addedRanks, setAddedRanks] = useState<number[]>([]);
  const [metrics, setMetrics] = useState<MetricDraft[]>([metricDraft()]);
  const [form, setForm] = useState({
    name: `${brandName} campaign`,
    objective: "",
    hypothesis: "",
    offerName: "",
    valueProposition: "",
    callToAction: "",
    proofPoint: "",
    audienceName: "",
    audienceNeed: "",
    targeting: "",
    channel: "linkedin",
    budget: "1000",
    currency: "MYR",
    startDate: dateInput(1),
    endDate: dateInput(14),
    primaryKpi: "Cost per lead",
    targetValue: "80",
    targetUnit: "MYR",
    landingPageUrl: "",
    landingHeadline: "",
    landingCallToAction: "",
    analyticsConfigured: false,
    pixelConfigured: false,
    conversionEvent: "",
    utmPlan: "",
    assetFormat: "post",
    assetMessage: "",
    brandScore: "",
    notes: "",
  });

  const canReviewPostflight = campaigns.length > 0 && selectedCampaignId.length > 0;
  const resultLabel = result?.mode === "preflight" ? result.verdict : result?.outcome;
  const resultCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId),
    [campaigns, selectedCampaignId],
  );

  const update = (field: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [field]: value }));

  async function runReview(event: FormEvent) {
    event.preventDefault();
    setError("");
    setAddedRanks([]);
    setStatus("queued");
    try {
      let payload: unknown;
      if (mode === "preflight") {
        const amount = number(form.budget);
        payload = {
          mode: "preflight",
          campaign: {
            id: draftCampaignId || undefined,
            name: form.name,
            objective: form.objective,
            hypothesis: form.hypothesis,
            offer: {
              name: form.offerName,
              valueProposition: form.valueProposition,
              callToAction: form.callToAction,
              proofPoints: form.proofPoint.trim() ? [form.proofPoint.trim()] : [],
            },
            audiences: form.audienceName.trim()
              ? [{ name: form.audienceName, need: form.audienceNeed, targeting: form.targeting }]
              : [],
            channels: form.channel.trim() ? [form.channel] : [],
            budget: {
              amount,
              currency: form.currency,
              allocations: amount > 0 && form.channel ? [{ channel: form.channel, amount }] : [],
            },
            startDate: form.startDate,
            endDate: form.endDate,
            primaryKpi: form.primaryKpi,
            targetValue: form.targetValue.trim() ? number(form.targetValue) : undefined,
            targetUnit: form.targetUnit,
            landingPage: {
              ...(form.landingPageUrl.trim() ? { url: form.landingPageUrl.trim() } : {}),
              headline: form.landingHeadline,
              offer: form.valueProposition,
              callToAction: form.landingCallToAction,
            },
            tracking: {
              analyticsConfigured: form.analyticsConfigured,
              pixelConfigured: form.pixelConfigured,
              conversionEvent: form.conversionEvent,
              utmPlan: form.utmPlan,
            },
          },
          assets: form.assetMessage.trim()
            ? [{
                id: "representative-asset",
                channel: form.channel,
                format: form.assetFormat,
                audience: form.audienceName,
                message: form.assetMessage,
                callToAction: form.callToAction,
                ...(form.landingPageUrl.trim() ? { landingPageUrl: form.landingPageUrl.trim() } : {}),
                ...(form.brandScore.trim() ? { brandScore: Math.round(number(form.brandScore)) } : {}),
                approved: false,
              }]
            : [],
          notes: form.notes,
        };
      } else {
        if (!canReviewPostflight) throw new Error("Save a campaign before running a post-flight review.");
        const metricPayload: CampaignMetricSnapshot[] = metrics.map((metric) => ({
          date: `${metric.date}T00:00:00.000Z`,
          channel: metric.channel,
          ...(metric.assetId.trim() ? { assetId: metric.assetId.trim() } : {}),
          audience: metric.audience,
          impressions: Math.round(number(metric.impressions)),
          clicks: Math.round(number(metric.clicks)),
          spend: number(metric.spend),
          conversions: Math.round(number(metric.conversions)),
          revenue: number(metric.revenue),
        }));
        payload = {
          mode: "postflight",
          campaignId: selectedCampaignId,
          metrics: metricPayload,
          analystFindings: [],
          notes: form.notes,
        };
      }
      setStatus("working");
      const review = await agentRequest(payload, brandId);
      setResult(review);
      if (review.mode === "preflight") {
        setCampaigns((current) => {
          const next = {
            id: review.campaignId,
            name: review.campaignName,
            startDate: form.startDate,
            endDate: form.endDate,
          };
          return [next, ...current.filter((campaign) => campaign.id !== next.id)];
        });
        setSelectedCampaignId(review.campaignId);
        setDraftCampaignId(review.campaignId);
      }
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Campaign review failed.");
    } finally {
      setStatus("idle");
    }
  }

  async function addToPlan(rank: number) {
    if (!result) return;
    setError("");
    const response = await fetch("/api/campaign-review/recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId,
        campaignId: result.campaignId,
        reviewId: result.reviewId,
        rank,
      }),
    });
    const body = await response.json() as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) {
      setError(body.error ?? "Recommendation could not be added to the plan.");
      return;
    }
    setAddedRanks((current) => [...current, rank]);
  }

  return <div className="campaign-review-layout">
    <form className="card campaign-review-form" onSubmit={runReview}>
      <div className="campaign-mode-tabs" role="tablist" aria-label="Review phase">
        <button type="button" className={mode === "preflight" ? "active" : ""} onClick={() => setMode("preflight")}><ShieldCheck size={14} /> Pre-flight</button>
        <button type="button" className={mode === "postflight" ? "active" : ""} onClick={() => setMode("postflight")}><BarChart3 size={14} /> Post-flight</button>
      </div>

      {mode === "preflight" ? <>
        <section className="campaign-form-section">
          <div className="campaign-section-title"><span>01</span><h2>Campaign intent</h2></div>
          <div className="campaign-field-grid two">
            <label><span>Name</span><input value={form.name} onChange={(event) => update("name", event.target.value)} required /></label>
            <label><span>Primary KPI</span><input value={form.primaryKpi} onChange={(event) => update("primaryKpi", event.target.value)} /></label>
          </div>
          <label><span>Objective</span><textarea value={form.objective} onChange={(event) => update("objective", event.target.value)} rows={2} /></label>
          <label><span>Hypothesis</span><textarea value={form.hypothesis} onChange={(event) => update("hypothesis", event.target.value)} rows={2} /></label>
        </section>

        <section className="campaign-form-section">
          <div className="campaign-section-title"><span>02</span><h2>Audience and offer</h2></div>
          <div className="campaign-field-grid two">
            <label><span>Audience</span><input value={form.audienceName} onChange={(event) => update("audienceName", event.target.value)} /></label>
            <label><span>Offer</span><input value={form.offerName} onChange={(event) => update("offerName", event.target.value)} /></label>
          </div>
          <label><span>Audience need</span><input value={form.audienceNeed} onChange={(event) => update("audienceNeed", event.target.value)} /></label>
          <label><span>Targeting</span><input value={form.targeting} onChange={(event) => update("targeting", event.target.value)} /></label>
          <label><span>Value proposition</span><textarea value={form.valueProposition} onChange={(event) => update("valueProposition", event.target.value)} rows={2} /></label>
          <div className="campaign-field-grid two">
            <label><span>Call to action</span><input value={form.callToAction} onChange={(event) => update("callToAction", event.target.value)} /></label>
            <label><span>Approved proof</span><input value={form.proofPoint} onChange={(event) => update("proofPoint", event.target.value)} /></label>
          </div>
        </section>

        <section className="campaign-form-section">
          <div className="campaign-section-title"><span>03</span><h2>Spend and timing</h2></div>
          <div className="campaign-field-grid four">
            <label><span>Channel</span><select value={form.channel} onChange={(event) => update("channel", event.target.value)}><option value="linkedin">LinkedIn</option><option value="instagram">Instagram</option><option value="email">Email</option><option value="meta">Meta</option><option value="google-ads">Google Ads</option></select></label>
            <label><span>Budget</span><input type="number" min="0" value={form.budget} onChange={(event) => update("budget", event.target.value)} /></label>
            <label><span>Currency</span><input value={form.currency} onChange={(event) => update("currency", event.target.value.toUpperCase())} /></label>
            <label><span>Target</span><input type="number" min="0" value={form.targetValue} onChange={(event) => update("targetValue", event.target.value)} /></label>
            <label><span>Start</span><input type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} /></label>
            <label><span>End</span><input type="date" value={form.endDate} onChange={(event) => update("endDate", event.target.value)} /></label>
            <label><span>Target unit</span><input value={form.targetUnit} onChange={(event) => update("targetUnit", event.target.value)} /></label>
          </div>
        </section>

        <section className="campaign-form-section">
          <div className="campaign-section-title"><span>04</span><h2>Destination and measurement</h2></div>
          <label><span>Landing page URL</span><input type="url" value={form.landingPageUrl} onChange={(event) => update("landingPageUrl", event.target.value)} /></label>
          <div className="campaign-field-grid two">
            <label><span>Landing headline</span><input value={form.landingHeadline} onChange={(event) => update("landingHeadline", event.target.value)} /></label>
            <label><span>Landing CTA</span><input value={form.landingCallToAction} onChange={(event) => update("landingCallToAction", event.target.value)} /></label>
          </div>
          <div className="campaign-field-grid two">
            <label><span>Conversion event</span><input value={form.conversionEvent} onChange={(event) => update("conversionEvent", event.target.value)} /></label>
            <label><span>UTM plan</span><input value={form.utmPlan} onChange={(event) => update("utmPlan", event.target.value)} /></label>
          </div>
          <div className="campaign-check-row">
            <label><input type="checkbox" checked={form.analyticsConfigured} onChange={(event) => update("analyticsConfigured", event.target.checked)} /> Analytics configured</label>
            <label><input type="checkbox" checked={form.pixelConfigured} onChange={(event) => update("pixelConfigured", event.target.checked)} /> Pixel configured</label>
          </div>
        </section>

        <section className="campaign-form-section">
          <div className="campaign-section-title"><span>05</span><h2>Representative creative</h2></div>
          <div className="campaign-field-grid two">
            <label><span>Format</span><input value={form.assetFormat} onChange={(event) => update("assetFormat", event.target.value)} /></label>
            <label><span>Brand score</span><input type="number" min="0" max="100" value={form.brandScore} onChange={(event) => update("brandScore", event.target.value)} /></label>
          </div>
          <label><span>Creative copy</span><textarea value={form.assetMessage} onChange={(event) => update("assetMessage", event.target.value)} rows={5} /></label>
        </section>
      </> : <section className="campaign-form-section">
        <div className="campaign-section-title"><span>01</span><h2>Campaign results</h2></div>
        <label><span>Campaign</span><select value={selectedCampaignId} onChange={(event) => setSelectedCampaignId(event.target.value)} disabled={!campaigns.length}>{campaigns.length ? campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>) : <option value="">No saved campaigns</option>}</select></label>
        {resultCampaign && <div className="campaign-date-band"><span>{resultCampaign.startDate}</span><span>to</span><span>{resultCampaign.endDate}</span></div>}
        <div className="metric-entry-list">
          {metrics.map((metric, index) => <div className="metric-entry" key={metric.id}>
            <div className="metric-entry-head"><strong>Observation {index + 1}</strong><button type="button" title="Remove observation" aria-label="Remove observation" disabled={metrics.length === 1} onClick={() => setMetrics((current) => current.filter((item) => item.id !== metric.id))}><Trash2 size={13} /></button></div>
            <div className="campaign-field-grid four">
              <label><span>Date</span><input type="date" value={metric.date} onChange={(event) => setMetrics((current) => current.map((item) => item.id === metric.id ? { ...item, date: event.target.value } : item))} /></label>
              <label><span>Channel</span><input value={metric.channel} onChange={(event) => setMetrics((current) => current.map((item) => item.id === metric.id ? { ...item, channel: event.target.value } : item))} /></label>
              <label><span>Asset ID</span><input value={metric.assetId} onChange={(event) => setMetrics((current) => current.map((item) => item.id === metric.id ? { ...item, assetId: event.target.value } : item))} /></label>
              <label><span>Audience</span><input value={metric.audience} onChange={(event) => setMetrics((current) => current.map((item) => item.id === metric.id ? { ...item, audience: event.target.value } : item))} /></label>
              {(["impressions", "clicks", "spend", "conversions", "revenue"] as const).map((field) => <label key={field}><span>{field[0].toUpperCase() + field.slice(1)}</span><input type="number" min="0" value={metric[field]} onChange={(event) => setMetrics((current) => current.map((item) => item.id === metric.id ? { ...item, [field]: event.target.value } : item))} /></label>)}
            </div>
          </div>)}
        </div>
        <button type="button" className="button button-quiet" onClick={() => setMetrics((current) => [...current, metricDraft()])}><Plus size={13} /> Add observation</button>
      </section>}

      <label className="campaign-notes"><span>Review notes</span><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} rows={2} /></label>
      {error && <div className="campaign-error"><AlertTriangle size={14} />{error}</div>}
      <button className="button button-dark campaign-submit" disabled={status !== "idle" || (mode === "postflight" && !canReviewPostflight)}>
        {status === "idle" ? <><Send size={14} /> Run {mode === "preflight" ? "pre-flight" : "post-flight"} review</> : <><LoaderCircle className="spin" size={14} /> {status === "queued" ? "Queued" : "Reviewing"}</>}
      </button>
    </form>

    <aside className="campaign-review-report">
      {!result ? <div className="campaign-empty-report"><ShieldCheck size={24} /><strong>No review yet</strong><span>Campaign evidence will appear here.</span></div> : <>
        <div className="campaign-report-head">
          <div><div className="card-note">{result.mode === "preflight" ? "Pre-flight readiness" : "Post-flight outcome"}</div><h2>{result.campaignName}</h2></div>
          <span className={`tag ${verdictClass(resultLabel ?? "hold")}`}>{resultLabel?.replace("-", " ")}</span>
        </div>
        {result.mode === "preflight" && <div className="campaign-score-row"><strong>{result.readinessScore}</strong><span>/100</span><div><b>Readiness score</b><small>{result.blockingIssues.length} launch blocker{result.blockingIssues.length === 1 ? "" : "s"}</small></div></div>}
        <p className="campaign-executive-summary">{result.executiveSummary}</p>

        {result.mode === "preflight" ? <>
          <section className="campaign-report-section">
            <div className="campaign-report-title"><ListChecks size={14} /><h3>Readiness criteria</h3></div>
            <div className="criterion-list">{result.criteria.map((criterion) => <div className="criterion-row" key={criterion.key}><div><strong>{criterion.label}</strong><span>{criterion.finding}</span></div><div className="criterion-score"><b>{criterion.score}</b><i><span style={{ width: `${criterion.score}%` }} /></i></div></div>)}</div>
          </section>
          <section className="campaign-report-section">
            <div className="campaign-report-title"><AlertTriangle size={14} /><h3>Issues</h3></div>
            <div className="campaign-issue-list">{result.issues.length ? result.issues.map((issue) => <div className="campaign-issue" key={issue.id}><span className={`tag ${issue.severity === "blocker" ? "tag-red" : issue.severity === "major" ? "tag-orange" : ""}`}>{issue.severity}</span><div><strong>{issue.finding}</strong><small>{issue.suggestedFix}</small></div></div>) : <div className="campaign-clean"><Check size={14} /> No material issue identified.</div>}</div>
          </section>
        </> : <>
          <div className="campaign-metric-strip">
            <div><span>CTR</span><strong>{displayNumber(result.performance.totals.ctr)}%</strong></div>
            <div><span>Conversions</span><strong>{displayNumber(result.performance.totals.conversions)}</strong></div>
            <div><span>CPA</span><strong>{displayNumber(result.performance.totals.cpa)}</strong></div>
            <div><span>ROAS</span><strong>{displayNumber(result.performance.totals.roas)}{result.performance.totals.roas === null ? "" : "×"}</strong></div>
          </div>
          <section className="campaign-report-section">
            <div className="campaign-report-title"><BarChart3 size={14} /><h3>Diagnosis</h3></div>
            <div className="campaign-diagnosis">{result.diagnosis.map((item) => <p key={item}>{item}</p>)}</div>
            {result.performance.caveats.map((caveat) => <div className="campaign-caveat" key={caveat}>{caveat}</div>)}
          </section>
        </>}

        <section className="campaign-report-section">
          <div className="campaign-report-title"><ListChecks size={14} /><h3>Ranked actions</h3></div>
          <div className="campaign-recommendations">{result.recommendations.map((recommendation) => <div className="campaign-recommendation" key={recommendation.rank}><span className="recommendation-rank">{recommendation.rank}</span><div><strong>{recommendation.action}</strong><p>{recommendation.rationale}</p><small>{recommendation.confidence} confidence · {recommendation.effort} effort</small></div>{recommendation.planItem && <button type="button" className="button button-quiet" disabled={addedRanks.includes(recommendation.rank)} onClick={() => addToPlan(recommendation.rank)}>{addedRanks.includes(recommendation.rank) ? <Check size={13} /> : <Plus size={13} />}{addedRanks.includes(recommendation.rank) ? "Added" : "Plan"}</button>}</div>)}</div>
        </section>
      </>}
    </aside>
  </div>;
}
