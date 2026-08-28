import {
  CampaignPerformanceSchema,
  CampaignRecommendationSchema,
  type CampaignAssetSnapshot,
  type CampaignCriterionKey,
  type CampaignDefinition,
  type CampaignIssue,
  type CampaignMetricSnapshot,
  type CampaignPerformance,
  type CampaignRecommendation,
  type PostflightModelEvaluation,
  type PreflightModelEvaluation,
} from "./schema";

export const CAMPAIGN_CRITERIA: Record<
  CampaignCriterionKey,
  { label: string; weight: number }
> = {
  alignment: { label: "Objective and brand alignment", weight: 15 },
  targeting: { label: "Audience and targeting", weight: 15 },
  offer: { label: "Offer strength", weight: 15 },
  "creative-fit": { label: "Creative-to-audience fit", weight: 15 },
  "message-match": { label: "Campaign-to-landing-page match", weight: 15 },
  tracking: { label: "Measurement and tracking", weight: 15 },
  feasibility: { label: "Budget, timing and feasibility", weight: 10 },
};

const criterionKeys = Object.keys(CAMPAIGN_CRITERIA) as CampaignCriterionKey[];

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function issue(
  id: string,
  criterion: CampaignCriterionKey,
  severity: CampaignIssue["severity"],
  finding: string,
  evidenceIds: string[],
  suggestedFix: string,
): CampaignIssue {
  return { id, criterion, severity, finding, evidenceIds, suggestedFix };
}

function conversionIntent(campaign: CampaignDefinition): boolean {
  return /lead|conversion|sale|revenue|purchase|booking|signup|sign-up|demo|cpa|cpl|roas/i.test(
    `${campaign.objective} ${campaign.primaryKpi}`,
  );
}

