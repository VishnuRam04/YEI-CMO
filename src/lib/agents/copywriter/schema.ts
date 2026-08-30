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

export interface PosterCopyPayload {
  headline: string;
  supportingLines?: string[];
  callToAction: string;
  /** Two or three icon-able phrases that carry the infographic. */
  highlights?: string[];
}

/**
 * Poster wording is written, not sliced. A caption sentence makes a poor
 * headline, and character-truncating one mid-word puts an ellipsis into the
 * artwork. Word limits are enforced here so a long line fails validation and
 * is regenerated rather than being cut.
 */
export const PosterCopySchema = z.object({
  headline: z.string().trim().min(1).max(64)
    .refine((value) => value.split(/\s+/).length <= 8, "Use at most eight words."),
  subheadline: z.string().trim().min(1).max(96)
    .refine((value) => value.split(/\s+/).length <= 12, "Use at most twelve words."),
  highlights: z.array(
    z.string().trim().min(1).max(40)
      .refine((value) => value.split(/\s+/).length <= 5, "Use at most five words."),
  ).min(2).max(3),
  callToAction: z.string().trim().min(1).max(48)
    .refine((value) => value.split(/\s+/).length <= 6, "Use at most six words."),
});

export type PosterCopyModelOutput = z.infer<typeof PosterCopySchema>;

export interface ImageGenerationPayload {
  mode: "image";
  briefText: string;
  tier?: ImageTier;
  referenceImageUrls?: string[];
  /** Present when the image must be a poster carrying this approved wording. */
  poster?: PosterCopyPayload;
  /** Approved caption the poster copy should be written from. */
  posterSource?: string;
}

export interface ScriptGenerationPayload {
  mode: "script";
  brief: string;
  /** Roughly how long the finished video should run. */
  durationSeconds?: number;
}

export type CopywriterPayload =
  | TextGenerationPayload
  | ImageGenerationPayload
  | ScriptGenerationPayload;

/**
 * A shot list someone can actually film on a phone. Lines are what is said or
 * shown, so they must obey the same claim rules as a caption.
 */
export const ScriptSchema = z.object({
  hook: z.string().trim().min(1).max(160),
  scenes: z.array(z.object({
    seconds: z.number().int().min(1).max(60),
    shot: z.string().trim().min(1).max(200),
    action: z.string().trim().min(1).max(300),
    saidOrShown: z.string().trim().min(1).max(300),
  })).min(2).max(8),
  callToAction: z.string().trim().min(1).max(160),
  shoppingList: z.array(z.string().trim().min(1).max(120)).max(8),
});

export type ScriptModelOutput = z.infer<typeof ScriptSchema>;

export interface ScriptGenerationResult extends ScriptModelOutput {
  kind: "script";
  totalSeconds: number;
  brandAudit?: BrandAuditReport[];
}

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
  poster: z
    .object({
      headline: z.string().trim().min(1).max(160),
      supportingLines: z.array(z.string().trim().min(1).max(200)).max(4).default([]),
      callToAction: z.string().trim().min(1).max(120),
      highlights: z.array(z.string().trim().min(1).max(60)).max(3).default([]),
    })
    .optional(),
  /** Approved caption the poster copy should be written from. */
  posterSource: z.string().trim().min(1).max(4_000).optional(),
});

const scriptPayloadSchema = z.object({
  mode: z.literal("script"),
  brief: z.string().trim().min(1).max(8_000),
  durationSeconds: z.number().int().min(10).max(180).default(30),
});

export const CopywriterPayloadSchema: z.ZodType<CopywriterPayload> =
  z.discriminatedUnion("mode", [
    textPayloadSchema.extend({ mode: z.literal("text") }),
    imagePayloadSchema,
    scriptPayloadSchema,
  ]).or(textPayloadSchema);

export interface TextVariant extends z.infer<typeof VariantSchema> {
  channel: Channel;
  usedKernel: boolean;
}

export interface BrandAuditCriterion {
  criterion: string;
  score: number;
  passed: boolean;
  reasons: string[];
}

export interface BrandAuditReport {
  angle: string;
  passed: boolean;
  overallScore: number;
  criteria: BrandAuditCriterion[];
  notes: string[];
}

export interface TextGenerationResult {
  kind: "text";
  variants: TextVariant[];
  brandAudit?: BrandAuditReport[];
}

export interface ImageGenerationResult {
  kind: "image";
  imageUrl: string;
  mimeType: string;
  tier: ImageTier;
  /** The Brand Judge's verdict on the wording set into the poster. */
  brandAudit?: BrandAuditReport[];
}

export type CopywriterResult =
  | TextGenerationResult
  | ImageGenerationResult
  | ScriptGenerationResult;

export function isScriptPayload(
  payload: CopywriterPayload,
): payload is ScriptGenerationPayload {
  return payload.mode === "script";
}

export function isTextPayload(
  payload: CopywriterPayload,
): payload is TextGenerationPayload {
  return payload.mode !== "image" && payload.mode !== "script";
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
