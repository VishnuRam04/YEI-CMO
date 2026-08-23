import { z } from "zod";

export const AnalystPayloadSchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});

export const AnalystResultSchema = z.object({
  stats: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      unit: z.string(),
    }),
  ),
  patterns: z.array(
    z.object({
      dimension: z.string(),
      condition: z.string(),
      outcome: z.string(),
      lift: z.number(),
      n: z.number().int().nonnegative(),
      confidence: z.enum(["directional", "supported"]),
    }),
  ),
  digest: z.string(),
});

export type AnalystPayload = z.infer<typeof AnalystPayloadSchema>;
export type AnalystResult = z.infer<typeof AnalystResultSchema>;
