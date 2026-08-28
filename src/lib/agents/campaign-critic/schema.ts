import { z } from "zod";

export const CampaignReviewModeSchema = z.enum(["preflight", "postflight"]);
export const CampaignVerdictSchema = z.enum(["ready", "revise", "hold"]);
export const CampaignOutcomeSchema = z.enum([
  "met",
  "partially-met",
  "missed",
  "inconclusive",
]);

export const CampaignCriterionKeySchema = z.enum([
  "alignment",
  "targeting",
  "offer",
  "creative-fit",
  "message-match",
  "tracking",
  "feasibility",
]);

export const CampaignDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().min(1).max(160),
  objective: z.string().trim().max(2_000).default(""),
  hypothesis: z.string().trim().max(2_000).default(""),
  offer: z.object({
    name: z.string().trim().max(200).default(""),
    valueProposition: z.string().trim().max(2_000).default(""),
    callToAction: z.string().trim().max(500).default(""),
    proofPoints: z.array(z.string().trim().min(1).max(800)).max(20).default([]),
  }).default({ name: "", valueProposition: "", callToAction: "", proofPoints: [] }),
  audiences: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    need: z.string().trim().max(1_000).default(""),
    targeting: z.string().trim().max(1_500).default(""),
  })).max(12).default([]),
  channels: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  budget: z.object({
    amount: z.number().nonnegative().default(0),
    currency: z.string().trim().min(3).max(8).default("MYR"),
    allocations: z.array(z.object({
      channel: z.string().trim().min(1).max(80),
      amount: z.number().nonnegative(),
    })).max(20).default([]),
  }).default({ amount: 0, currency: "MYR", allocations: [] }),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  primaryKpi: z.string().trim().max(160).default(""),
  targetValue: z.number().finite().optional(),
  targetUnit: z.string().trim().max(80).default(""),
  landingPage: z.object({
    url: z.url().optional(),
    headline: z.string().trim().max(500).default(""),
    offer: z.string().trim().max(1_000).default(""),
    callToAction: z.string().trim().max(500).default(""),
  }).default({ headline: "", offer: "", callToAction: "" }),
  tracking: z.object({
    analyticsConfigured: z.boolean().default(false),
    pixelConfigured: z.boolean().default(false),
    conversionEvent: z.string().trim().max(200).default(""),
    utmPlan: z.string().trim().max(1_000).default(""),
  }).default({
    analyticsConfigured: false,
    pixelConfigured: false,
    conversionEvent: "",
    utmPlan: "",
  }),
});

export const CampaignAssetSnapshotSchema = z.object({
  id: z.string().trim().min(1).max(160),
  channel: z.string().trim().min(1).max(80),
  format: z.string().trim().min(1).max(120),
  audience: z.string().trim().max(200).default(""),
  message: z.string().trim().min(1).max(12_000),
  callToAction: z.string().trim().max(500).default(""),
  landingPageUrl: z.url().optional(),
  brandScore: z.number().int().min(0).max(100).optional(),
  approved: z.boolean().default(false),
});

export const CampaignMetricSnapshotSchema = z.object({
  date: z.iso.datetime(),
  channel: z.string().trim().min(1).max(80),
  assetId: z.string().trim().min(1).max(160).optional(),
  audience: z.string().trim().max(200).default(""),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  spend: z.number().nonnegative(),
  conversions: z.number().int().nonnegative(),
  revenue: z.number().nonnegative().default(0),
});

const PreflightPayloadSchema = z.object({
  mode: z.literal("preflight"),
  campaign: CampaignDefinitionSchema,
  assets: z.array(CampaignAssetSnapshotSchema).max(100).default([]),
  notes: z.string().trim().max(4_000).default(""),
});

const PostflightPayloadSchema = z.object({
  mode: z.literal("postflight"),
  campaignId: z.string().trim().min(1).max(160),
  metrics: z.array(CampaignMetricSnapshotSchema).max(10_000).default([]),
  analystFindings: z.array(z.string().trim().min(1).max(1_000)).max(30).default([]),
  notes: z.string().trim().max(4_000).default(""),
});

export const CampaignCriticPayloadSchema = z.discriminatedUnion("mode", [
  PreflightPayloadSchema,
  PostflightPayloadSchema,
]);

export const CampaignIssueSchema = z.object({
  id: z.string().trim().min(1).max(120),
  criterion: CampaignCriterionKeySchema,
  severity: z.enum(["blocker", "major", "minor"]),
  finding: z.string().trim().min(1).max(1_000),
  evidenceIds: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  suggestedFix: z.string().trim().min(1).max(1_000),
});

export const CampaignCriterionAssessmentSchema = z.object({
  key: CampaignCriterionKeySchema,
  label: z.string().trim().min(1).max(120),
  score: z.number().int().min(0).max(100),
  weight: z.number().int().min(1).max(100),
  finding: z.string().trim().min(1).max(1_000),
  evidenceIds: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
});

export const RecommendationEvidenceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  value: z.number(),
  unit: z.string().trim().min(1).max(80),
  sampleSize: z.number().int().nonnegative(),
});