export function preflightRuleIssues(
  campaign: CampaignDefinition,
  assets: CampaignAssetSnapshot[],
): CampaignIssue[] {
  const issues: CampaignIssue[] = [];
  const add = (...items: CampaignIssue[]) => issues.push(...items);

  if (!campaign.objective) {
    add(issue("objective-missing", "alignment", "blocker", "The campaign has no stated objective.", ["campaign.objective"], "Define one business outcome this campaign is responsible for."));
  }
  if (!campaign.hypothesis) {
    add(issue("hypothesis-missing", "alignment", "major", "There is no falsifiable campaign hypothesis.", ["campaign.hypothesis"], "State what change is expected, for which audience, and why."));
  } else if (campaign.hypothesis.length < 40) {
    add(issue("hypothesis-thin", "alignment", "minor", "The hypothesis is too brief to connect the intervention to an expected outcome.", ["campaign.hypothesis"], "Name the audience, intervention, metric, and expected direction of change."));
  }

  if (campaign.audiences.length === 0) {
    add(issue("audience-missing", "targeting", "blocker", "No target audience has been selected.", ["campaign.audiences"], "Define at least one named audience with a need and a usable targeting rule."));
  }
  for (const [index, audience] of campaign.audiences.entries()) {
    if (!audience.need || !audience.targeting) {
      add(issue(
        `audience-${index + 1}-underspecified`,
        "targeting",
        "major",
        `${audience.name} does not have both a buyer need and an executable targeting definition.`,
        [`campaign.audiences.${index}`],
        "Add the audience need, eligibility signals, exclusions, geography, and any first-party audience source.",
      ));
    }
  }

  if (!campaign.offer.name || !campaign.offer.valueProposition) {
    add(issue("offer-missing", "offer", "blocker", "The offer is not concrete enough to evaluate or advertise.", ["campaign.offer"], "Name the offer and state the specific value the audience receives."));
  }
  if (!campaign.offer.callToAction) {
    add(issue("offer-cta-missing", "offer", "major", "The offer has no single call to action.", ["campaign.offer.callToAction"], "Choose one observable next action and use it consistently across assets and landing page."));
  }
  if (campaign.offer.proofPoints.length === 0) {
    add(issue("offer-proof-missing", "offer", "minor", "The offer is not supported by an approved proof point.", ["campaign.offer.proofPoints"], "Attach a verified result, capability, testimonial, or operational fact from Brand Memory."));
  }

  if (assets.length === 0) {
    add(issue("assets-missing", "creative-fit", "blocker", "No campaign creative was supplied for review.", ["campaign.assets"], "Attach at least one representative asset for every active campaign channel."));
  }
  const activeChannels = new Set(campaign.channels.map((channel) => channel.toLowerCase()));
  for (const asset of assets) {
    if (!asset.audience) {
      add(issue(`asset-${asset.id}-audience`, "creative-fit", "major", `${asset.id} is not mapped to a target audience.`, [`asset:${asset.id}`], "Assign the asset to one campaign audience and make the hook specific to that audience's need."));
    }
    if (!asset.callToAction) {
      add(issue(`asset-${asset.id}-cta`, "creative-fit", "minor", `${asset.id} has no explicit call to action.`, [`asset:${asset.id}`], "Add the campaign's approved call to action."));
    }
    if (activeChannels.size > 0 && !activeChannels.has(asset.channel.toLowerCase())) {
      add(issue(`asset-${asset.id}-channel`, "feasibility", "minor", `${asset.id} uses ${asset.channel}, which is not in the campaign channel plan.`, [`asset:${asset.id}`, "campaign.channels"], "Add the channel to the plan or remove this asset from the campaign."));
    }
    if (asset.brandScore !== undefined && asset.brandScore < 70) {
      add(issue(`asset-${asset.id}-brand-score`, "creative-fit", "major", `${asset.id} has a Brand Fit Score below 70.`, [`asset:${asset.id}.brandScore`], "Revise and re-score the asset with the Brand Judge before launch."));
    }
  }

  const needsLandingPage = conversionIntent(campaign);
  if (needsLandingPage && !campaign.landingPage.url && !campaign.landingPage.headline) {
    add(issue("landing-page-missing", "message-match", "blocker", "A conversion campaign has no landing-page destination or copy to review.", ["campaign.landingPage"], "Provide the destination URL or landing-page headline, offer, and CTA."));
  }
  if (campaign.landingPage.headline && campaign.landingPage.callToAction && campaign.offer.callToAction &&
      campaign.landingPage.callToAction.toLowerCase() !== campaign.offer.callToAction.toLowerCase()) {
    add(issue("landing-cta-mismatch", "message-match", "major", "The landing-page CTA does not match the campaign offer CTA.", ["campaign.offer.callToAction", "campaign.landingPage.callToAction"], "Use one action and one label from creative through conversion."));
  }

  if (!campaign.primaryKpi) {
    add(issue("kpi-missing", "tracking", "blocker", "The campaign has no primary KPI.", ["campaign.primaryKpi"], "Select one primary KPI that directly measures the stated objective."));
  }
  if (campaign.targetValue === undefined) {
    add(issue("target-missing", "tracking", "major", "The primary KPI has no numeric success target.", ["campaign.targetValue"], "Set a numeric success threshold and unit before launch."));
  }
  if (!campaign.tracking.analyticsConfigured) {
    add(issue("analytics-missing", "tracking", needsLandingPage ? "blocker" : "major", "Analytics collection is not confirmed.", ["campaign.tracking.analyticsConfigured"], "Confirm the analytics property, destination, and test event before launch."));
  }
  if (needsLandingPage && !campaign.tracking.conversionEvent) {
    add(issue("conversion-event-missing", "tracking", "blocker", "No conversion event is mapped to the campaign KPI.", ["campaign.tracking.conversionEvent"], "Name and test the exact event that counts as a conversion."));
  }
  if (!campaign.tracking.utmPlan) {
    add(issue("utm-plan-missing", "tracking", "major", "There is no canonical UTM plan for campaign links.", ["campaign.tracking.utmPlan"], "Define source, medium, campaign, content, and term conventions."));
  }

  if (campaign.channels.length === 0) {
    add(issue("channels-missing", "feasibility", "blocker", "The campaign has no execution channel.", ["campaign.channels"], "Select at least one channel that can reach the target audience."));
  }
  if (campaign.budget.amount <= 0) {
    add(issue("budget-missing", "feasibility", "blocker", "The campaign budget is zero or missing.", ["campaign.budget.amount"], "Set the maximum approved campaign budget."));
  }
  const allocated = campaign.budget.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (campaign.budget.amount > 0 && campaign.budget.allocations.length === 0) {
    add(issue("budget-allocation-missing", "feasibility", "major", "The total budget is not allocated across channels.", ["campaign.budget.allocations"], "Allocate the budget across active channels and preserve a small testing reserve."));
  } else if (campaign.budget.amount > 0 && Math.abs(allocated - campaign.budget.amount) > Math.max(1, campaign.budget.amount * 0.01)) {
    add(issue("budget-allocation-mismatch", "feasibility", "blocker", `Channel allocations total ${campaign.budget.currency} ${round(allocated)}, not the approved ${campaign.budget.currency} ${round(campaign.budget.amount)}.`, ["campaign.budget.amount", "campaign.budget.allocations"], "Make channel allocations reconcile to the approved total."));
  }
  if (Date.parse(campaign.endDate) < Date.parse(campaign.startDate)) {
    add(issue("date-range-invalid", "feasibility", "blocker", "The campaign end date is before its start date.", ["campaign.startDate", "campaign.endDate"], "Correct the campaign date range."));
  }

  return issues;
}

