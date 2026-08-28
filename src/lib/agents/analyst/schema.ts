import { z } from "zod";

export const AnalystModeSchema = z.enum(["performance", "market-research", "combined"]);

export const AnalystPayloadSchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  mode: AnalystModeSchema.default("performance"),
  objective: z.string().trim().min(1).max(2_000).optional(),
  topics: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  channels: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  productNames: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});

export const ResearchSourceSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(500),
  url: z.url(),
  publishedAt: z.iso.datetime().nullable().default(null),
  retrievedAt: z.iso.datetime(),
});

export const MarketSignalSchema = z.object({
  id: z.string().trim().min(1).max(100),
  finding: z.string().trim().min(1).max(1_000),
  implication: z.string().trim().min(1).max(1_000),
  sourceUrls: z.array(z.url()).min(1).max(6),
  observedAt: z.iso.datetime(),
  confidence: z.number().min(0).max(1),
});

export const PerformanceSignalSchema = z.object({
  channel: z.string().trim().min(1).max(80),
  metric: z.string().trim().min(1).max(100),
  value: z.number(),
  unit: z.string().trim().min(1).max(40),
  period: z.string().trim().min(1).max(100),
  comparison: z.number().nullable().default(null),
  sampleSize: z.number().int().nonnegative(),
  confidence: z.enum(["directional", "supported"]),
});

export const ResearchConnectorStatusSchema = z.object({
  source: z.enum([
    "google-grounded-search",
    "youtube-data",
    "meta-ad-library",
    "tiktok-creative-center",
    "google-trends",
  ]),
  status: z.enum(["active", "search-only", "unavailable", "skipped", "failed"]),
  detail: z.string().trim().min(1).max(500),
  checkedAt: z.iso.datetime(),
});

export const AnalystIntelligencePartsSchema = z.object({
  ownedPerformance: z.object({
    status: z.enum(["available", "missing"]),
    recordCount: z.number().int().nonnegative(),
    summary: z.string().trim().min(1).max(800),
  }),
  webAdvantageResearch: z.object({
    status: z.enum(["available", "partial", "unavailable"]),
    sourceCount: z.number().int().nonnegative(),
    summary: z.string().trim().min(1).max(1_200),
  }),
}).default({
  ownedPerformance: {
    status: "missing",
    recordCount: 0,
    summary: "No owned performance records were supplied.",
  },
  webAdvantageResearch: {
    status: "unavailable",
    sourceCount: 0,
    summary: "No current public research was supplied.",
  },
});

export const AnalystResultSchema = z.object({
  snapshotId: z.string().trim().min(1),
  mode: AnalystModeSchema,
  generatedAt: z.iso.datetime(),
  dataThrough: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  stats: z.array(z.object({ label: z.string(), value: z.number(), unit: z.string() })),
  performanceSignals: z.array(PerformanceSignalSchema),
  marketSignals: z.array(MarketSignalSchema),
  intelligenceParts: AnalystIntelligencePartsSchema,
  connectorStatus: z.array(ResearchConnectorStatusSchema).max(10).default([]),
  patterns: z.array(z.object({
    dimension: z.string(),
    condition: z.string(),
    outcome: z.string(),
    lift: z.number(),
    n: z.number().int().nonnegative(),
    confidence: z.enum(["directional", "supported"]),
  })),
  opportunities: z.array(z.string().trim().min(1).max(800)).max(12),
  risks: z.array(z.string().trim().min(1).max(800)).max(12),
  missingData: z.array(z.string().trim().min(1).max(800)).max(20),
  sources: z.array(ResearchSourceSchema).max(30),
  digest: z.string().trim().min(1).max(5_000),
});

export const AnalystResearchModelSchema = z.object({
  marketSignals: z.array(MarketSignalSchema).max(12),
  opportunities: z.array(z.string().trim().min(1).max(800)).max(12),
  risks: z.array(z.string().trim().min(1).max(800)).max(12),
  digest: z.string().trim().min(1).max(3_000),
});

export type AnalystPayload = z.infer<typeof AnalystPayloadSchema>;
export type AnalystResult = z.infer<typeof AnalystResultSchema>;
export type PerformanceSignal = z.infer<typeof PerformanceSignalSchema>;
