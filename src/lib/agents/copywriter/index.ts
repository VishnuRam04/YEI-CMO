import { put } from "@vercel/blob";
import { generateText, NoObjectGeneratedError, Output, streamText } from "ai";
import { getDb } from "@/lib/db";
import { MODELS, model } from "@/lib/agents/models";
import { agentFailure, agentSuccess } from "@/lib/agents/output";
import type { Agent, AgentInput, AgentOutput } from "@/lib/agents/types";
import { buildImagePrompt, buildSystemPrompt, buildUserPrompt } from "./prompt";
import {
  CHANNEL_CONSTRAINTS,
  VariantsSchema,
  isImagePayload,
  isTextPayload,
  type CopywriterPayload,
  type CopywriterResult,
  type ImageGenerationPayload,
  type TextGenerationPayload,
  type TextVariant,
} from "./schema";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function brandMemory(brand: { name: string; kernel: unknown; voice: unknown }) {
  const storedKernel = record(brand.kernel);
  const storedVoice = record(brand.voice);
  const visualIdentity = record(storedKernel.visualIdentity);
  const storedPricing = record(storedKernel.pricingPosture);
  const storedFounder = record(storedKernel.founderStory);
  const storedClaims = record(storedKernel.regulatedClaims);
  const storedProvenance = record(storedKernel.provenance);
  const storedCatalogues = Array.isArray(storedKernel.productCatalogues)
    ? storedKernel.productCatalogues
    : [];
  const colors = Array.isArray(visualIdentity.colors)
    ? visualIdentity.colors
        .map((value) => text(record(value).hex, ""))
        .filter(Boolean)
    : [];
  const styleParts = [
    ...strings(visualIdentity.fontFamilies),
    ...strings(visualIdentity.motifs),
    ...strings(visualIdentity.typographyCharacteristics),
    ...strings(visualIdentity.usageNotes),
  ];

  return {
    kernel: {
      name: brand.name,
      positioning: text(
        storedKernel.positioning,
        "No approved positioning statement is available.",
      ),
      category: text(storedKernel.category, ""),
      icps: Array.isArray(storedKernel.icps)
        ? storedKernel.icps.flatMap((value) => {
            const item = record(value);
            const name = text(item.name, "");
            return name ? [{ name, needs: strings(item.needs) }] : [];
          })
        : [],
      differentiators: strings(storedKernel.differentiators),
      proofPoints: strings(storedKernel.proofPoints),
      pricingPosture: storedKernel.pricingPosture
        ? {
            position: text(storedPricing.position, "unknown"),
            summary: text(storedPricing.summary, ""),
            signals: strings(storedPricing.signals),
            priceObjectionGuidance: text(
              storedPricing.priceObjectionGuidance,
              "",
            ),
          }
        : null,
      founderStory: storedKernel.founderStory
        ? {
            founders: strings(storedFounder.founders),
            foundingYear: text(storedFounder.foundingYear, ""),
            originSummary: text(storedFounder.originSummary, ""),
            foundingMotivation: text(storedFounder.foundingMotivation, ""),
            milestones: strings(storedFounder.milestones),
          }
        : null,
      regulatedClaims: storedKernel.regulatedClaims
        ? {
            status: text(storedClaims.status, "unknown"),
            domains: strings(storedClaims.domains),
            needsClaimsReview:
              typeof storedClaims.needsClaimsReview === "boolean"
                ? storedClaims.needsClaimsReview
                : true,
            rationale: text(storedClaims.rationale, ""),
            substantiationRequirements: strings(
              storedClaims.substantiationRequirements,
            ),
          }
        : null,
      productCatalogues: storedCatalogues.slice(0, 12).map((value) => {
        const catalogue = record(value);
        return {
          fileName: text(catalogue.fileName, "Product catalogue"),
          products: Array.isArray(catalogue.products)
            ? catalogue.products.slice(0, 1_000).flatMap((productValue) => {
                const product = record(productValue);
                const name = text(product.name, "");
                return name
                  ? [{
                      name,
                      sku: text(product.sku, "") || null,
                      category: text(product.category, "") || null,
                      description: text(product.description, "") || null,
                      price: nullableNumber(product.price),
                      currency: text(product.currency, "") || null,
                      compareAtPrice: nullableNumber(product.compareAtPrice),
                      availability: text(product.availability, "") || null,
                    }]
                  : [];
              })
            : [],
        };
      }),
      confirmedInformation: Array.isArray(storedProvenance.confirmedInformation)
        ? storedProvenance.confirmedInformation.slice(-20).flatMap((value) => {
            const item = record(value);
            const field = text(item.field, "");
            const confirmedValue = text(item.value, "");
            return field && confirmedValue
              ? [{ field, value: confirmedValue }]
              : [];
          })
        : [],
    },
    voice: {
      toneAxes: Object.fromEntries(
        Object.entries(record(storedVoice.toneAxes)).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      ),
      do: strings(storedVoice.do),
      dont: strings(storedVoice.dont),
      bannedWords: strings(storedVoice.bannedWords),
      exemplars: strings(storedVoice.exemplars),
    },
    visualKit: {
      palette: colors.length ? colors : ["No confirmed palette"],
      styleFragment: styleParts.length
        ? styleParts.join("; ")
        : "No confirmed visual style; keep the composition clean and restrained.",
      logoSafeArea:
        strings(visualIdentity.usageNotes).join("; ") ||
        "No confirmed logo safe-area rule; do not fabricate or redraw a logo.",
    },
  };
}

