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
    ?? "Show real examples of what makes this business different";
  const performance = options.intelligence.performanceSignals[0];
  const primaryMetric = performance?.metric ?? "New enquiries";
  const successThreshold = performance
    ? `Get a better result than the current ${performance.metric} of ${performance.value}${performance.unit}.`
    : "Track every message, call or booking. Spend more only after the campaign brings real enquiries.";
  const stopCondition = performance
    ? `Pause if ${performance.metric} is still below the current result on the review date.`
    : "If two posts in a row bring no enquiries, pause and change the message before posting again.";
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
    verdictReason: "This is a good idea. Start with a short campaign, see which posts bring real enquiries, then spend more on what works.",
    strategicThesis: `Build the campaign around ${positioning}. The current research suggests: ${marketAdvantage}`.slice(0, 1_500),
    targetAudiences: audienceNames(kernel),
    selectedProducts: productNames,
    positioningAngle: positioning,
    offerStrategy: "Use only an offer or price that the business has confirmed. If there is no confirmed offer, ask people to message, call or book instead of making up a discount.",
    channelRoles: [{
      channel,
      purpose: "Help the right people understand the offer and take one clear next step.",
      cadence: "Publish four posts in the first week, then check the results before spending more.",
    }],
    contentPillars: [
      { name: "Show what makes you different", rationale: "Use real photos, examples or customer experiences instead of broad claims.", evidenceIds },
      { name: "Show what the customer gets", rationale: "Explain the useful result in words customers already understand.", evidenceIds },
      { name: "Answer common worries", rationale: "Answer the question most likely to stop someone from contacting the business.", evidenceIds: [] },
    ],
    experiments: [
      {
        id: "exp-proof-led",
        title: `${label} simple post series`.slice(0, 100),
        approach: `Post real photos, videos or customer examples on ${channel}. End every post by telling people exactly how to message, call or book.`.slice(0, 360),
        costLevel: "low",
        riskLevel: "low",
        tradeoff: "This costs the least, but fewer people may see it because there is no paid advertising.",
        hypothesis: "Real examples and one clear next step should bring more enquiries than a general promotional post.",
        durationDays: 7,
        assetType: "Simple social posts",
        ...common,
      },
      {
        id: "exp-conversion",
        title: `${label} enquiry campaign`.slice(0, 100),
        approach: `Run a short ${channel} campaign: explain the offer, show a real example, answer a common question, and remind people how to contact you.`.slice(0, 360),
        costLevel: "medium",
        riskLevel: "low",
        tradeoff: "This takes more preparation, but it is the easiest option for tracking which posts bring enquiries.",
        hypothesis: "A connected set of useful posts should bring more enquiries than unrelated one-off posts.",
        durationDays: 14,
        assetType: "Short social campaign",
        ...common,
      },
      {
        id: "exp-activation",
        title: `${label} open day or live event`.slice(0, 100),
        approach: `Invite people to visit or join a live event. Use ${channel} to collect bookings, then follow up with everyone who gave permission to be contacted.`.slice(0, 360),
        costLevel: "high",
        riskLevel: "medium",
        tradeoff: "People can experience the business directly, but this costs more and needs staff to run the event and follow up.",
        hypothesis: "People who experience the business directly should be more likely to ask questions or book.",
        durationDays: 21,
        assetType: "Event and follow-up posts",
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
      "Do not publish a product, price, promotion or availability unless the business has confirmed it.",
      ...(evidenceIds.length === 0
        ? ["No current public market evidence was available; differentiation is brand-led until research completes."]
        : []),
    ],
    reviewTriggers: [
      "Check the results on the planned review date before spending more.",
      "Change the message if two posts in a row bring no enquiries.",
    ],
    informationRequests: [],
  };
}
