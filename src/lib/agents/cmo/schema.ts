import { z } from "zod";

export const CmoPayloadSchema = z.object({
  message: z.string().min(1).max(8_000),
  conversationId: z.string().min(1).optional(),
  // Kept for backwards compatibility. Durable history is loaded server-side.
  recentActivity: z.array(z.string()).max(20).default([]),
});

export const CmoClarificationSchema = z.object({
  id: z.string().min(1).max(64),
  field: z.string().min(1).max(160),
  severity: z.enum(["blocking", "review", "optional"]),
  resolution: z.enum(["ask-user", "choose-conflict", "upload-catalogue"]),
  reason: z.string().min(1).max(800),
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(300)).max(8).default([]),
  affects: z.array(z.string().min(1).max(160)).max(10).default([]),
  resumeInstruction: z.string().min(1).max(8_000),
});

export const CmoOptionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(100),
  summary: z.string().trim().min(1).max(360),
  cost: z.enum(["low", "medium", "high"]),
  risk: z.enum(["low", "medium", "high"]),
});

const CmoOptionsSchema = z.array(CmoOptionSchema).max(3)
  .refine((options) => options.length === 0 || options.length === 3, {
    message: "Provide either no options or exactly three options.",
  })
  .default([]);

export const CmoExecutionPlanSchema = z.object({
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

export const CmoResponseSchema = z.object({
  title: z.string().min(1).max(80),
  executiveSummary: z.string().min(1).max(1_200),
  verdict: z.enum(["strong", "promising", "needs-work", "not-recommended"])
    .optional(),
  keyPoints: z.array(z.string().min(1).max(500)).max(3).default([]),
  // A response either makes no recommendation or gives a real set of three.
  // One- and two-option pseudo-choices are rejected by the contract.
  options: CmoOptionsSchema,
  recommendedOptionId: z.string().trim().min(1).max(80).optional(),
  executionPlan: CmoExecutionPlanSchema.optional(),
  // Kept for backwards compatibility with stored responses. New responses use
  // verdict + options and the chat no longer renders a recommendation block.
  recommendation: z.string().max(800).default(""),
  nextStep: z.string().min(1).max(500),
  clarification: CmoClarificationSchema.nullable().optional(),
});

const CmoModelResponseSchema = CmoResponseSchema.omit({ clarification: true });

export const CmoResultSchema = z.object({
  reply: z.string(),
  response: CmoResponseSchema,
  conversationId: z.string().min(1),
  presentation: z.enum(["conversation", "brief"]),
  intent: z.enum(["chat", "extract", "generate", "analyse", "strategize", "review-campaign", "clarify"]),
  delegations: z
    .array(z.enum(["brand-analyst", "copywriter", "analyst", "strategist", "campaign-critic"]))
    .max(3),
});

export const CmoDecisionSchema = z.object({
  intent: z.enum(["chat", "extract", "generate", "analyse", "strategize", "review-campaign", "clarify"]),
  response: CmoModelResponseSchema,
  delegations: z
    .array(
      z.object({
        agentId: z.enum(["brand-analyst", "copywriter", "analyst", "strategist", "campaign-critic"]),
        instruction: z.string().min(1),
        url: z.string(),
        channel: z.enum(["linkedin", "instagram", "email", "none"]),
        from: z.string(),
        to: z.string(),
        products: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
        topics: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
        horizon: z.enum(["sprint", "quarter"]).default("sprint"),
        campaignId: z.string().trim().max(160).default(""),
        reviewMode: z.enum(["preflight", "postflight"]).default("preflight"),
      }),
    )
    .max(10),
});

export const CmoSynthesisSchema = z.object({
  response: CmoModelResponseSchema,
});

export type CmoPayload = z.infer<typeof CmoPayloadSchema>;
export type CmoResult = z.infer<typeof CmoResultSchema>;
export type CmoDecision = z.infer<typeof CmoDecisionSchema>;
export type CmoResponse = z.infer<typeof CmoResponseSchema>;
export type CmoClarification = z.infer<typeof CmoClarificationSchema>;

export const CmoStoredMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  presentation: z.enum(["conversation", "brief"]),
  response: CmoResponseSchema.nullable(),
  delegations: z.array(z.string()),
  createdAt: z.string(),
});

export type CmoStoredMessage = z.infer<typeof CmoStoredMessageSchema>;
