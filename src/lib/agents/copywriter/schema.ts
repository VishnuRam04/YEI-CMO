import { z } from "zod";

export const CHANNELS = ["linkedin", "instagram", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

export const ANGLES = ["pain-led", "proof-led", "contrarian"] as const;
export type Angle = (typeof ANGLES)[number];

export const IMAGE_TIERS = ["draft", "default", "hero"] as const;
export type ImageTier = (typeof IMAGE_TIERS)[number];

export const CHANNEL_CONSTRAINTS: Record<
  Channel,
  {
    maxChars: number;
    targetChars: string;
    hashtags: boolean;
    hasSubject: boolean;
    notes: string;
  }
> = {
  linkedin: {
    maxChars: 3_000,
    targetChars: "500-900",
    hashtags: true,
    hasSubject: false,
    notes: 'Put the hook before the "see more" cutoff. Use 3-5 hashtags at the end.',
  },
  instagram: {
    maxChars: 2_200,
    targetChars: "400-800",
    hashtags: true,
    hasSubject: false,
    notes: "Lead with a strong first line. Use 5-10 relevant hashtags at the end.",
  },
  email: {
    maxChars: 1_200,
    targetChars: "250-600",
    hashtags: false,
    hasSubject: true,
    notes: "Include a subject of at most 60 characters and preheader of at most 90.",
  },
};

export const VariantSchema = z.object({
  angle: z.enum(ANGLES),
  body: z.string().trim().min(1).max(3_000),
  subject: z.string().trim().min(1).max(60).optional(),
  preheader: z.string().trim().min(1).max(90).optional(),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
});

export const VariantsSchema = z
  .object({ variants: z.array(VariantSchema).length(3) })
  .superRefine((value, context) => {
    const angles = new Set(value.variants.map((variant) => variant.angle));
    if (angles.size !== ANGLES.length) {
      context.addIssue({
        code: "custom",
        message: "Return one pain-led, one proof-led, and one contrarian variant.",
        path: ["variants"],
      });
    }
  });

export type VariantsModelOutput = z.infer<typeof VariantsSchema>;

export interface RefineInstruction {
  instruction: string;
  priorText: string;
}

/** `mode` stays optional so existing CMO delegation payloads remain compatible. */
export interface TextGenerationPayload {
  mode?: "text";
  channel: Channel;
  brief: string;
  usedKernel?: boolean;
  refine?: RefineInstruction;
  refinement?: string;
  priorText?: string;
}

export interface ImageGenerationPayload {
  mode: "image";
  briefText: string;
  tier?: ImageTier;
  referenceImageUrls?: string[];
}

export type CopywriterPayload = TextGenerationPayload | ImageGenerationPayload;

const textPayloadSchema = z.object({
  mode: z.literal("text").optional(),
  channel: z.enum(CHANNELS),
  brief: z.string().trim().min(1).max(8_000),
  usedKernel: z.boolean().default(true),
  refine: z
    .object({
      instruction: z.string().trim().min(1).max(2_000),
      priorText: z.string().trim().min(1).max(20_000),
    })
    .optional(),
  refinement: z.string().trim().min(1).max(2_000).optional(),
  priorText: z.string().trim().min(1).max(20_000).optional(),
});

const imagePayloadSchema = z.object({
  mode: z.literal("image"),
  briefText: z.string().trim().min(1).max(8_000),
  tier: z.enum(IMAGE_TIERS).default("default"),
  referenceImageUrls: z
    .array(z.url().refine((url) => ["http:", "https:"].includes(new URL(url).protocol)))
    .max(10)
    .default([]),
});

export const CopywriterPayloadSchema: z.ZodType<CopywriterPayload> =
  z.discriminatedUnion("mode", [
    textPayloadSchema.extend({ mode: z.literal("text") }),
    imagePayloadSchema,
  ]).or(textPayloadSchema);

export interface TextVariant extends z.infer<typeof VariantSchema> {
  channel: Channel;
  usedKernel: boolean;
}

export interface TextGenerationResult {
  kind: "text";
  variants: TextVariant[];
}

export interface ImageGenerationResult {
  kind: "image";
  imageUrl: string;
  mimeType: string;
  tier: ImageTier;
}

export type CopywriterResult = TextGenerationResult | ImageGenerationResult;

export function isTextPayload(
  payload: CopywriterPayload,
): payload is TextGenerationPayload {
  return payload.mode !== "image";
}

export function isImagePayload(
  payload: CopywriterPayload,
): payload is ImageGenerationPayload {
  return payload.mode === "image";
}

export function refinementFor(
  payload: TextGenerationPayload,
): RefineInstruction | undefined {
  if (payload.refine) return payload.refine;
  if (payload.refinement && payload.priorText) {
    return { instruction: payload.refinement, priorText: payload.priorText };
  }
  return undefined;
}
