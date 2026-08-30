/**
 * Every agent the product runs, in the order they appear in a campaign.
 *
 * Kept free of imports so client components can read it. The topbar count is
 * derived from this rather than typed as a number, which had already drifted
 * to four while seven agents were running.
 */
export const AGENT_ROSTER = [
  "CMO",
  "Brand Analyst",
  "Analyst",
  "Strategist",
  "Copywriter",
  "Brand Judge",
  "Campaign Critic",
] as const;

export const AGENT_COUNT = AGENT_ROSTER.length;
