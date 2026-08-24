import { z } from 'zod';

export const CHANNELS = ['linkedin', 'instagram', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];

export const ANGLES = ['pain-led', 'proof-led', 'contrarian'] as const;
export type Angle = (typeof ANGLES)[number];

export const IMAGE_TIERS = ['draft', 'default', 'hero'] as const;
export type ImageTier = (typeof IMAGE_TIERS)[number];


export const CHANNEL_CONSTRAINTS: Record<
  Channel,
  { maxChars: number; hashtags: boolean; hasSubject: boolean; notes: string }
> = {
  linkedin: {
    maxChars: 3000,
    hashtags: true,
    hasSubject: false,
    notes: 'Hook in the first line (pre-"see more" cutoff, ~210 chars). 3-5 hashtags max, placed at the end.',
  },
  instagram: {
    maxChars: 2200,
    hashtags: true,
    hasSubject: false,
    notes: 'Caption only (no image generation logic here — see mode "image"). Hook first line. Hashtags: 5-10, end of caption.',
  },
  email: {
    maxChars: 1200,
    hashtags: false,
    hasSubject: true,
    notes: 'Requires subject (<= 60 chars) and preheader (<= 90 chars) in addition to body.',
  },
};

export const VariantSchema = z.object({
  angle: z.enum(ANGLES),
  body: z.string().min(1),
  subject: z.string().max(60).optional(),
  preheader: z.string().max(90).optional(),
  hashtags: z.array(z.string()).optional(),
});

export const VariantsSchema = z.object({
  variants: z.array(VariantSchema).length(3),
});

export type VariantsModelOutput = z.infer<typeof VariantsSchema>;

export interface RefineInstruction {
  instruction: string; // e.g. "shorter", "less salesy"
  priorText: string;
}

export interface TextGenerationPayload {
  mode: 'text';
  channel: Channel;
  brief: string;
  /** Defaults to true. Set false only for the /proof no-brand comparison. */
  usedKernel?: boolean;
  refine?: RefineInstruction;
}

export interface ImageGenerationPayload {
  mode: 'image';
  briefText: string;
  tier?: ImageTier; // defaults to 'default' -> gemini-3.1-flash-image
  /** Brand logo / product shots passed as multimodal reference input. */
  referenceImageUrls?: string[];
}

export type CopywriterPayload = TextGenerationPayload | ImageGenerationPayload;

export const CopywriterPayloadSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('text'),
    channel: z.enum(CHANNELS),
    brief: z.string().min(1),
    usedKernel: z.boolean().optional(),
    refine: z.object({
      instruction: z.string().min(1),
      priorText: z.string().min(1),
    }).optional(),
  }),
  z.object({
    mode: z.literal('image'),
    briefText: z.string().min(1),
    tier: z.enum(IMAGE_TIERS).optional(),
    referenceImageUrls: z.array(z.string().url()).optional(),
  }),
]);

export interface TextVariant {
  angle: Angle;
  channel: Channel;
  body: string;
  subject?: string;
  preheader?: string;
  hashtags?: string[];
  usedKernel: boolean;
}

export interface TextGenerationResult {
  kind: 'text';
  variants: TextVariant[];
}

export interface ImageGenerationResult {
  kind: 'image';
  imageUrl: string;
  mimeType: string;
  tier: ImageTier;
}

export type CopywriterResult = TextGenerationResult | ImageGenerationResult;

// Narrowing helpers for index.ts
export function isTextPayload(p: CopywriterPayload): p is TextGenerationPayload {
  return p.mode === 'text';
}
export function isImagePayload(p: CopywriterPayload): p is ImageGenerationPayload {
  return p.mode === 'image';
}