function validateForChannel(
  payload: TextGenerationPayload,
  variants: TextVariant[],
  bannedWords: string[],
): string | undefined {
  const constraints = CHANNEL_CONSTRAINTS[payload.channel];
  for (const variant of variants) {
    if (variant.body.length > constraints.maxChars) {
      return `${variant.angle} exceeds the ${constraints.maxChars}-character ${payload.channel} limit.`;
    }
    if (payload.channel === "email" && (!variant.subject || !variant.preheader)) {
      return `${variant.angle} is missing the required email subject or preheader.`;
    }
    const completeCopy = [variant.subject, variant.preheader, variant.body]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    const bannedWord = bannedWords.find((word) =>
      completeCopy.includes(word.toLocaleLowerCase()),
    );
    if (bannedWord) {
      return `${variant.angle} contains banned language: ${bannedWord}.`;
    }
  }
  return undefined;
}

function persistedText(variant: TextVariant): string {
  const metadata = [
    variant.subject ? `Subject: ${variant.subject}` : "",
    variant.preheader ? `Preheader: ${variant.preheader}` : "",
  ].filter(Boolean);
  const hashtags = variant.hashtags?.length ? `\n\n${variant.hashtags.join(" ")}` : "";
  return `${metadata.length ? `${metadata.join("\n")}\n\n` : ""}${variant.body}${hashtags}`;
}