function ruleScore(criterion: CampaignCriterionKey, issues: CampaignIssue[]): number {
  const penalty = issues
    .filter((item) => item.criterion === criterion)
    .reduce((sum, item) => sum + (item.severity === "blocker" ? 60 : item.severity === "major" ? 25 : 10), 0);
  return Math.max(0, 100 - penalty);
}

function dedupeIssues(issues: CampaignIssue[]): CampaignIssue[] {
  return Array.from(new Map(issues.map((item) => [item.id, item])).values());
}

function preflightFallbackRecommendations(issues: CampaignIssue[]): CampaignRecommendation[] {
  const ordered = [...issues].sort((left, right) => {
    const severity = { blocker: 0, major: 1, minor: 2 } as const;
    return severity[left.severity] - severity[right.severity];
  });
  const defaults: CampaignIssue[] = [
    issue("fallback-measurement", "tracking", "minor", "Confirm the full measurement path before approving spend.", ["campaign.tracking"], "Run a test click and conversion, then verify attribution in analytics."),
    issue("fallback-creative", "creative-fit", "minor", "Confirm every channel has an approved representative creative.", ["campaign.assets"], "Review one complete asset per channel and audience."),
    issue("fallback-review", "alignment", "minor", "Schedule the post-flight review while the original hypothesis is still explicit.", ["campaign.hypothesis"], "Set the review date and preserve the launch snapshot."),
  ];
  return [...ordered, ...defaults].slice(0, 3).map((item, index) => CampaignRecommendationSchema.parse({
    rank: index + 1,
    action: item.suggestedFix,
    rationale: item.finding,
    evidence: [],
    expectedImpact: {
      low: null,
      high: null,
      unit: "not estimated",
      basis: "No campaign performance history is available before launch.",
    },
    effort: item.severity === "blocker" ? "medium" : "low",
    confidence: "high",
    planItem: null,
  }));
}

export function finalisePreflight(options: {
  campaign: CampaignDefinition;
  ruleIssues: CampaignIssue[];
  modelEvaluation: PreflightModelEvaluation | null;
}) {
  const modelCriteria = new Map(
    options.modelEvaluation?.criteria.map((criterion) => [criterion.key, criterion]) ?? [],
  );
  const issues = dedupeIssues([
    ...options.ruleIssues,
    ...(options.modelEvaluation?.issues ?? []),
  ]);
  const criteria = criterionKeys.map((key) => {
    const modelCriterion = modelCriteria.get(key);
    const score = Math.min(
      ruleScore(key, issues),
      modelCriterion?.score ?? 100,
    );
    return {
      key,
      label: CAMPAIGN_CRITERIA[key].label,
      score,
      weight: CAMPAIGN_CRITERIA[key].weight,
      finding: modelCriterion?.finding ?? (
        issues.find((item) => item.criterion === key)?.finding ?? "No material issue was identified from the supplied evidence."
      ),
      evidenceIds: modelCriterion?.evidenceIds ?? [],
    };
  });
  const readinessScore = Math.round(criteria.reduce(
    (sum, criterion) => sum + criterion.score * criterion.weight,
    0,
  ) / 100);
  const blockingIssues = issues.filter((item) => item.severity === "blocker");
  const verdict = blockingIssues.length > 0 || readinessScore < 70
    ? "hold" as const
    : readinessScore < 85
      ? "revise" as const
      : "ready" as const;
  const modelRecommendations = options.modelEvaluation?.recommendations.map((recommendation, index) => ({
    ...recommendation,
    rank: index + 1,
    evidence: [],
    expectedImpact: {
      low: null,
      high: null,
      unit: "not estimated",
      basis: "Pre-flight recommendations do not have observed campaign performance behind them.",
    },
  })) ?? null;

  return {
    verdict,
    readinessScore,
    executiveSummary: options.modelEvaluation?.executiveSummary ?? (
      verdict === "ready"
        ? `${options.campaign.name} is ready for human launch approval.`
        : `${options.campaign.name} should not launch unchanged; ${blockingIssues.length || issues.length} material issue${(blockingIssues.length || issues.length) === 1 ? "" : "s"} require attention.`
    ),
    criteria,
    issues,
    blockingIssues,
    recommendations: modelRecommendations ?? preflightFallbackRecommendations(issues),
  };
}

