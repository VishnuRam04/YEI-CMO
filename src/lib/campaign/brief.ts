import type { Channel } from "@/lib/agents/copywriter/schema";
import type { StoredCampaign } from "./store";

export type ScheduleItem = StoredCampaign["executionPlan"]["schedule"][number];

export interface PlanItemBrief {
  sequence: number;
  channel: Channel;
  /** The channel named in the plan, which may be broader than the Copywriter's. */
  plannedChannel: string;
  channelNote: string;
  campaignName: string;
  item: ScheduleItem;
  brief: string;
  imageBrief: string;
}

/**
 * The Copywriter writes for linkedin, instagram or email, but a plan may name
 * any channel the Strategist chose ("Facebook Page", "WhatsApp", an on-site
 * event). Anything that is not clearly LinkedIn or email is written as short
 * social copy, and the UI says so rather than pretending the mapping is exact.
 */
export function copywriterChannelFor(planned: string): {
  channel: Channel;
  note: string;
} {
  if (/linkedin/i.test(planned)) {
    return { channel: "linkedin", note: "" };
  }
  if (/e-?mail|newsletter|mailer/i.test(planned)) {
    return { channel: "email", note: "" };
  }
  return {
    channel: "instagram",
    note: `The Copywriter writes LinkedIn, social or email copy. "${planned}" is written as a short social post you can paste into it.`,
  };
}

export function findScheduleItem(
  campaign: StoredCampaign,
  sequence: number,
): ScheduleItem | null {
  return campaign.executionPlan.schedule.find(
    (entry) => entry.sequence === sequence,
  ) ?? null;
}

/**
 * Turns one scheduled post into a Copywriter brief. Everything here comes from
 * the approved plan, so the copy is written for that specific slot rather than
 * the campaign in general.
 */
export function buildPlanItemBrief(
  campaign: StoredCampaign,
  item: ScheduleItem,
): PlanItemBrief {
  const chosen = campaign.strategy.experiments.find(
    (experiment) => experiment.id === campaign.selectedOptionId,
  );
  const { channel, note } = copywriterChannelFor(item.channel);

  const brief = [
    `Campaign: ${campaign.executionPlan.campaignName}`,
    `Objective: ${campaign.objective}`,
    `Positioning: ${campaign.strategy.positioningAngle}`,
    `Offer: ${campaign.strategy.offerStrategy}`,
    chosen ? `Approach: ${chosen.approach}` : "",
    "",
    `This is post ${item.sequence} of ${campaign.executionPlan.totalAssets}, published ${item.day} ${item.date} at ${item.publishTimeLocal} on ${item.channel} as a ${item.assetType}.`,
    `Theme: ${item.theme}`,
    `What this post must do: ${item.action}`,
    `Why it is in the plan: ${item.purpose}`,
    `The result it should produce: ${item.expectedImpact}`,
    `Measured by: ${item.primaryMetric}`,
    "",
    "Write only this post. Do not invent prices, dates, discounts, results or availability that the brief and brand memory do not state.",
  ].filter(Boolean).join("\n").slice(0, 8_000);

  // The poster prompt supplies the wording and the brand mark rules, so this
  // brief describes only what the piece has to achieve.
  const imageBrief = [
    `Post ${item.sequence} of ${campaign.executionPlan.totalAssets} in the campaign "${campaign.executionPlan.campaignName}".`,
    `Theme: ${item.theme}.`,
    `Published as a ${item.assetType} on ${item.channel}.`,
    `It must support this: ${item.action}`,
    `The reader should come away ready to: ${item.expectedImpact}`,
  ].join("\n").slice(0, 8_000);

  return {
    sequence: item.sequence,
    channel,
    plannedChannel: item.channel,
    channelNote: note,
    campaignName: campaign.executionPlan.campaignName,
    item,
    brief,
    imageBrief,
  };
}