async function runTextGeneration(
  input: AgentInput<CopywriterPayload>,
  payload: TextGenerationPayload,
): Promise<AgentOutput<CopywriterResult>> {
  const brand = await getDb().brand.findUnique({
    where: { id: input.brandId },
    select: { name: true, kernel: true, voice: true },
  });
  if (!brand) {
    return agentFailure({
      agentId: "copywriter",
      traceId: input.traceId,
      model: MODELS.copywriter,
      summary: "Brand memory not found",
      error: {
        code: "INPUT_ERROR",
        message: "Build brand memory before generating copy.",
        retryable: false,
      },
    });
  }

  const memory = brandMemory(brand);
  const usedKernel = payload.usedKernel ?? true;
  const generation = streamText({
    model: model(MODELS.copywriter),
    instructions: buildSystemPrompt(memory.kernel, memory.voice, usedKernel),
    prompt: buildUserPrompt(payload),
    output: Output.object({ schema: VariantsSchema }),
    temperature: 0.7,
    maxOutputTokens: 3_000,
    maxRetries: 1,
    timeout: { totalMs: 18_000, firstChunkMs: 12_000, chunkMs: 8_000 },
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: "low" } },
    },
  });

  let object;
  let usage;
  try {
    [object, usage] = await Promise.all([generation.output, generation.usage]);
  } catch (error) {
    return agentFailure({
      agentId: "copywriter",
      traceId: input.traceId,
      model: MODELS.copywriter,
      summary: "Copy validation failed",
      error: {
        code: NoObjectGeneratedError.isInstance(error)
          ? "VALIDATION_ERROR"
          : "MODEL_ERROR",
        message: NoObjectGeneratedError.isInstance(error)
          ? "Gemini returned copy in an unexpected format. Please retry."
          : "Gemini could not generate copy. Please retry.",
        detail: error instanceof Error ? error.message : String(error),
        retryable: true,
      },
    });
  }

  const parsed = VariantsSchema.safeParse(object);
  if (!parsed.success) {
    return agentFailure({
      agentId: "copywriter",
      traceId: input.traceId,
      model: MODELS.copywriter,
      summary: "Copy validation failed",
      error: {
        code: "VALIDATION_ERROR",
        message: "Gemini returned copy in an unexpected format. Please retry.",
        detail: parsed.error.message,
        retryable: true,
      },
    });
  }

  const variants: TextVariant[] = parsed.data.variants.map((variant) => ({
    ...variant,
    body: variant.body.replace(/\s+(?:#[\p{L}\p{N}_-]+\s*)+$/u, "").trim(),
    channel: payload.channel,
    hashtags:
      payload.channel === "email"
        ? undefined
        : variant.hashtags?.map((hashtag) =>
            hashtag.startsWith("#") ? hashtag : `#${hashtag}`,
          ),
    usedKernel,
  }));
  const channelError = validateForChannel(
    payload,
    variants,
    memory.voice.bannedWords,
  );
  if (channelError) {
    return agentFailure({
      agentId: "copywriter",
      traceId: input.traceId,
      model: MODELS.copywriter,
      summary: "Channel validation failed",
      error: {
        code: "VALIDATION_ERROR",
        message: channelError,
        retryable: true,
      },
    });
  }

  await getDb().asset.createMany({
    data: variants.map((variant) => ({
      brandId: input.brandId,
      channel: variant.channel,
      angle: variant.angle,
      body: persistedText(variant),
      usedKernel: variant.usedKernel,
    })),
  });

  return agentSuccess({
    agentId: "copywriter",
    traceId: input.traceId,
    model: MODELS.copywriter,
    result: { kind: "text", variants },
    summary: `3 variants - ${variants.map((variant) => variant.angle).join("/")}`,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  });
}

const IMAGE_MODEL_BY_TIER = {
  draft: "gemini-3.1-flash-lite-image",
  default: MODELS.copywriterImage,
  hero: "gemini-3-pro-image",
} as const;

function imageExtension(mediaType: string): string {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}

async function runImageGeneration(
  input: AgentInput<CopywriterPayload>,
  payload: ImageGenerationPayload,
): Promise<AgentOutput<CopywriterResult>> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return agentFailure({
      agentId: "copywriter",
      traceId: input.traceId,
      model: MODELS.copywriter,
      summary: "Image storage is not configured",
      error: {
        code: "INPUT_ERROR",
        message: "Set BLOB_READ_WRITE_TOKEN before generating images.",
        retryable: false,
      },
    });
  }

  const brand = await getDb().brand.findUnique({
    where: { id: input.brandId },
    select: { name: true, kernel: true, voice: true },
  });
  if (!brand) {
    return agentFailure({
      agentId: "copywriter",
      traceId: input.traceId,
      model: MODELS.copywriter,
      summary: "Brand memory not found",
      error: {
        code: "INPUT_ERROR",
        message: "Build brand memory before generating an image.",
        retryable: false,
      },
    });
  }

  const memory = brandMemory(brand);
  const tier = payload.tier ?? "default";
  const imageModel = IMAGE_MODEL_BY_TIER[tier];
  const prompt = buildImagePrompt(memory.kernel, memory.visualKit, payload.briefText);
  const modelPrompt = payload.referenceImageUrls?.length
    ? [{
        role: "user" as const,
        content: [
          { type: "text" as const, text: prompt },
          ...payload.referenceImageUrls.map((url) => ({
            type: "image" as const,
            image: url,
          })),
        ],
      }]
    : prompt;
  const generated = await generateText({
    model: model(imageModel),
    prompt: modelPrompt,
    maxRetries: 1,
    providerOptions: {
      google: { responseModalities: ["IMAGE"] },
    },
  });
  const imageFile = generated.files.find((file) => file.mediaType.startsWith("image/"));
  if (!imageFile) {
    return agentFailure({
      agentId: "copywriter",
      traceId: input.traceId,
      model: MODELS.copywriter,
      summary: "Image generation failed",
      error: {
        code: "MODEL_ERROR",
        message: "Gemini did not return an image. Please retry.",
        retryable: true,
      },
    });
  }

  const blob = await put(
    `assets/${input.brandId}/${input.traceId}.${imageExtension(imageFile.mediaType)}`,
    Buffer.from(imageFile.uint8Array),
    { access: "public", contentType: imageFile.mediaType },
  );
  await getDb().asset.create({
    data: {
      brandId: input.brandId,
      channel: "instagram",
      angle: "image",
      body: payload.briefText,
      mediaUrl: blob.url,
      mediaType: imageFile.mediaType,
      usedKernel: true,
    },
  });

  return agentSuccess({
    agentId: "copywriter",
    traceId: input.traceId,
    model: MODELS.copywriter,
    result: {
      kind: "image",
      imageUrl: blob.url,
      mimeType: imageFile.mediaType,
      tier,
    },
    summary: `1 image - ${tier}`,
    inputTokens: generated.usage.inputTokens ?? 0,
    outputTokens: generated.usage.outputTokens ?? 0,
  });
}

export const copywriterAgent: Agent<CopywriterPayload, CopywriterResult> = {
  id: "copywriter",
  model: MODELS.copywriter,

  async run(input) {
    try {
      if (isTextPayload(input.payload)) {
        return await runTextGeneration(input, input.payload);
      }
      if (isImagePayload(input.payload)) {
        return await runImageGeneration(input, input.payload);
      }
      return agentFailure({
        agentId: "copywriter",
        traceId: input.traceId,
        model: MODELS.copywriter,
        summary: "Invalid copywriter request",
        error: {
          code: "INPUT_ERROR",
          message: "The copywriter mode is not supported.",
          retryable: false,
        },
      });
    } catch (error) {
      return agentFailure({
        agentId: "copywriter",
        traceId: input.traceId,
        model: MODELS.copywriter,
        summary: "Copywriter failed",
        error: {
          code: "MODEL_ERROR",
          message: "The copywriter could not complete this request.",
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
      });
    }
  },
};
