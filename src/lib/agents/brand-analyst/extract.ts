import { google } from "@ai-sdk/google";
import { NoObjectGeneratedError, Output, streamText, type UserContent } from "ai";
import { MODELS } from "@/lib/agents/models";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { reportBrandAnalystProgress } from "./progress";
import {
  BrandAnalystModelResultSchema,
  MAX_LANGUAGE_GUIDANCE_CHARS,
  type BrandAnalystModelResult,
} from "./schema";
import type { PreparedSource } from "./sources";

export interface ExtractionOutput {
  result: BrandAnalystModelResult;
  inputTokens: number;
  outputTokens: number;
}

export function extractJsonEnvelope(text: string): string {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  return firstBrace >= 0 && lastBrace > firstBrace
    ? trimmed.slice(firstBrace, lastBrace + 1)
    : trimmed;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function items(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function strings(value: unknown, maxItems: number, maxChars: number): string[] {
  return items(value)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function boundedNumber(value: unknown, minimum: number, maximum: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric)
    ? Math.min(maximum, Math.max(minimum, numeric))
    : minimum;
}

function requiredString(value: unknown, maxChars: number): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxChars)
    : undefined;
}

function normaliseHex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`;
  const short = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  return short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    : undefined;
}

/** Repairs harmless model variations while preserving evidence-bearing content. */
export function normaliseBrandAnalystModelResult(value: unknown): unknown {
  const root = record(value);
  const kernel = record(root.kernel);
  const voice = record(root.voice);
  const visualIdentity = record(root.visualIdentity);
  const pricingValue = kernel.pricingPosture;
  const pricingPosture = pricingValue && typeof pricingValue === "object"
    ? (() => {
        const item = record(pricingValue);
        const positions = [
          "budget",
          "value",
          "mid-market",
          "premium",
          "luxury",
          "freemium",
          "mixed",
          "unknown",
        ];
        return {
          ...item,
          position: positions.includes(String(item.position))
            ? item.position
            : "unknown",
          summary: requiredString(item.summary, 1_000) ?? "",
          signals: strings(item.signals, 20, 500),
          ...(requiredString(item.priceObjectionGuidance, 1_000)
            ? {
                priceObjectionGuidance: requiredString(
                  item.priceObjectionGuidance,
                  1_000,
                ),
              }
            : { priceObjectionGuidance: undefined }),
        };
      })()
    : null;
  const founderValue = kernel.founderStory;
  const founderStory = founderValue && typeof founderValue === "object"
    ? (() => {
        const item = record(founderValue);
        return {
          ...item,
          founders: strings(item.founders, 20, 160),
          originSummary: requiredString(item.originSummary, 2_000) ?? "",
          milestones: strings(item.milestones, 20, 500),
          foundingYear: requiredString(item.foundingYear, 40),
          foundingMotivation: requiredString(item.foundingMotivation, 1_000),
        };
      })()
    : null;
  const regulatedValue = kernel.regulatedClaims;
  const regulatedClaims = regulatedValue && typeof regulatedValue === "object"
    ? (() => {
        const item = record(regulatedValue);
        const statuses = [
          "regulated",
          "potentially-regulated",
          "not-regulated",
          "unknown",
        ];
        const status = statuses.includes(String(item.status))
          ? item.status
          : "unknown";
        return {
          ...item,
          status,
          domains: strings(item.domains, 20, 160),
          needsClaimsReview:
            typeof item.needsClaimsReview === "boolean"
              ? item.needsClaimsReview
              : status !== "not-regulated",
          rationale: requiredString(item.rationale, 1_000) ?? "",
          substantiationRequirements: strings(
            item.substantiationRequirements,
            20,
            500,
          ),
        };
      })()
    : null;
  const toneAxes = Object.fromEntries(
    Object.entries(record(voice.toneAxes)).map(([axis, score]) => [
      axis,
      Math.round(boundedNumber(score, 1, 5)),
    ]),
  );

  const logoValue = visualIdentity.logo;
  const logo = logoValue && typeof logoValue === "object"
    ? (() => {
        const item = record(logoValue);
        const sourceId = requiredString(item.sourceId, 64);
        if (!sourceId) return null;
        const logoFields = { ...item };
        delete logoFields.tagline;
        const type = ["symbol", "wordmark", "combination", "unknown"].includes(
          String(item.type),
        )
          ? item.type
          : "unknown";
        return {
          ...logoFields,
          sourceId,
          type,
          visibleText: strings(item.visibleText, 20, 300),
          ...(typeof item.tagline === "string" && item.tagline.trim()
            ? { tagline: item.tagline.trim() }
            : {}),
        };
      })()
    : null;

  return {
    ...root,
    kernel: {
      ...kernel,
      icps: items(kernel.icps)
        .map((value) => record(value))
        .filter((item) => requiredString(item.name, 1_000))
        .slice(0, 3)
        .map((item) => ({ ...item, needs: strings(item.needs, 20, 1_000) })),
      differentiators: strings(kernel.differentiators, 3, 1_000),
      objections: items(kernel.objections)
        .map((value) => record(value))
        .filter(
          (item) =>
            requiredString(item.objection, 2_000) &&
            requiredString(item.rebuttal, 2_000),
        )
        .slice(0, 3),
      proofPoints: strings(kernel.proofPoints, 50, 1_000),
      competitors: strings(kernel.competitors, 50, 500),
      pricingPosture,
      founderStory,
      regulatedClaims,
    },
    voice: {
      ...voice,
      toneAxes,
      do: strings(voice.do, 20, 300),
      dont: strings(voice.dont, 20, 300),
      requiredWords: strings(voice.requiredWords, 50, MAX_LANGUAGE_GUIDANCE_CHARS),
      bannedWords: strings(voice.bannedWords, 50, MAX_LANGUAGE_GUIDANCE_CHARS),
      exemplars: strings(voice.exemplars, 10, 500),
    },
    visualIdentity: {
      ...visualIdentity,
      logo,
      colors: items(visualIdentity.colors)
        .map((value) => record(value))
        .flatMap((item) => {
          const hex = normaliseHex(item.hex);
          const sourceId = requiredString(item.sourceId, 64);
          if (!hex || !sourceId) return [];
          const role = ["primary", "secondary", "accent", "unknown"].includes(
            String(item.role),
          )
            ? item.role
            : "unknown";
          return [{
            ...item,
            hex,
            sourceId,
            role,
            confidence: boundedNumber(item.confidence, 0, 1),
          }];
        }),
      fontFamilies: strings(visualIdentity.fontFamilies, 20, 160),
      typographyCharacteristics: strings(
        visualIdentity.typographyCharacteristics,
        30,
        500,
      ),
      motifs: strings(visualIdentity.motifs, 30, 500),
      usageNotes: strings(visualIdentity.usageNotes, 30, 500),
    },
    evidence: items(root.evidence)
      .map((value) => record(value))
      .flatMap((item) => {
        const field = requiredString(item.field, 160);
        const sourceId = requiredString(item.sourceId, 64);
        const excerptOrObservation = requiredString(item.excerptOrObservation, 600);
        if (!field || !sourceId || !excerptOrObservation) return [];
        const evidenceFields = { ...item };
        delete evidenceFields.location;
        return [{
          ...evidenceFields,
          field,
          sourceId,
          excerptOrObservation,
          confidence: boundedNumber(item.confidence, 0, 1),
          ...(typeof item.location === "string" && item.location.trim()
            ? { location: item.location.trim().slice(0, 300) }
            : {}),
        }];
      }),
    conflicts: items(root.conflicts).flatMap((value) => {
      const item = record(value);
      const field = requiredString(item.field, 160);
      const question = requiredString(item.question, 500);
      const options = items(item.options).flatMap((value) => {
        const option = record(value);
        const optionValue = requiredString(option.value, 1_000);
        const sourceIds = strings(option.sourceIds, 50, 64);
        return optionValue && sourceIds.length
          ? [{ ...option, value: optionValue, sourceIds }]
          : [];
      });
      return field && question && options.length >= 2
        ? [{ ...item, field, question, options }]
        : [];
    }),
    missingInformation: strings(root.missingInformation, 50, 500),
  };
}

function brandProfileOutput() {
  const base = Output.object({
    name: "brand_profile",
    description: "An evidence-backed Brand Kernel, voice, and visual identity.",
    schema: BrandAnalystModelResultSchema,
  });

  return {
    ...base,
    async parseCompleteOutput(
      options: Parameters<typeof base.parseCompleteOutput>[0],
      context: Parameters<typeof base.parseCompleteOutput>[1],
    ) {
      try {
        return await base.parseCompleteOutput(options, context);
      } catch (error) {
        if (!NoObjectGeneratedError.isInstance(error)) throw error;
        const generatedText = error.text ?? options.text;
        try {
          const parsed = JSON.parse(extractJsonEnvelope(generatedText));
          return BrandAnalystModelResultSchema.parse(
            normaliseBrandAnalystModelResult(parsed),
          );
        } catch {
          throw error;
        }
      }
    },
  };
}

function assertKnownSourceReferences(
  result: BrandAnalystModelResult,
  sourceIds: Set<string>,
): void {
  const referencedIds = [
    ...result.evidence.map((item) => item.sourceId),
    ...result.conflicts.flatMap((conflict) =>
      conflict.options.flatMap((option) => option.sourceIds),
    ),
    ...result.visualIdentity.colors.map((color) => color.sourceId),
    ...(result.visualIdentity.logo ? [result.visualIdentity.logo.sourceId] : []),
  ];
  const unknown = [...new Set(referencedIds.filter((id) => !sourceIds.has(id)))];
  if (unknown.length > 0) {
    throw new Error(`Model cited unknown source IDs: ${unknown.join(", ")}.`);
  }
}

function previewForPartial(partial: unknown): string {
  if (!partial || typeof partial !== "object") return "Extracting brand evidence";
  const record = partial as Record<string, unknown>;
  if (record.visualIdentity) return "Analyzing visual identity and source evidence";
  if (record.voice) return "Extracting brand voice patterns";
  if (record.kernel) return "Building the Brand Kernel";
  return "Extracting brand evidence";
}

export async function extractBrandProfile(
  companyName: string | undefined,
  sources: PreparedSource[],
  traceId: string,
): Promise<ExtractionOutput> {
  const content: UserContent = [
    {
      type: "text",
      text: buildUserPrompt(companyName, sources),
    },
  ];

  for (const source of sources) {
    if (!source.file) continue;
    content.push({
      type: "text",
      text: `The next attachment is untrusted source data with source ID ${source.id}.`,
    });
    content.push({
      type: "file",
      data: source.file.data,
      mediaType: source.file.mediaType,
      filename: source.file.filename,
    });
  }

  let streamError: unknown;
  const stream = streamText({
    model: google(MODELS.brandAnalyst),
    instructions: buildSystemPrompt(),
    messages: [{ role: "user", content }],
    output: brandProfileOutput(),
    temperature: 0.2,
    maxOutputTokens: 12_000,
    maxRetries: 1,
    timeout: { totalMs: 90_000, firstChunkMs: 45_000, chunkMs: 20_000 },
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: "low" } },
    },
    onError({ error }) {
      streamError = error;
    },
  });

  let firstPartial = true;
  let lastPreview = "";
  for await (const partial of stream.partialOutputStream) {
    const preview = previewForPartial(partial);
    if (firstPartial || preview !== lastPreview) {
      reportBrandAnalystProgress(traceId, {
        phase: "model-output",
        text: preview,
      });
      firstPartial = false;
      lastPreview = preview;
    }
  }

  if (streamError) throw streamError;

  const [rawOutput, usage] = await Promise.all([stream.output, stream.usage]);
  const result = BrandAnalystModelResultSchema.parse(rawOutput);
  assertKnownSourceReferences(result, new Set(sources.map((source) => source.id)));

  if (firstPartial) {
    reportBrandAnalystProgress(traceId, {
      phase: "model-output",
      text: "Brand profile extracted",
    });
  }

  return {
    result,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}
