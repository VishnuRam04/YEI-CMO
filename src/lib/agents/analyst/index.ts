import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { agentSuccess } from "@/lib/agents/output";
import type { Agent } from "@/lib/agents/types";
import { getDb } from "@/lib/db";
import { buildResearchPrompt, buildSystemPrompt } from "./prompt";
import { researchGroundingTargets, runResearchConnectors } from "./research-connectors";
import {
  AnalystResultSchema,
  type AnalystPayload,
  type AnalystResult,
  type PerformanceSignal,
} from "./schema";

const ANALYST_MODEL = "gemini-3.6-flash";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Schema-bound text. Provider output and provider error strings are both
 * unbounded, so anything routed into a capped field is clamped here. Without
 * this a long-but-valid research response, or a verbose timeout message,
 * fails AnalystResultSchema and turns a degraded snapshot into a dead agent.
 */
function clamp(value: string, maximum: number): string {
  const trimmed = value.trim();
  return trimmed.length <= maximum ? trimmed : trimmed.slice(0, maximum).trim();
}

function performanceFromMetrics(
  metrics: Array<{
    channel: string;
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
  }>,
  from: string,
  to: string,
): { stats: AnalystResult["stats"]; signals: PerformanceSignal[] } {
  const byChannel = new Map<string, typeof metrics>();
  for (const metric of metrics) {
    byChannel.set(metric.channel, [...(byChannel.get(metric.channel) ?? []), metric]);
  }
  const totals = metrics.reduce(
    (sum, metric) => ({
      impressions: sum.impressions + metric.impressions,
      clicks: sum.clicks + metric.clicks,
      spend: sum.spend + metric.spend,
      conversions: sum.conversions + metric.conversions,
    }),
    { impressions: 0, clicks: 0, spend: 0, conversions: 0 },
  );
  const stats = [
    { label: "Impressions", value: totals.impressions, unit: "count" },
    { label: "Clicks", value: totals.clicks, unit: "count" },
    { label: "Conversions", value: totals.conversions, unit: "count" },
    { label: "Spend", value: round(totals.spend), unit: "currency" },
    { label: "CTR", value: totals.impressions ? round((totals.clicks / totals.impressions) * 100) : 0, unit: "%" },
    { label: "Conversion rate", value: totals.clicks ? round((totals.conversions / totals.clicks) * 100) : 0, unit: "%" },
  ];
  const period = `${from.slice(0, 10)} to ${to.slice(0, 10)}`;
  const signals = Array.from(byChannel.entries()).flatMap(([channel, rows]) => {
    const channelTotals = rows.reduce(
      (sum, metric) => ({
        impressions: sum.impressions + metric.impressions,
        clicks: sum.clicks + metric.clicks,
        conversions: sum.conversions + metric.conversions,
      }),
      { impressions: 0, clicks: 0, conversions: 0 },
    );
    const confidence = rows.length >= 10 ? "supported" as const : "directional" as const;
    return [
      {
        channel,
        metric: "CTR",
        value: channelTotals.impressions ? round((channelTotals.clicks / channelTotals.impressions) * 100) : 0,
        unit: "%",
        period,
        comparison: null,
        sampleSize: rows.length,
        confidence,
      },
      {
        channel,
        metric: "Conversions",
        value: channelTotals.conversions,
        unit: "count",
        period,
        comparison: null,
        sampleSize: rows.length,
        confidence,
      },
    ];
  });
  return { stats, signals };
}

function sourceRows(sources: unknown[], retrievedAt: string): AnalystResult["sources"] {
  const seen = new Set<string>();
  return sources.flatMap((value, index) => {
    const source = record(value);
    const url = typeof source.url === "string" ? source.url : "";
    if (source.sourceType !== "url" || !URL.canParse(url) || seen.has(url)) return [];
    seen.add(url);
    return [{
      id: text(source.id, `research-${index + 1}`),
      title: clamp(text(source.title, new URL(url).hostname), 500),
      url,
      publishedAt: null,
      retrievedAt,
    }];
  });
}

