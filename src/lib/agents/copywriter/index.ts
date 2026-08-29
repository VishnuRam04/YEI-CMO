import { generateText, NoObjectGeneratedError, Output, streamText } from "ai";
import { getDb } from "@/lib/db";
import { storeGeneratedImage } from "@/lib/media/store";
import { MODELS, model } from "@/lib/agents/models";
import { agentFailure, agentSuccess } from "@/lib/agents/output";
import type { Agent, AgentInput, AgentOutput } from "@/lib/agents/types";
import {
  buildImagePrompt,
  buildPosterCopyPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from "./prompt";
import {
  CHANNEL_CONSTRAINTS,
  PosterCopySchema,
  VariantsSchema,
  isImagePayload,
  isTextPayload,
  type CopywriterPayload,
  type CopywriterResult,
  type ImageGenerationPayload,
  type TextGenerationPayload,
  type TextVariant,
} from "./schema";
import { buildReport, judgeRenderedPoster, reviewContent } from "./brand-judge";
import type { BrandAuditReport } from "./schema";

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
  // Roles matter for a poster: the primary carries the headline, accents the
  // supporting shapes. A bare list of hexes loses that.
  const colorEntries = Array.isArray(visualIdentity.colors)
    ? visualIdentity.colors.flatMap((value) => {
        const entry = record(value);
        const hex = text(entry.hex, "");
        return hex ? [{ hex, role: text(entry.role, "unknown") }] : [];
      })
    : [];
  const colors = colorEntries.map((entry) => entry.hex);
  const storedLogo = record(visualIdentity.logo);
  const logoText = strings(storedLogo.visibleText);
  const logoTagline = text(storedLogo.tagline, "");
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
      paletteRoles: colorEntries,
      motifs: strings(visualIdentity.motifs),
      typography: strings(visualIdentity.typographyCharacteristics),
      logoDescription: logoText.length || logoTagline
        ? [
            `Type: ${text(storedLogo.type, "unknown")}`,
            logoText.length ? `Wording: ${logoText.join(" / ")}` : "",
            logoTagline ? `Tagline: ${logoTagline}` : "",
          ].filter(Boolean).join("; ")
        : "",
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
  const brandJudgeAttempts = 3;
  let finalVariants: TextVariant[] | null = null;
  let finalUsage = { inputTokens: 0, outputTokens: 0 };
  let finalAudit: BrandAuditReport[] = [];
  let promptForNextAttempt = buildUserPrompt(payload);
  let lastReviewDetail = "";

  for (let attempt = 0; attempt < brandJudgeAttempts; attempt += 1) {
    const generation = streamText({
      model: model(MODELS.copywriter),
      instructions: buildSystemPrompt(memory.kernel, memory.voice, usedKernel),
      prompt: promptForNextAttempt,
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

    // All three variants are judged in one call: the review is comparative and
    // should not cost a round trip per variant.
    const reports = await reviewContent(
      memory,
      variants.map((variant) => ({ id: variant.angle, content: persistedText(variant) })),
      payload.channel,
    );
    const reviews = variants.map((variant) => ({
      variant,
      report: reports.get(variant.angle) ?? buildReport([]),
    }));
    const failedReview = reviews.filter(({ report }) => !report.passed);

    if (failedReview.length === 0) {
      finalVariants = variants;
      finalUsage = { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 };
      finalAudit = reviews.map(({ variant, report }) => ({
        angle: variant.angle,
        passed: report.passed,
        overallScore: report.overallScore,
        criteria: report.criteria.map((criterion) => ({
          criterion: criterion.criterion,
          score: criterion.score,
          passed: criterion.passed,
          reasons: criterion.reasons,
        })),
        notes: report.notes,
      }));
      break;
    }

    lastReviewDetail = failedReview
      .map(({ variant, report }) => `${variant.angle} ${report.overallScore}/100: ` + report.criteria
        .filter((criterion) => !criterion.passed)
        .map((criterion) => `${criterion.criterion}=${criterion.score} (${criterion.reasons[0] ?? ""})`)
        .join("; "))
      .join(" | ");

    const correctionSummary = failedReview
      .map(({ variant, report }) => {
        const criteria = report.criteria.filter((criterion) => criterion.score < 75);
        return `${variant.angle}: ${criteria.map((criterion) => `${criterion.criterion}=${criterion.score}`).join(", ")}`;
      })
      .join("; ");

    promptForNextAttempt = `${buildUserPrompt(payload)}\n\nBRAND REVIEW FEEDBACK\nRewrite the draft so that every criterion is at least 75 and the average score is at least 80. Fix these failures before returning:\n${correctionSummary}\n\nDo not repeat the rejected phrasing. Preserve the task brief but improve the copy so it is recognisably about this brand's offer, speaks to a confirmed customer, states only what the confirmed proof points support, and matches the approved tone and channel limits.`;
  }

  if (!finalVariants) {
    return agentFailure({
      agentId: "copywriter",
      traceId: input.traceId,
      model: MODELS.copywriter,
      summary: "Brand audit failed",
      error: {
        code: "VALIDATION_ERROR",
        message: "The generated copy failed the brand-fit gate after repeated revisions.",
        detail: lastReviewDetail,
        retryable: true,
      },
    });
  }

  await getDb().asset.createMany({
    data: finalVariants.map((variant) => ({
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
    result: {
      kind: "text",
      variants: finalVariants,
      brandAudit: finalAudit,
    },
    summary: `3 variants - ${finalVariants.map((variant) => variant.angle).join("/")}`,
    inputTokens: finalUsage.inputTokens,
    outputTokens: finalUsage.outputTokens,
  });
}

const IMAGE_MODEL_BY_TIER = {
  draft: "gemini-3.1-flash-lite-image",
  default: MODELS.copywriterImage,
  hero: "gemini-3-pro-image",
} as const;

async function runImageGeneration(
  input: AgentInput<CopywriterPayload>,
  payload: ImageGenerationPayload,
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
        message: "Build brand memory before generating an image.",
        retryable: false,
      },
    });
  }

  const memory = brandMemory(brand);
  const tier = payload.tier ?? "default";
  const imageModel = IMAGE_MODEL_BY_TIER[tier];
  // Poster wording is written from the approved caption rather than sliced out
  // of it, so the lines are short enough to render cleanly and read at a
  // glance. An explicit poster payload still wins, which keeps tests exact.
  let posterCopy = payload.poster
    ? {
        headline: payload.poster.headline,
        supportingLines: payload.poster.supportingLines ?? [],
        callToAction: payload.poster.callToAction,
        highlights: payload.poster.highlights ?? [],
      }
    : undefined;
  if (!posterCopy && payload.posterSource) {
    // maxRetries does not cover a schema mismatch: the SDK treats
    // NoObjectGeneratedError as terminal. Tight word limits make a first-pass
    // miss common, so the attempts are made explicitly here.
    const posterCopyAttempts = 3;
    let lastFailure: unknown = null;
    for (let attempt = 0; attempt < posterCopyAttempts && !posterCopy; attempt += 1) {
      try {
        const written = await generateText({
          model: model(MODELS.copywriter),
          prompt: buildPosterCopyPrompt(memory.kernel.name, payload.posterSource),
          output: Output.object({ schema: PosterCopySchema }),
          // Thinking tokens count against this budget, so 600 truncated the
          // JSON mid-object and surfaced as a schema mismatch rather than as
          // the token limit it actually was.
          maxOutputTokens: 2_000,
          maxRetries: 1,
          providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
        });
        const copy = PosterCopySchema.parse(written.output);
        posterCopy = {
          headline: copy.headline,
          supportingLines: [copy.subheadline],
          callToAction: copy.callToAction,
          highlights: copy.highlights,
        };
      } catch (error) {
        lastFailure = error;
        // The SDK's message only says the schema did not match; the offending
        // text and the failing rule are what actually identify the problem.
        console.error(
          `[copywriter] poster wording attempt ${attempt + 1} failed.`,
          NoObjectGeneratedError.isInstance(error)
            ? { text: error.text, cause: error.cause }
            : error,
        );
      }
    }
    if (!posterCopy) {
      // Without poster copy the piece would be a wordless illustration, which
      // is not what was asked for, so the caller is told plainly.
      return agentFailure({
        agentId: "copywriter",
        traceId: input.traceId,
        model: MODELS.copywriter,
        summary: "Poster wording could not be written",
        error: {
          code: "MODEL_ERROR",
          message: "The poster wording could not be written. Please retry.",
          detail: lastFailure instanceof Error ? lastFailure.message : String(lastFailure),
          retryable: true,
        },
      });
    }
  }

  // A poster is content the user sees, so its wording faces the same review as
  // a caption. Words baked into artwork cannot be edited afterwards, which
  // makes judging them before rendering more important, not less.
  let posterAudit: BrandAuditReport[] = [];
  if (posterCopy) {
    const posterText = [
      posterCopy.headline,
      ...posterCopy.supportingLines,
      ...posterCopy.highlights,
      posterCopy.callToAction,
    ].filter(Boolean).join("\n");
    const reports = await reviewContent(
      memory,
      [{ id: "poster", content: posterText }],
      "instagram",
      "poster",
    );
    const report = reports.get("poster") ?? buildReport([]);
    posterAudit = [{
      angle: "poster",
      passed: report.passed,
      overallScore: report.overallScore,
      criteria: report.criteria.map((criterion) => ({
        criterion: criterion.criterion,
        score: criterion.score,
        passed: criterion.passed,
        reasons: criterion.reasons,
      })),
      notes: report.notes,
    }];
    if (!report.passed) {
      return agentFailure({
        agentId: "copywriter",
        traceId: input.traceId,
        model: MODELS.copywriter,
        summary: `Poster wording failed the Brand Judge - ${report.overallScore}/100`,
        error: {
          code: "VALIDATION_ERROR",
          message: "The poster wording did not pass the Brand Judge. Please retry.",
          detail: report.criteria
            .filter((criterion) => !criterion.passed)
            .map((criterion) => `${criterion.criterion}: ${criterion.reasons.join("; ")}`)
            .join(" | ") || report.notes.join(" | "),
          retryable: true,
        },
      });
    }
  }

  const prompt = buildImagePrompt(
    memory.kernel,
    memory.visualKit,
    payload.briefText,
    posterCopy,
  );
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

  // The rendered poster is judged before it is stored or shown: palette, brand
  // mark, motif and the accuracy of the words exist only in the pixels.
  if (posterCopy) {
    try {
      const visual = await judgeRenderedPoster(
        memory,
        { bytes: imageFile.uint8Array, mediaType: imageFile.mediaType },
        [
          posterCopy.headline,
          ...posterCopy.supportingLines,
          ...posterCopy.highlights,
          posterCopy.callToAction,
        ].filter(Boolean),
      );
      const combined = buildReport([
        ...(posterAudit[0]?.criteria ?? []).map((item) => ({
          criterion: item.criterion as never,
          score: item.score,
          passed: item.passed,
          reasons: item.reasons,
        })),
        ...visual,
      ]);
      posterAudit = [{
        angle: "poster",
        passed: combined.passed,
        overallScore: combined.overallScore,
        criteria: combined.criteria.map((item) => ({
          criterion: item.criterion,
          score: item.score,
          passed: item.passed,
          reasons: item.reasons,
        })),
        notes: combined.notes,
      }];
      if (!combined.passed) {
        return agentFailure({
          agentId: "copywriter",
          traceId: input.traceId,
          model: MODELS.copywriter,
          summary: `Poster failed the Brand Judge - ${combined.overallScore}/100`,
          error: {
            code: "VALIDATION_ERROR",
            message: "The finished poster did not pass the Brand Judge. Please retry.",
            detail: combined.criteria
              .filter((item) => !item.passed)
              .map((item) => `${item.criterion}: ${item.reasons.join("; ")}`)
              .join(" | "),
            retryable: true,
          },
        });
      }
    } catch (error) {
      // A visual review that cannot run must not silently become a pass.
      console.error("[copywriter] visual review unavailable.", error);
      posterAudit = posterAudit.map((audit) => ({
        ...audit,
        passed: false,
        notes: [...audit.notes, "The finished poster was not visually reviewed."],
      }));
    }
  }

  // Storage picks a blob host when one is configured and the database
  // otherwise, so generating an image needs no credential beyond the model key.
  const stored = await storeGeneratedImage({
    brandId: input.brandId,
    traceId: input.traceId,
    bytes: imageFile.uint8Array,
    mediaType: imageFile.mediaType,
    brief: payload.briefText,
  });

  return agentSuccess({
    agentId: "copywriter",
    traceId: input.traceId,
    model: MODELS.copywriter,
    result: {
      kind: "image",
      imageUrl: stored.url,
      mimeType: imageFile.mediaType,
      tier,
      brandAudit: posterAudit,
    },
    summary: `1 image - ${tier} - ${stored.backend}`,
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
