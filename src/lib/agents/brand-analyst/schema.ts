import { z } from "zod";

export const BrandAnalystPayloadSchema = z.object({
  url: z.url(),
  forceRefresh: z.boolean().default(false),
});

const icpSchema = z.object({
  name: z.string(),
  needs: z.array(z.string()),
});

export const BrandAnalystResultSchema = z.object({
  kernel: z.object({
    positioning: z.string(),
    category: z.string(),
    icps: z.array(icpSchema).min(2).max(3),
    differentiators: z.array(z.string()).length(3),
    objections: z
      .array(z.object({ objection: z.string(), rebuttal: z.string() }))
      .length(3),
    proofPoints: z.array(z.string()),
    competitors: z.array(z.string()),
  }),
  voice: z.object({
    toneAxes: z.record(z.string(), z.number().int().min(1).max(5)),
    do: z.array(z.string()),
    dont: z.array(z.string()),
    bannedWords: z.array(z.string()),
    exemplars: z.array(z.string()).min(5).max(10),
  }),
  crawledUrls: z.array(z.url()),
});

export type BrandAnalystPayload = z.infer<typeof BrandAnalystPayloadSchema>;
export type BrandAnalystResult = z.infer<typeof BrandAnalystResultSchema>;
