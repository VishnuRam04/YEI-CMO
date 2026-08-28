import { z } from "zod";
import { AnalystResultSchema } from "@/lib/agents/analyst/schema";

export const StrategyHorizonSchema = z.enum(["sprint", "quarter"]);

export const StrategistPayloadSchema = z.object({
  objective: z.string().trim().min(1).max(2_000),
  cmoDirective: z.string().trim().min(1).max(2_000).optional(),
  intelligence: AnalystResultSchema,
  productSelectors: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  channels: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  horizon: StrategyHorizonSchema.default("sprint"),
  constraints: z.object({
    budget: z.number().nonnegative().optional(),
    deadline: z.iso.datetime().optional(),
    markets: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
    notes: z.string().trim().min(1).max(2_000).optional(),
  }).default({ markets: [] }),
});

export const StrategyInformationRequestSchema = z.object({
  field: z.string().trim().min(1).max(160),
  severity: z.enum(["blocking", "review", "optional"]),
  reason: z.string().trim().min(1).max(800),
  question: z.string().trim().min(1).max(500),
  affects: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
});

export const StrategyExecutionPlanSchema = z.object({
  selectedExperimentId: z.string().trim().min(1).max(80),
  campaignName: z.string().trim().min(1).max(160),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  timezone: z.string().trim().min(1).max(80),
  totalAssets: z.number().int().min(1).max(30),
  cadence: z.string().trim().min(1).max(300),
  costLevel: z.enum(["low", "medium", "high"]),
  planningBasis: z.enum([
    "owned-and-market-evidence",
    "market-evidence-directional",
    "brand-led-assumption",
  ]),
  schedule: z.array(z.object({
    sequence: z.number().int().min(1).max(30),
    date: z.iso.date(),
    day: z.string().trim().min(1).max(20),
    publishTimeLocal: z.string().trim().min(1).max(20),
    channel: z.string().trim().min(1).max(80),
    assetType: z.string().trim().min(1).max(120),
    theme: z.string().trim().min(1).max(200),
    action: z.string().trim().min(1).max(600),
    purpose: z.string().trim().min(1).max(300),
    expectedImpact: z.string().trim().min(1).max(400),
    primaryMetric: z.string().trim().min(1).max(120),
  })).min(1).max(30),
  measurement: z.object({
    primaryMetric: z.string().trim().min(1).max(120),
    successThreshold: z.string().trim().min(1).max(300),
    stopCondition: z.string().trim().min(1).max(300),
    reviewDate: z.iso.date(),
    timingBasis: z.string().trim().min(1).max(400),
  }),
});

export const StrategistModelResultSchema = z.object({
  ideaVerdict: z.enum(["strong", "promising", "needs-work", "not-recommended"]),
  verdictReason: z.string().trim().min(1).max(500),
  strategicThesis: z.string().trim().min(1).max(1_500),
  targetAudiences: z.array(z.string().trim().min(1).max(400)).max(8),
  selectedProducts: z.array(z.string().trim().min(1).max(200)).max(20),
  positioningAngle: z.string().trim().min(1).max(1_000),
  offerStrategy: z.string().trim().min(1).max(1_000),
  channelRoles: z.array(z.object({
    channel: z.string().trim().min(1).max(80),
    purpose: z.string().trim().min(1).max(500),
    cadence: z.string().trim().min(1).max(200),
  })).max(12),
  contentPillars: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    rationale: z.string().trim().min(1).max(800),
    evidenceIds: z.array(z.string().trim().min(1).max(160)).max(12),
  })).max(8),
  experiments: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(100),
    approach: z.string().trim().min(1).max(360),
    costLevel: z.enum(["low", "medium", "high"]),
    riskLevel: z.enum(["low", "medium", "high"]),
    tradeoff: z.string().trim().min(1).max(360),
    hypothesis: z.string().trim().min(1).max(800),
    channel: z.string().trim().min(1).max(80),
    assetType: z.string().trim().min(1).max(120),
    primaryMetric: z.string().trim().min(1).max(120),
    successThreshold: z.string().trim().min(1).max(300),
    stopCondition: z.string().trim().min(1).max(300),
    durationDays: z.number().int().min(1).max(90),
    productNames: z.array(z.string().trim().min(1).max(200)).max(20),
    evidenceIds: z.array(z.string().trim().min(1).max(160)).max(12),
  })).length(3),
  recommendedExperimentId: z.string().trim().min(1).max(80),
  assumptions: z.array(z.string().trim().min(1).max(600)).max(12),
  risks: z.array(z.string().trim().min(1).max(600)).max(12),
  reviewTriggers: z.array(z.string().trim().min(1).max(500)).max(12),
  informationRequests: z.array(StrategyInformationRequestSchema).max(12),
});

export const StrategistResultSchema = StrategistModelResultSchema.extend({
  strategyId: z.string().trim().min(1),
  createdAt: z.iso.datetime(),
  intelligenceSnapshotId: z.string().trim().min(1),
  brandMemoryUpdatedAt: z.iso.datetime(),
  horizon: StrategyHorizonSchema,
  objective: z.string().trim().min(1),
  nextReviewAt: z.iso.datetime(),
  executionPlan: StrategyExecutionPlanSchema,
});

export type StrategistPayload = z.infer<typeof StrategistPayloadSchema>;
export type StrategistResult = z.infer<typeof StrategistResultSchema>;
export type StrategistModelResult = z.infer<typeof StrategistModelResultSchema>;
export type StrategyExecutionPlan = z.infer<typeof StrategyExecutionPlanSchema>;