type Totals = CampaignPerformance["totals"];

function metricTotals(metrics: CampaignMetricSnapshot[]): Totals {
  const raw = metrics.reduce((sum, metric) => ({
    impressions: sum.impressions + metric.impressions,
    clicks: sum.clicks + metric.clicks,
    spend: sum.spend + metric.spend,
    conversions: sum.conversions + metric.conversions,
    revenue: sum.revenue + metric.revenue,
  }), { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 });
  return {
    ...raw,
    ctr: raw.impressions ? round((raw.clicks / raw.impressions) * 100) : 0,
    conversionRate: raw.clicks ? round((raw.conversions / raw.clicks) * 100) : 0,
    cpc: raw.clicks ? round(raw.spend / raw.clicks) : null,
    cpa: raw.conversions ? round(raw.spend / raw.conversions) : null,
    roas: raw.spend ? round(raw.revenue / raw.spend) : null,
  };
}

function groupedTotals(
  metrics: CampaignMetricSnapshot[],
  keyFor: (metric: CampaignMetricSnapshot) => string | undefined,
): Array<{ key: string; totals: Totals }> {
  const groups = new Map<string, CampaignMetricSnapshot[]>();
  for (const metric of metrics) {
    const key = keyFor(metric)?.trim();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), metric]);
  }
  return Array.from(groups, ([key, values]) => ({ key, totals: metricTotals(values) }));
}

function primaryKpi(campaign: CampaignDefinition, totals: Totals) {
  const name = campaign.primaryKpi || "unspecified KPI";
  const canonical = name.toLowerCase();
  let actual: number | null = null;
  let unit = campaign.targetUnit || "value";
  let direction: "higher" | "lower" = "higher";
  let sampleSize = totals.conversions;

  if (/click.through|\bctr\b/.test(canonical)) {
    actual = totals.ctr; unit = campaign.targetUnit || "%"; sampleSize = totals.impressions;
  } else if (/conversion rate|\bcvr\b/.test(canonical)) {
    actual = totals.conversionRate; unit = campaign.targetUnit || "%"; sampleSize = totals.clicks;
  } else if (/cost per click|\bcpc\b/.test(canonical)) {
    actual = totals.cpc; unit = campaign.targetUnit || campaign.budget.currency; direction = "lower"; sampleSize = totals.clicks;
  } else if (/cost per|\bcpa\b|\bcpl\b/.test(canonical)) {
    actual = totals.cpa; unit = campaign.targetUnit || campaign.budget.currency; direction = "lower"; sampleSize = totals.conversions;
  } else if (/\broas\b|return on ad/.test(canonical)) {
    actual = totals.roas; unit = campaign.targetUnit || "x"; sampleSize = totals.conversions;
  } else if (/revenue|sales value/.test(canonical)) {
    actual = totals.revenue; unit = campaign.targetUnit || campaign.budget.currency; sampleSize = totals.conversions;
  } else if (/conversion|lead|sale|booking|signup|sign-up/.test(canonical)) {
    actual = totals.conversions; unit = campaign.targetUnit || "conversions"; sampleSize = totals.conversions;
  } else if (/click/.test(canonical)) {
    actual = totals.clicks; unit = campaign.targetUnit || "clicks"; sampleSize = totals.clicks;
  } else if (/impression|reach/.test(canonical)) {
    actual = totals.impressions; unit = campaign.targetUnit || "impressions"; sampleSize = totals.impressions;
  }

  return {
    name,
    actual,
    target: campaign.targetValue ?? null,
    unit,
    direction,
    sampleSize,
    confidence: sampleSize === 0
      ? "insufficient" as const
      : sampleSize < 10
        ? "directional" as const
        : "supported" as const,
  };
}

