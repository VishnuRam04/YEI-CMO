import { connection } from "next/server";
import { ArrowUpRight, Database, Lightbulb, MousePointerClick, Target, TrendingUp } from "lucide-react";
import { MetricsImporter } from "@/components/insights/metrics-importer";
import { PerformanceChart } from "@/components/insights/performance-chart";
import { PageHeading } from "@/components/ui/page-heading";
import { getActiveBrandMemory } from "@/lib/brand-memory";
import { getDb } from "@/lib/db";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function displayNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function dayLabel(value: Date): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(value);
}

export default async function InsightsPage() {
  await connection();
  const activeBrand = await getActiveBrandMemory();
  if (!activeBrand) {
    return <div className="page-wrap">
      <PageHeading eyebrow="Performance intelligence" title="Connect a brand first." description="Complete onboarding before importing social performance metrics." />
    </div>;
  }

  const db = getDb();
  const [latestMetric, patterns] = await Promise.all([
    db.metric.findFirst({ where: { brandId: activeBrand.id }, orderBy: { date: "desc" } }),
    db.pattern.findMany({ where: { brandId: activeBrand.id }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const periodEnd = latestMetric?.date ?? new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodStart.getUTCDate() - 29);
  periodStart.setUTCHours(0, 0, 0, 0);
  const metrics = latestMetric
    ? await db.metric.findMany({
        where: { brandId: activeBrand.id, date: { gte: periodStart, lte: periodEnd } },
        orderBy: { date: "asc" },
      })
    : [];

  const totals = metrics.reduce((sum, metric) => ({
    impressions: sum.impressions + metric.impressions,
    clicks: sum.clicks + metric.clicks,
    spend: sum.spend + metric.spend,
    conversions: sum.conversions + metric.conversions,
  }), { impressions: 0, clicks: 0, spend: 0, conversions: 0 });
  const ctr = totals.impressions ? round((totals.clicks / totals.impressions) * 100) : 0;
  const conversionRate = totals.clicks ? round((totals.conversions / totals.clicks) * 100) : 0;

  const daily = new Map<string, { date: Date; impressions: number; clicks: number }>();
  const channelTotals = new Map<string, { impressions: number; clicks: number }>();
  for (const metric of metrics) {
    const key = metric.date.toISOString().slice(0, 10);
    const currentDay = daily.get(key) ?? { date: metric.date, impressions: 0, clicks: 0 };
    currentDay.impressions += metric.impressions;
    currentDay.clicks += metric.clicks;
    daily.set(key, currentDay);
    const currentChannel = channelTotals.get(metric.channel) ?? { impressions: 0, clicks: 0 };
    currentChannel.impressions += metric.impressions;
    currentChannel.clicks += metric.clicks;
    channelTotals.set(metric.channel, currentChannel);
  }
  const chartData = Array.from(daily.values()).map((value) => ({
    day: dayLabel(value.date),
    ctr: value.impressions ? round((value.clicks / value.impressions) * 100) : 0,
  }));
  const bestChannel = Array.from(channelTotals.entries())
    .map(([channel, value]) => ({
      channel,
      ctr: value.impressions ? round((value.clicks / value.impressions) * 100) : 0,
    }))
    .sort((left, right) => right.ctr - left.ctr)[0];
  const bestPattern = [...patterns].sort((left, right) => right.lift - left.lift)[0];

  const metricCards = [
    { Icon: MousePointerClick, value: `${displayNumber(ctr)}%`, label: "Click-through rate", tag: `${displayNumber(totals.clicks)} clicks` },
    { Icon: Target, value: displayNumber(totals.conversions), label: "Conversions", tag: `${displayNumber(conversionRate)}% of clicks` },
    { Icon: TrendingUp, value: bestPattern ? `${displayNumber(bestPattern.lift)}×` : "—", label: "Best stored pattern", tag: bestPattern?.condition ?? "No patterns yet" },
    { Icon: Database, value: displayNumber(metrics.length), label: "Performance rows", tag: metrics.length ? "Verified import" : "Awaiting import" },
  ];

  return <div className="page-wrap">
    <PageHeading
      eyebrow="Performance intelligence · Latest available 30 days"
      title="Learn from real performance."
      description="Owned metrics establish what worked for this brand. Current market research runs separately, so the CMO can still find timely ideas before performance history is available."
    />

    <MetricsImporter brandId={activeBrand.id} brandName={activeBrand.name} />

    <div className="grid-4">{metricCards.map(({ Icon, value, label, tag }) => <div className="card card-pad metric-card" key={label}>
      <span className="metric-icon"><Icon size={15} /></span>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <span className="metric-trend">{tag}</span>
    </div>)}</div>

    <div className="insights-layout">
      <section className="card card-pad">
        <div className="card-head"><div><div className="card-note">Owned performance</div><h2 className="section-title" style={{ marginTop: 5 }}>Daily click-through rate</h2></div><span className="tag">Imported metrics only</span></div>
        <PerformanceChart data={chartData} />
      </section>
      <aside className="card digest">
        <div className="brief-kicker">Analyst’s evidence split</div>
        <h2 className="section-title" style={{ marginTop: 7 }}>What the system knows</h2>
        <div className="digest-item"><div className="digest-title">Owned performance</div><div className="digest-copy">{metrics.length ? `${metrics.length} imported rows cover ${dayLabel(periodStart)} to ${dayLabel(periodEnd)}.` : "No owned social metrics have been imported yet."}</div></div>
        <div className="digest-item"><div className="digest-title">Current performance signal</div><div className="digest-copy">{bestChannel ? `${bestChannel.channel} currently has the highest imported CTR at ${displayNumber(bestChannel.ctr)}%.` : "A channel comparison becomes available after the first valid import."}</div></div>
        <div className="digest-item"><div className="digest-title">Trend and idea research</div><div className="digest-copy">Available now. Ask the CMO for current trends or campaign ideas; the Analyst searches grounded public sources and keeps those findings separate from owned results.</div></div>
      </aside>
    </div>

    <section style={{ marginTop: 16 }}>
      <div className="card-head"><div><div className="card-note">Reusable intelligence</div><h2 className="section-title" style={{ marginTop: 5 }}>Learned patterns</h2></div><span className="tag tag-lime">{patterns.length} stored</span></div>
      {patterns.length > 0
        ? <div className="grid-3">{patterns.slice(0, 6).map((pattern) => <article className="pattern-card" key={pattern.id}>
            <div className="pattern-lift">{displayNumber(pattern.lift)}×</div>
            <div className="pattern-copy"><strong style={{ display: "block", fontSize: 12, marginBottom: 4, color: "#17201d" }}>{pattern.condition}</strong>{pattern.outcome} · n={pattern.n}</div>
            <span className="tag">{pattern.dimension} <ArrowUpRight size={10} /></span>
          </article>)}</div>
        : <div className="card card-pad"><div className="digest-title"><Lightbulb size={13} /> No performance patterns have been stored yet.</div><p className="lede">Import repeated observations first. Pattern discovery should only promote findings once there is enough comparable evidence.</p></div>}
    </section>
  </div>;
}
