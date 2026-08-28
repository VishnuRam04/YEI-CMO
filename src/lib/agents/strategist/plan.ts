import type {
  StrategistModelResult,
  StrategyExecutionPlan,
} from "./schema";

const DAY_MS = 24 * 60 * 60 * 1_000;

function utcDate(value: string): Date {
  const parsed = new Date(value);
  return new Date(Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  ));
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

function inclusiveDays(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1);
}

function campaignWindow(
  objective: string,
  createdAt: string,
  durationDays: number,
): { start: Date; end: Date } {
  const today = utcDate(createdAt);
  const tomorrow = addDays(today, 1);
  const boundedDuration = Math.min(Math.max(durationDays, 3), 30);

  if (/\bmerdeka\b/i.test(objective)) {
    let event = new Date(Date.UTC(today.getUTCFullYear(), 7, 31));
    if (event < tomorrow) event = new Date(Date.UTC(today.getUTCFullYear() + 1, 7, 31));
    const daysUntilEvent = inclusiveDays(tomorrow, event);
    if (daysUntilEvent <= 45) return { start: tomorrow, end: event };
    return { start: addDays(event, -(boundedDuration - 1)), end: event };
  }

  return { start: tomorrow, end: addDays(tomorrow, boundedDuration - 1) };
}

function evenlySpacedOffsets(totalDays: number, count: number): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, index) =>
    Math.round((index * (totalDays - 1)) / (count - 1)));
}

function assetTypes(channel: string): string[] {
  if (/instagram|facebook/i.test(channel)) {
    return ["Short introduction video", "Photo carousel with real examples", "Customer story", "Questions and answers story", "Reminder post", "Last reminder story"];
  }
  if (/linkedin/i.test(channel)) {
    return ["Helpful advice post", "Photo carousel", "Owner story", "Common questions post", "Customer example", "Last reminder post"];
  }
  if (/email/i.test(channel)) {
    return ["Introduction email", "Customer example email", "Common questions email", "Reminder email", "Useful details email", "Last reminder email"];
  }
  return ["Introduction post", "Real example post", "Customer story", "Common questions post", "Reminder post", "Last reminder post"];
}

const purposes = [
  "Explain the offer and tell the right people what to do next.",
  "Show a real example so people can trust the offer.",
  "Help people see how the offer could help someone like them.",
  "Answer a common question that may stop someone from taking action.",
  "Remind interested people before they forget or the offer ends.",
  "Give interested people one final, clear reason to contact the business.",
];

const impacts = [
  "Help more of the right people notice the offer and send the first enquiries.",
  "Build trust by showing something real instead of making a broad claim.",
  "Help potential customers see how the offer fits their needs.",
  "Make it easier for interested people to decide whether to contact the business.",
  "Bring interested people back while there is still time to act.",
  "Encourage people who are already interested to message, call or book.",
];

const actions = [
  "Explain the offer in one short post. Say who it is for and end with one clear instruction, such as messaging, calling or booking.",
  "Share one real photo, video, customer example or demonstration. Explain what it shows and avoid any claim the business cannot prove.",
  "Tell one short customer story: what they needed, what happened and what changed. Ask permission before using a person's name or image.",
  "Answer the most common question about the offer. Keep the answer short and finish with the same contact instruction used in the first post.",
  "Remind people when the offer ends or when they should respond. Repeat the main benefit and make the contact details easy to find.",
  "Post a final reminder. State the deadline, who the offer is for and the exact action people should take now.",
];

/**
 * Only two facts about the Analyst snapshot affect the plan, so the plan can
 * be rebuilt for a different option later without retaining the whole
 * intelligence result.
 */
export interface PlanEvidence {
  hasOwnedPerformance: boolean;
  hasMarketEvidence: boolean;
}

export function buildExecutionPlan(options: {
  objective: string;
  strategy: StrategistModelResult;
  evidence: PlanEvidence;
  createdAt: string;
}): StrategyExecutionPlan {
  const recommended = options.strategy.experiments.find((experiment) =>
    experiment.id === options.strategy.recommendedExperimentId) ?? options.strategy.experiments[0];
  const { start, end } = campaignWindow(
    options.objective,
    options.createdAt,
    recommended.durationDays,
  );
  const totalDays = inclusiveDays(start, end);
  const totalAssets = Math.min(totalDays, totalDays <= 7 ? 4 : 6);
  const offsets = evenlySpacedOffsets(totalDays, totalAssets);
  const formats = assetTypes(recommended.channel);
  const themes = options.strategy.contentPillars.length > 0
    ? options.strategy.contentPillars.map((pillar) => pillar.name)
    : [recommended.title];
  const times = ["08:00", "12:30", "20:00", "08:00", "12:30", "20:00"];
  const { hasOwnedPerformance, hasMarketEvidence } = options.evidence;
  const planningBasis = hasOwnedPerformance
    ? "owned-and-market-evidence" as const
    : hasMarketEvidence
      ? "market-evidence-directional" as const
      : "brand-led-assumption" as const;

  const schedule = offsets.map((offset, index) => {
    const date = addDays(start, offset);
    const theme = themes[index % themes.length];
    return {
      sequence: index + 1,
      date: isoDate(date),
      day: date.toLocaleDateString("en-MY", { weekday: "short", timeZone: "UTC" }),
      publishTimeLocal: times[index % times.length],
      channel: recommended.channel,
      assetType: formats[index % formats.length],
      theme,
      action: actions[index % actions.length],
      purpose: purposes[index % purposes.length],
      expectedImpact: impacts[index % impacts.length],
      primaryMetric: recommended.primaryMetric,
    };
  });

  return {
    selectedExperimentId: recommended.id,
    campaignName: recommended.title,
    startDate: isoDate(start),
    endDate: isoDate(end),
    timezone: "Brand local time",
    totalAssets,
    cadence: `${totalAssets} planned posts over ${totalDays} days on ${recommended.channel}.`,
    costLevel: recommended.costLevel,
    planningBasis,
    schedule,
    measurement: {
      primaryMetric: recommended.primaryMetric,
      successThreshold: recommended.successThreshold,
      stopCondition: recommended.stopCondition,
      reviewDate: isoDate(end),
      timingBasis: hasOwnedPerformance
        ? "Change these suggested times to match the times that worked best in your uploaded results."
        : "These posting times are a starting point. After the campaign, use your results to choose better times next time.",
    },
  };
}
