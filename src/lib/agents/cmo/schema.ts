import { z } from "zod";

export const CmoPayloadSchema = z.object({
  message: z.string().min(1).max(8_000),
  recentActivity: z.array(z.string()).max(20).default([]),
});

export const CmoResultSchema = z.object({
  reply: z.string(),
  intent: z.enum(["chat", "extract", "generate", "analyse", "clarify"]),
  delegations: z
    .array(z.enum(["brand-analyst", "copywriter", "analyst"]))
    .max(3),
});

export type CmoPayload = z.infer<typeof CmoPayloadSchema>;
export type CmoResult = z.infer<typeof CmoResultSchema>;