export function aggregateCampaignPerformance(
  campaign: CampaignDefinition,
  metrics: CampaignMetricSnapshot[],
): CampaignPerformance {
  const totals = metricTotals(metrics);
  const kpi = primaryKpi(campaign, totals);
  const caveats: string[] = [];
  if (metrics.length === 0) caveats.push("No campaign metric rows were supplied.");
  if (kpi.actual === null) caveats.push(`The primary KPI '${campaign.primaryKpi || "unspecified"}' cannot be calculated from the available metric fields.`);
  if (kpi.target === null) caveats.push("The campaign has no numeric target, so outcome classification is inconclusive.");
  if (kpi.confidence === "directional") caveats.push(`The primary KPI is based on n=${kpi.sampleSize}; treat the result as directional below n=10.`);
  if (metrics.some((metric) => !metric.assetId)) caveats.push("Some rows have no asset ID, so creative-level attribution is incomplete.");
  if (metrics.some((metric) => !metric.audience)) caveats.push("Some rows have no audience label, so audience-level attribution is incomplete.");
  if (totals.spend > 0 && totals.revenue === 0) caveats.push("No attributed revenue was supplied; ROAS cannot distinguish zero revenue from missing revenue tracking.");

  return CampaignPerformanceSchema.parse({
    totals,
    primaryKpi: kpi,
    byChannel: groupedTotals(metrics, (metric) => metric.channel).map(({ key, totals: grouped }) => ({ channel: key, totals: grouped })),
    byAsset: groupedTotals(metrics, (metric) => metric.assetId).map(({ key, totals: grouped }) => ({ assetId: key, totals: grouped })),
    byAudience: groupedTotals(metrics, (metric) => metric.audience).map(({ key, totals: grouped }) => ({ audience: key, totals: grouped })),
    caveats,
  });
}

export function campaignOutcome(performance: CampaignPerformance) {
  const { actual, target, direction, confidence } = performance.primaryKpi;
  if (actual === null || target === null || confidence === "insufficient") return "inconclusive" as const;
  const met = direction === "higher" ? actual >= target : actual <= target;
  if (met) return "met" as const;
  if (target === 0) return "missed" as const;
  const gapRatio = direction === "higher"
    ? (target - actual) / Math.abs(target)
    : (actual - target) / Math.abs(target);
  return gapRatio <= 0.2 ? "partially-met" as const : "missed" as const;
}

