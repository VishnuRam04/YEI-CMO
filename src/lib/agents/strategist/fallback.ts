import type { AnalystResult } from "@/lib/agents/analyst/schema";
import type { StrategistModelResult } from "./schema";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const item = value.find((entry) => typeof entry === "string" && entry.trim());
    if (typeof item === "string") return item.trim();
  }
  return fallback;
}

function audienceNames(kernel: Record<string, unknown>): string[] {
  const raw = Array.isArray(kernel.icps)
    ? kernel.icps
    : Array.isArray(kernel.targetAudiences)
      ? kernel.targetAudiences
      : [];
  const names = raw.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [entry.trim()];
    const item = record(entry);
    const name = firstText(item.name ?? item.segment ?? item.audience, "");
    return name ? [name] : [];
  });
  return names.length > 0 ? names.slice(0, 4) : ["The audience confirmed in Brand Memory"];
}

function requestedChannel(objective: string, channels: string[], intelligence: AnalystResult): string {
  if (channels[0]) return channels[0];
  const named = ["Instagram", "Facebook", "LinkedIn", "TikTok", "YouTube", "Email"]
    .find((channel) => new RegExp(`\\b${channel}\\b`, "i").test(objective));
  if (named) return named;
  if (intelligence.performanceSignals[0]?.channel) return intelligence.performanceSignals[0].channel;
  return "Instagram";
}

function campaignLabel(objective: string): string {
  if (/\bmerdeka\b/i.test(objective)) return "Merdeka";
  const compact = objective.replace(/\s+/g, " ").trim();
  return compact.length <= 44 ? compact : `${compact.slice(0, 41).trim()}...`;
}

/** Conservative recovery for provider timeouts or malformed structured output. */
export function buildFallbackStrategy(options: {
  objective: string;
  brandName: string;
  kernel: unknown;
  channels: string[];
  productNames: string[];
  intelligence: AnalystResult;
}): StrategistModelResult {
  const kernel = record(options.kernel);
  const positioning = firstText(
    kernel.positioning ?? kernel.positioningStatement ?? kernel.valueProposition,
    `${options.brandName}'s confirmed brand position`,
  );
  const channel = requestedChannel(options.objective, options.channels, options.intelligence);
  const label = campaignLabel(options.objective);
  const evidenceIds = options.intelligence.marketSignals.slice(0, 4).map((signal) => signal.id);
  const marketAdvantage = options.intelligence.marketSignals[0]?.implication
    ?? options.intelligence.opportunities[0]
    ?? "Use confirmed brand proof to create a position competitors cannot credibly copy";
  const performance = options.intelligence.performanceSignals[0];
  const primaryMetric = performance?.metric ?? "Qualified enquiries";
  const successThreshold = performance
    ? `Beat the imported ${performance.metric} baseline of ${performance.value}${performance.unit}.`
    : "Establish a documented baseline and generate qualified responses before increasing spend.";
  const stopCondition = performance
    ? `Pause the route if ${performance.metric} remains below the imported baseline at the review point.`
    : "Pause after two consecutive scheduled assets generate no qualified response; revise the message before continuing.";
  const productNames = options.productNames.slice(0, 20);
  const common = {
    channel,
    primaryMetric,
    successThreshold,
    stopCondition,
    productNames,
    evidenceIds,
  };

  return {
    ideaVerdict: "promising",
    verdictReason: "The objective is commercially useful, but it should be tested through a measured conversion path rather than treated as a one-off promotion.",
    strategicThesis: `Use ${positioning} as the campaign's distinctive reason to believe. Market advantage: ${marketAdvantage}`.slice(0, 1_500),
    targetAudiences: audienceNames(kernel),
    selectedProducts: productNames,
    positioningAngle: positioning,
    offerStrategy: "Use only a confirmed catalogue offer. If no offer is confirmed, direct prospects to an enquiry, booking or consultation rather than inventing a discount.",
    channelRoles: [{
      channel,
      purpose: "Create demand, establish proof and convert qualified interest through one measurable call to action.",
      cadence: "Four launch assets in the first week, then review before scaling.",
    }],
    contentPillars: [
      { name: "Distinctive proof", rationale: "Show why the brand is credibly different, not merely louder.", evidenceIds },
      { name: "Audience outcome", rationale: "Translate the offer into a concrete result the audience values.", evidenceIds },
      { name: "Decision friction", rationale: "Answer the objection most likely to prevent the next action.", evidenceIds: [] },
    ],
    experiments: [
      {
        id: "exp-proof-led",
        title: `${label} proof-led organic series`.slice(0, 100),
        approach: `Publish a compact ${channel} series built around visible proof and this evidence-led advantage: ${marketAdvantage}`.slice(0, 360),
        costLevel: "low",
        riskLevel: "low",
        tradeoff: "Lowest production and media cost, but reach depends on the existing audience and organic distribution.",
        hypothesis: "Specific proof and a single response action will produce more qualified intent than a broad awareness message.",
        durationDays: 7,
        assetType: "Organic proof series",
        ...common,
      },
      {
        id: "exp-conversion",
        title: `${label} conversion campaign`.slice(0, 100),
        approach: `Run a coordinated ${channel} sequence around this market advantage: ${marketAdvantage}`.slice(0, 360),
        costLevel: "medium",
        riskLevel: "low",
        tradeoff: "Requires disciplined creative production and response handling, but gives the clearest conversion signal.",
        hypothesis: "A sequenced proof-to-action journey will outperform isolated promotional posts on qualified responses.",
        durationDays: 14,
        assetType: "Mixed campaign sequence",
        ...common,
      },
      {
        id: "exp-activation",
        title: `${label} experience activation`.slice(0, 100),
        approach: `Turn this advantage into a real-world or live digital experience, build attendance through ${channel}, and capture follow-up permission: ${marketAdvantage}`.slice(0, 360),
        costLevel: "high",
        riskLevel: "medium",
        tradeoff: "Produces stronger first-hand proof and urgency, but needs more operations, budget and lead follow-up capacity.",
        hypothesis: "Participation-based proof will create higher-intent conversations than passive campaign exposure.",
        durationDays: 21,
        assetType: "Activation and follow-up series",
        ...common,
      },
    ],
    recommendedExperimentId: "exp-conversion",
    assumptions: [
      "The model-generated comparison was unavailable, so this conservative plan was assembled from validated Brand Memory and Analyst inputs.",
      ...(options.intelligence.performanceSignals.length === 0
        ? ["No owned performance baseline is available; timing and thresholds must be treated as tests."]
        : []),
    ],
    risks: [
      "Do not publish an unconfirmed product, price, promotion or availability claim.",
      ...(evidenceIds.length === 0
        ? ["No current public market evidence was available; differentiation is brand-led until research completes."]
        : []),
    ],
    reviewTriggers: [
      "Review results at the scheduled end date before scaling spend or production.",
      "Revise the message if two consecutive assets produce no qualified response.",
    ],
    informationRequests: [],
  };
}
