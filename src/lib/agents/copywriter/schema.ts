import { z } from "zod";

export const ChannelSchema = z.enum(["linkedin", "instagram", "email"]);
export const AngleSchema = z.enum(["pain-led", "proof-led", "contrarian"]);

export const CopywriterPayloadSchema = z.object({
  channel: ChannelSchema,
  brief: z.string().min(1).max(8_000),
  refinement: z.string().max(2_000).optional(),
  priorText: z.string().max(20_000).optional(),
  usedKernel: z.boolean().default(true),
});

export const CopywriterResultSchema = z.object({
  variants: z
    .array(
      z.object({
        angle: AngleSchema,
        body: z.string(),
        subject: z.string().optional(),
        preheader: z.string().optional(),
      }),
    )
    .length(3),
  usedKernel: z.boolean(),
});

export type CopywriterPayload = z.infer<typeof CopywriterPayloadSchema>;
export type CopywriterResult = z.infer<typeof CopywriterResultSchema>;