function citedSourceRows(value: string, retrievedAt: string): AnalystResult["sources"] {
  const urls = Array.from(value.matchAll(/https?:\/\/[^\s)\]}>"']+/g))
    .map((match) => match[0].replace(/[.,;:]+$/, ""))
    .filter((url, index, all) => URL.canParse(url) && all.indexOf(url) === index)
    .slice(0, 30);
  return urls.map((url, index) => ({
    id: `research-${index + 1}`,
    title: new URL(url).hostname,
    url,
    publishedAt: null,
    retrievedAt,
  }));
}

function mergeSources(
  ...groups: AnalystResult["sources"][]
): AnalystResult["sources"] {
  const seen = new Set<string>();
  return groups.flat().filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 30);
}

export const analystAgent: Agent<AnalystPayload, AnalystResult> = {
  id: "analyst",
  model: ANALYST_MODEL,

  async run(input) {
    const generatedAt = new Date().toISOString();
    const expiresAt = new Date(Date.parse(generatedAt) + 24 * 60 * 60 * 1_000).toISOString();
    const db = getDb();
    const [brand, metrics, storedPatterns] = await Promise.all([
      db.brand.findUnique({ where: { id: input.brandId }, select: { name: true, kernel: true } }),
      input.payload.mode === "market-research"
        ? Promise.resolve([])
        : db.metric.findMany({
            where: {
              brandId: input.brandId,
              date: { gte: new Date(input.payload.from), lte: new Date(input.payload.to) },
              ...(input.payload.channels.length ? { channel: { in: input.payload.channels } } : {}),
            },
            orderBy: { date: "asc" },
          }),
      db.pattern.findMany({
        where: { brandId: input.brandId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
    const kernel = record(brand?.kernel);
    const performance = performanceFromMetrics(metrics, input.payload.from, input.payload.to);
    const patterns = storedPatterns.map((pattern) => ({
      dimension: pattern.dimension,
      condition: pattern.condition,
      outcome: pattern.outcome,
      lift: pattern.lift,
      n: pattern.n,
      confidence: pattern.n >= 10 ? "supported" as const : "directional" as const,
    }));
    const missingData: string[] = [];
    if (input.payload.mode !== "market-research" && metrics.length === 0) {
      missingData.push("No owned social performance metrics were stored for this period.");
    }

    let marketSignals: AnalystResult["marketSignals"] = [];
    let sources: AnalystResult["sources"] = [];
    let connectorStatus: AnalystResult["connectorStatus"] = [];
    const opportunities: string[] = [];
    const risks: string[] = [];
    let researchDigest = "";
    let connectorDigest = "";
    let inputTokens = 0;
    let outputTokens = 0;

    if (input.payload.mode !== "performance") {
      const connectorCall = runResearchConnectors({
        payload: input.payload,
        brandName: brand?.name ?? "Unknown brand",
        category: text(kernel.category, "Unknown category"),
        retrievedAt: generatedAt,
      });
      const groundedCall = generateText({
          model: google(ANALYST_MODEL),
          system: buildSystemPrompt(brand?.name ?? "this brand"),
          prompt: buildResearchPrompt({
            payload: input.payload,
            brandName: brand?.name ?? "Unknown brand",
            category: text(kernel.category, "Unknown category"),
            positioning: text(kernel.positioning, "No confirmed positioning"),
            competitors: Array.isArray(kernel.competitors)
              ? kernel.competitors.filter((item): item is string =>
                  typeof item === "string" && item.trim().length > 0).slice(0, 20)
              : [],
            performanceSignals: performance.signals,
            sourceTargets: researchGroundingTargets(),
            now: generatedAt,
          }),
          // The installed AI SDK packages carry different provider-utils patch types;
          // the provider-executed tool is runtime-compatible despite that type skew.
          tools: { google_search: google.tools.googleSearch({}) as never },
          // Grounded search spends part of this budget on tool calls and
          // thinking before emitting any answer text. At 1_200 the response
          // hit MAX_TOKENS with zero characters of text, which silently
          // produced an uncited snapshot on every run.
          maxOutputTokens: 3_000,
          maxRetries: 1,
          // Measured latency for this prompt (four investigations plus
          // competitor lookups) is 20-26s across runs; the budget clears the
          // slow tail rather than the median.
          timeout: { totalMs: 32_000 },
          providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
        });
      const [connectorOutcome, groundedOutcome] = await Promise.allSettled([
        connectorCall,
        groundedCall,
      ]);

      if (connectorOutcome.status === "fulfilled") {
        connectorStatus = connectorOutcome.value.statuses;
        marketSignals = connectorOutcome.value.signals;
        sources = connectorOutcome.value.sources;
        missingData.push(...connectorOutcome.value.missingData);
        connectorDigest = connectorOutcome.value.signals.length
          ? `${connectorOutcome.value.signals.length} direct platform observations were collected.`
          : "No direct platform observations were collected.";
      } else {
        missingData.push(`Direct research connectors were unavailable: ${connectorOutcome.reason instanceof Error ? connectorOutcome.reason.message : String(connectorOutcome.reason)}`);
      }

      if (groundedOutcome.status === "fulfilled") {
        const call = groundedOutcome.value;
        let groundedSources = sourceRows(call.sources as unknown[], generatedAt);
        researchDigest = call.text.trim();
        if (groundedSources.length === 0 && researchDigest) {
          groundedSources = citedSourceRows(researchDigest, generatedAt);
        }
        const groundedSignals: AnalystResult["marketSignals"] = groundedSources.length && researchDigest
          ? [{
              id: "current-research-1",
              finding: researchDigest.slice(0, 1_000),
              implication: "Treat this as time-bounded market evidence for the Strategist to assess against Brand Memory and owned performance.",
              sourceUrls: groundedSources.slice(0, 6).map((source) => source.url),
              observedAt: generatedAt,
              confidence: groundedSources.length >= 2 ? 0.8 : 0.6,
            }]
          : [];
        marketSignals = [...marketSignals, ...groundedSignals].slice(0, 12);
        sources = mergeSources(sources, groundedSources);
        inputTokens = call.usage.inputTokens ?? 0;
        outputTokens = call.usage.outputTokens ?? 0;
        if (groundedSignals.length === 0) {
          missingData.push("Current research returned no signals with verifiable grounded citations.");
        }
      } else {
        missingData.push(`Current market research was unavailable: ${groundedOutcome.reason instanceof Error ? groundedOutcome.reason.message : String(groundedOutcome.reason)}`);
      }
    }

    const digestParts = [
      metrics.length
        ? `${metrics.length} stored performance records produced ${performance.signals.length} channel signals.`
        : "No stored performance records were available for the requested period.",
      connectorDigest,
      researchDigest,
    ].filter(Boolean);
    const researchFailures = missingData.filter((item) =>
      /research|connector|youtube|meta ad library/i.test(item));
    const webResearchStatus = marketSignals.length > 0
      ? researchFailures.length > 0 ? "partial" as const : "available" as const
      : "unavailable" as const;
    const result = AnalystResultSchema.parse({
      snapshotId: `intel-${input.traceId}`,
      mode: input.payload.mode,
      generatedAt,
      dataThrough: input.payload.to,
      expiresAt,
      stats: performance.stats,
      performanceSignals: performance.signals,
      marketSignals,
      intelligenceParts: {
        ownedPerformance: {
          status: metrics.length > 0 ? "available" : "missing",
          recordCount: metrics.length,
          summary: metrics.length > 0
            ? `${metrics.length} imported social-performance records produced ${performance.signals.length} channel signals.`
            : "No imported social-performance records are available for this period; performance claims must remain assumptions.",
        },
        webAdvantageResearch: {
          status: webResearchStatus,
          sourceCount: sources.length,
          summary: marketSignals.length > 0
            ? `${marketSignals.length} current market observations from ${sources.length} cited public sources were collected to identify category patterns and ways to stand out.`
            : "No cited current market observations were available; the Strategist must rely on Brand Memory and clearly labelled assumptions.",
        },
      },
      connectorStatus,
      patterns,
      opportunities,
      risks,
      missingData: missingData.map((item) => clamp(item, 800)).slice(0, 20),
      sources,
      digest: clamp(digestParts.join(" "), 5_000),
    });

    return agentSuccess({
      agentId: "analyst",
      traceId: input.traceId,
      model: ANALYST_MODEL,
      result,
      summary: `${result.marketSignals.length} market · ${result.performanceSignals.length} performance`,
      inputTokens,
      outputTokens,
    });
  },
};
