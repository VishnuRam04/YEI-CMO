import { z } from "zod";

export const MAX_SOURCE_COUNT = 12;
export const MAX_INLINE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_TOTAL_FILE_BYTES = 20 * 1024 * 1024;

export const SourceAuthoritySchema = z.enum([
  "user-confirmed",
  "first-party",
  "official-public",
  "third-party",
]);

const sourceLabelSchema = z.string().trim().min(1).max(64);
const sourceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);

export const HttpUrlSchema = z
  .string()
  .trim()
  .transform((value) =>
    /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`,
  )
  .pipe(z.url())
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Only public HTTP or HTTPS URLs are supported.");

const commonSourceFields = {
  id: sourceIdSchema.optional(),
  label: sourceLabelSchema,
  title: z.string().trim().min(1).max(160).optional(),
  authority: SourceAuthoritySchema.optional(),
};

export const WebsiteSourceSchema = z.object({
  ...commonSourceFields,
  kind: z.literal("website"),
  url: HttpUrlSchema,
});

export const ProfileSourceSchema = z.object({
  ...commonSourceFields,
  kind: z.literal("profile"),
  url: HttpUrlSchema,
});

export const ReferenceSourceSchema = z.object({
  ...commonSourceFields,
  kind: z.literal("reference"),
  url: HttpUrlSchema,
});

export const TextSourceSchema = z.object({
  ...commonSourceFields,
  kind: z.literal("text"),
  content: z.string().trim().min(1).max(30_000),
});

const inlineDataSchema = z
  .string()
  .min(1)
  .max(Math.ceil((MAX_INLINE_FILE_BYTES * 4) / 3) + 256);

const imageMimeTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
]);

const documentMimeTypeSchema = z.enum([
  "application/pdf",
  "application/json",
  "application/rtf",
  "text/plain",
  "text/html",
  "text/csv",
  "text/markdown",
  "text/rtf",
  "text/xml",
]);

const requireOneFileLocation = (
  value: { data?: string; url?: string },
  context: z.RefinementCtx,
) => {
  if (Boolean(value.data) === Boolean(value.url)) {
    context.addIssue({
      code: "custom",
      message: "Provide exactly one of data or url.",
      path: ["data"],
    });
  }
};

export const ImageSourceSchema = z
  .object({
    ...commonSourceFields,
    kind: z.literal("image"),
    fileName: z.string().trim().min(1).max(255),
    mimeType: imageMimeTypeSchema,
    data: inlineDataSchema.optional(),
    url: HttpUrlSchema.optional(),
  })
  .superRefine(requireOneFileLocation);

export const DocumentSourceSchema = z
  .object({
    ...commonSourceFields,
    kind: z.literal("document"),
    fileName: z.string().trim().min(1).max(255),
    mimeType: documentMimeTypeSchema,
    data: inlineDataSchema.optional(),
    url: HttpUrlSchema.optional(),
  })
  .superRefine(requireOneFileLocation);

export const BrandSourceInputSchema = z.union([
  WebsiteSourceSchema,
  ProfileSourceSchema,
  ReferenceSourceSchema,
  TextSourceSchema,
  ImageSourceSchema,
  DocumentSourceSchema,
]);

export const BrandContextSchema = z.object({
  industry: z.string().trim().min(1).max(160).optional(),
  markets: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  priorities: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  audiences: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  competitors: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  requiredWords: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  bannedWords: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  disclaimers: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  notes: z.string().trim().min(1).max(10_000).optional(),
});

const hasContext = (context: z.infer<typeof BrandContextSchema> | undefined) =>
  Boolean(
    context &&
      (context.industry ||
        context.notes ||
        context.markets.length ||
        context.priorities.length ||
        context.audiences.length ||
        context.competitors.length ||
        context.requiredWords.length ||
        context.bannedWords.length ||
        context.disclaimers.length),
  );

const rawPayloadSchema = z
  .object({
    companyName: z.string().trim().min(1).max(160).optional(),
    url: HttpUrlSchema.optional(),
    sources: z.array(BrandSourceInputSchema).max(MAX_SOURCE_COUNT).default([]),
    context: BrandContextSchema.optional(),
    forceRefresh: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (!value.url && value.sources.length === 0 && !hasContext(value.context)) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one URL, source, upload, or structured context.",
        path: ["sources"],
      });
    }
    if (
      value.url &&
      value.sources.length === MAX_SOURCE_COUNT &&
      !value.sources.some(
        (source) => source.kind === "website" && source.url === value.url,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: `At most ${MAX_SOURCE_COUNT} total sources are supported.`,
        path: ["sources"],
      });
    }
  });

export const BrandAnalystPayloadSchema = rawPayloadSchema.transform((value) => {
  const sources = [...value.sources];

  if (
    value.url &&
    !sources.some(
      (source) => source.kind === "website" && source.url === value.url,
    )
  ) {
    sources.unshift({
      kind: "website" as const,
      url: value.url,
      label: "official-website",
      authority: "official-public" as const,
    });
  }

  return { ...value, sources };
});

const icpSchema = z.object({
  name: z.string().trim().min(1),
  needs: z.array(z.string().trim().min(1)).min(1),
});

export const BrandKernelSchema = z.object({
  positioning: z.string().trim().min(1),
  category: z.string().trim().min(1),
  icps: z.array(icpSchema).min(2).max(3),
  differentiators: z.array(z.string().trim().min(1)).length(3),
  objections: z
    .array(
      z.object({
        objection: z.string().trim().min(1),
        rebuttal: z.string().trim().min(1),
      }),
    )
    .length(3),
  proofPoints: z.array(z.string().trim().min(1)),
  competitors: z.array(z.string().trim().min(1)),
});

export const BrandVoiceSchema = z.object({
  toneAxes: z.record(z.string(), z.number().int().min(1).max(5)),
  do: z.array(z.string().trim().min(1)),
  dont: z.array(z.string().trim().min(1)),
  bannedWords: z.array(z.string().trim().min(1)),
  exemplars: z.array(z.string().trim().min(1)).min(5).max(10),
});

export const VisualIdentitySchema = z.object({
  logo: z
    .object({
      sourceId: sourceIdSchema,
      type: z.enum(["symbol", "wordmark", "combination", "unknown"]),
      visibleText: z.array(z.string().trim().min(1)),
      tagline: z.string().trim().min(1).optional(),
    })
    .nullable(),
  colors: z.array(
    z.object({
      hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      role: z.enum(["primary", "secondary", "accent", "unknown"]),
      sourceId: sourceIdSchema,
      confidence: z.number().min(0).max(1),
    }),
  ),
  typographyCharacteristics: z.array(z.string().trim().min(1)),
  motifs: z.array(z.string().trim().min(1)),
  usageNotes: z.array(z.string().trim().min(1)),
});

export const EvidenceItemSchema = z.object({
  field: z.string().trim().min(1).max(160),
  sourceId: sourceIdSchema,
  excerptOrObservation: z.string().trim().min(1).max(600),
  location: z.string().trim().min(1).max(300).optional(),
  confidence: z.number().min(0).max(1),
});

export const ConflictSchema = z.object({
  field: z.string().trim().min(1).max(160),
  options: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(1_000),
        sourceIds: z.array(sourceIdSchema).min(1),
      }),
    )
    .min(2),
  question: z.string().trim().min(1).max(500),
});

export const BrandAnalystModelResultSchema = z.object({
  brandName: z.string().trim().min(1).max(160),
  kernel: BrandKernelSchema,
  voice: BrandVoiceSchema,
  visualIdentity: VisualIdentitySchema,
  evidence: z.array(EvidenceItemSchema).min(1),
  conflicts: z.array(ConflictSchema),
  missingInformation: z.array(z.string().trim().min(1).max(500)),
});

export const SourceReportSchema = z.object({
  id: sourceIdSchema,
  kind: z.enum([
    "website",
    "document",
    "image",
    "text",
    "profile",
    "reference",
  ]),
  label: sourceLabelSchema,
  title: z.string().trim().min(1).max(300),
  status: z.enum(["processed", "partial", "failed"]),
  warnings: z.array(z.string()),
});

export const BrandAnalystResultSchema = BrandAnalystModelResultSchema.extend({
  crawledUrls: z.array(HttpUrlSchema),
  sources: z.array(SourceReportSchema).min(1),
});

export type BrandSourceInput = z.infer<typeof BrandSourceInputSchema>;
export type BrandAnalystPayload = z.infer<typeof BrandAnalystPayloadSchema>;
export type BrandAnalystModelResult = z.infer<
  typeof BrandAnalystModelResultSchema
>;
export type BrandAnalystResult = z.infer<typeof BrandAnalystResultSchema>;
export type SourceAuthority = z.infer<typeof SourceAuthoritySchema>;
export type SourceReport = z.infer<typeof SourceReportSchema>;