export const CampaignRecommendationSchema = z.object({
  rank: z.number().int().min(1).max(3),
  action: z.string().trim().min(1).max(800),
  rationale: z.string().trim().min(1).max(1_200),
  evidence: z.array(RecommendationEvidenceSchema).max(8).default([]),
  expectedImpact: z.object({
    low: z.number().nullable(),
    high: z.number().nullable(),
    unit: z.string().trim().min(1).max(80),
    basis: z.string().trim().min(1).max(800),
  }),
  effort: z.enum(["low", "medium", "high"]),
  confidence: z.enum(["low", "medium", "high"]),
  planItem: z.object({
    channel: z.string().trim().min(1).max(80),
    format: z.string().trim().min(1).max(120),
    hook: z.string().trim().min(1).max(500),
    pillar: z.string().trim().min(1).max(160),
    rationale: z.string().trim().min(1).max(800),
  }).nullable().default(null),
});

export const PreflightModelEvaluationSchema = z.object({
  criteria: z.array(z.object({
    key: CampaignCriterionKeySchema,
    score: z.number().int().min(0).max(100),
    finding: z.string().trim().min(1).max(1_000),
    evidenceIds: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  })).length(7).superRefine((criteria, context) => {
    const keys = new Set(criteria.map((criterion) => criterion.key));
    if (keys.size !== 7) {
      context.addIssue({ code: "custom", message: "Return every campaign criterion exactly once." });
    }
  }),
  issues: z.array(CampaignIssueSchema).max(30),
  recommendations: z.array(CampaignRecommendationSchema).length(3),
  executiveSummary: z.string().trim().min(1).max(1_500),
});

const MetricTotalsSchema = z.object({
  impressions: z.number().nonnegative(),
  clicks: z.number().nonnegative(),
  spend: z.number().nonnegative(),
  conversions: z.number().nonnegative(),
  revenue: z.number().nonnegative(),
  ctr: z.number().nonnegative(),
  conversionRate: z.number().nonnegative(),
  cpc: z.number().nullable(),
  cpa: z.number().nullable(),
  roas: z.number().nullable(),
});

export const CampaignPerformanceSchema = z.object({
  totals: MetricTotalsSchema,
  primaryKpi: z.object({
    name: z.string().trim().min(1),
    actual: z.number().nullable(),
    target: z.number().nullable(),
    unit: z.string().trim().min(1),
    direction: z.enum(["higher", "lower"]),
    sampleSize: z.number().int().nonnegative(),
    confidence: z.enum(["insufficient", "directional", "supported"]),
  }),
  byChannel: z.array(z.object({ channel: z.string(), totals: MetricTotalsSchema })),
  byAsset: z.array(z.object({ assetId: z.string(), totals: MetricTotalsSchema })),
  byAudience: z.array(z.object({ audience: z.string(), totals: MetricTotalsSchema })),
  caveats: z.array(z.string().trim().min(1).max(800)).max(20),
});

export const PostflightModelEvaluationSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(1_500),
  diagnosis: z.array(z.string().trim().min(1).max(1_000)).min(1).max(8),
  recommendations: z.array(CampaignRecommendationSchema).length(3),
});

const ReviewMetadataSchema = z.object({
  reviewId: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  campaignName: z.string().trim().min(1),
  reviewedAt: z.iso.datetime(),
});

export const PreflightReviewResultSchema = ReviewMetadataSchema.extend({
  mode: z.literal("preflight"),
  verdict: CampaignVerdictSchema,
  readinessScore: z.number().int().min(0).max(100),
  executiveSummary: z.string().trim().min(1).max(1_500),
  criteria: z.array(CampaignCriterionAssessmentSchema).length(7),
  issues: z.array(CampaignIssueSchema).max(50),
  blockingIssues: z.array(CampaignIssueSchema).max(50),
  recommendations: z.array(CampaignRecommendationSchema).length(3),
});

export const PostflightReviewResultSchema = ReviewMetadataSchema.extend({
  mode: z.literal("postflight"),
  outcome: CampaignOutcomeSchema,
  executiveSummary: z.string().trim().min(1).max(1_500),
  diagnosis: z.array(z.string().trim().min(1).max(1_000)).min(1).max(8),
  performance: CampaignPerformanceSchema,
  recommendations: z.array(CampaignRecommendationSchema).length(3),
});

export const CampaignCriticResultSchema = z.discriminatedUnion("mode", [
  PreflightReviewResultSchema,
  PostflightReviewResultSchema,
]);

export type CampaignDefinition = z.infer<typeof CampaignDefinitionSchema>;
export type CampaignAssetSnapshot = z.infer<typeof CampaignAssetSnapshotSchema>;
export type CampaignMetricSnapshot = z.infer<typeof CampaignMetricSnapshotSchema>;
export type CampaignCriticPayload = z.infer<typeof CampaignCriticPayloadSchema>;
export type CampaignIssue = z.infer<typeof CampaignIssueSchema>;
export type CampaignCriterionKey = z.infer<typeof CampaignCriterionKeySchema>;
export type CampaignRecommendation = z.infer<typeof CampaignRecommendationSchema>;
export type PreflightModelEvaluation = z.infer<typeof PreflightModelEvaluationSchema>;
export type PostflightModelEvaluation = z.infer<typeof PostflightModelEvaluationSchema>;
export type CampaignPerformance = z.infer<typeof CampaignPerformanceSchema>;
export type CampaignCriticResult = z.infer<typeof CampaignCriticResultSchema>;
