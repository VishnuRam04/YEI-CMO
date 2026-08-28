import type { AnalystResult } from "@/lib/agents/analyst/schema";
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
    return ["Launch reel", "Proof carousel", "Parent proof post", "FAQ story", "Reminder post", "Final-call story"];
  }
  if (/linkedin/i.test(channel)) {
    return ["Point-of-view post", "Proof carousel", "Founder post", "FAQ post", "Case-study post", "Final CTA post"];
  }
  if (/email/i.test(channel)) {
    return ["Launch email", "Proof email", "FAQ email", "Reminder email", "Objection email", "Final-call email"];
  }
  return ["Launch post", "Proof post", "Story post", "FAQ post", "Reminder post", "Final-call post"];
}

const purposes = [
  "Introduce the campaign promise and create qualified awareness.",
  "Show concrete proof so the offer feels credible rather than promotional.",
  "Make the outcome relatable through a customer or participant perspective.",
  "Remove the highest-friction question before asking for action.",
  "Restore attention and make the decision window clear.",
  "Convert remaining intent with a direct, time-bound call to action.",
];

const impacts = [
  "Establish the offer and generate the first wave of qualified visits or messages.",
  "Increase trust and reduce uncertainty around the promised outcome.",
  "Help the target audience recognise themselves in the campaign.",
  "Reduce avoidable drop-off caused by unanswered objections.",
  "Bring interested prospects back into the conversion path.",
  "Concentrate high-intent responses before the campaign closes.",
];

export function buildExecutionPlan(options: {
  objective: string;
  strategy: StrategistModelResult;
  intelligence: AnalystResult;
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
  const hasOwnedPerformance = options.intelligence.performanceSignals.length > 0;
  const hasMarketEvidence = options.intelligence.marketSignals.length > 0;
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
      action: `${purposes[index % purposes.length]} Use the “${theme}” angle to deliver: ${recommended.approach}`.slice(0, 600),
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
    cadence: `${totalAssets} scheduled assets across ${totalDays} days on ${recommended.channel}.`,
    costLevel: recommended.costLevel,
    planningBasis,
    schedule,
    measurement: {
      primaryMetric: recommended.primaryMetric,
      successThreshold: recommended.successThreshold,
      stopCondition: recommended.stopCondition,
      reviewDate: isoDate(end),
      timingBasis: hasOwnedPerformance
        ? "Publish windows should be replaced by the strongest times in the imported performance data before launch."
        : "Publish times are explicit test windows, not proven best times; update them after owned performance data is imported.",
    },
  };
}