function allowedEvidenceValues(performance: CampaignPerformance): number[] {
  const totals = performance.totals;
  const values = [
    totals.impressions, totals.clicks, totals.spend, totals.conversions, totals.revenue,
    totals.ctr, totals.conversionRate, totals.cpc, totals.cpa, totals.roas,
    performance.primaryKpi.actual, performance.primaryKpi.target,
  ];
  for (const item of [...performance.byChannel, ...performance.byAsset, ...performance.byAudience]) {
    values.push(item.totals.ctr, item.totals.conversionRate, item.totals.cpc, item.totals.cpa, item.totals.roas);
  }
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function sanitisePostflightRecommendation(
  recommendation: CampaignRecommendation,
  performance: CampaignPerformance,
  rank: number,
): CampaignRecommendation {
  const allowed = allowedEvidenceValues(performance);
  const evidence = recommendation.evidence.filter((item) =>
    allowed.some((value) => Math.abs(value - item.value) < 0.0001),
  );
  const unsupportedImpact = evidence.length === 0;
  return CampaignRecommendationSchema.parse({
    ...recommendation,
    rank,
    evidence,
    confidence: unsupportedImpact ? "low" : recommendation.confidence,
    expectedImpact: unsupportedImpact
      ? {
          low: null,
          high: null,
          unit: "not estimated",
          basis: "The supplied evidence does not support a numeric impact estimate.",
        }
      : recommendation.expectedImpact,
  });
}

function fallbackPostflightRecommendations(
  campaign: CampaignDefinition,
  performance: CampaignPerformance,
): CampaignRecommendation[] {
  const channels = [...performance.byChannel].sort((left, right) => right.totals.ctr - left.totals.ctr);
  const strongest = channels[0];
  const weakest = channels.length > 1 ? channels[channels.length - 1] : null;
  const recommendations = [
    {
      action: strongest ? `Preserve ${strongest.channel} as the control channel in the next test.` : "Preserve the current campaign as a documented baseline.",
      rationale: strongest ? `${strongest.channel} produced the strongest observed click-through rate.` : "There is not enough channel-level evidence to identify a winner.",
      evidence: strongest ? [{ label: `${strongest.channel} CTR`, value: strongest.totals.ctr, unit: "%", sampleSize: strongest.totals.impressions }] : [],
      effort: "low" as const,
      confidence: strongest && strongest.totals.impressions >= 10 ? "medium" as const : "low" as const,
      planItem: strongest ? { channel: strongest.channel, format: "campaign iteration", hook: `Repeat the strongest ${campaign.name} message with one controlled change.`, pillar: "Campaign learning", rationale: "Keep a stable control while testing the next hypothesis." } : null,
    },
    {
      action: weakest ? `Revise or pause the weakest ${weakest.channel} execution before adding spend.` : "Run one controlled creative or audience test next.",
      rationale: weakest ? `${weakest.channel} had the weakest observed click-through rate.` : "A controlled test is needed to isolate what caused the result.",
      evidence: weakest ? [{ label: `${weakest.channel} CTR`, value: weakest.totals.ctr, unit: "%", sampleSize: weakest.totals.impressions }] : [],
      effort: "medium" as const,
      confidence: weakest && weakest.totals.impressions >= 10 ? "medium" as const : "low" as const,
      planItem: weakest ? { channel: weakest.channel, format: "creative test", hook: "Test one new hook against the previous campaign control.", pillar: "Campaign learning", rationale: "Change one variable so the next result is interpretable." } : null,
    },
    {
      action: "Close the identified attribution gaps before the next campaign review.",
      rationale: performance.caveats[0] ?? "Campaign decisions need complete asset and audience attribution.",
      evidence: [{ label: "Metric rows", value: performance.primaryKpi.sampleSize, unit: "primary-KPI sample", sampleSize: performance.primaryKpi.sampleSize }],
      effort: "low" as const,
      confidence: "high" as const,
      planItem: null,
    },
  ];
  return recommendations.map((recommendation, index) => CampaignRecommendationSchema.parse({
    rank: index + 1,
    ...recommendation,
    expectedImpact: {
      low: null,
      high: null,
      unit: "not estimated",
      basis: "No controlled historical comparison was supplied.",
    },
  }));
}

export function finalisePostflight(options: {
  campaign: CampaignDefinition;
  performance: CampaignPerformance;
  modelEvaluation: PostflightModelEvaluation | null;
}) {
  const outcome = campaignOutcome(options.performance);
  const recommendations = options.modelEvaluation?.recommendations.map((recommendation, index) =>
    sanitisePostflightRecommendation(recommendation, options.performance, index + 1),
  ) ?? fallbackPostflightRecommendations(options.campaign, options.performance);
  const diagnosis = options.modelEvaluation?.diagnosis ?? [
    `The primary KPI outcome is ${outcome.replace("-", " ")}.`,
    ...(options.performance.caveats.length > 0
      ? options.performance.caveats.slice(0, 3)
      : ["The supplied metrics contain enough information for a supported directional review."]),
  ];
  return {
    outcome,
    executiveSummary: options.modelEvaluation?.executiveSummary ?? (
      outcome === "inconclusive"
        ? `${options.campaign.name} cannot be judged conclusively from the available measurement evidence.`
        : `${options.campaign.name} ${outcome.replace("-", " ")} its stated primary KPI target.`
    ),
    diagnosis,
    performance: options.performance,
    recommendations,
  };
}
