import { google } from "@ai-sdk/google";
import { Output, streamText, type UserContent } from "ai";
import { MODELS } from "@/lib/agents/models";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { reportBrandAnalystProgress } from "./progress";
import {
  BrandAnalystModelResultSchema,
  type BrandAnalystModelResult,
} from "./schema";
import type { PreparedSource } from "./sources";

export interface ExtractionOutput {
  result: BrandAnalystModelResult;
  inputTokens: number;
  outputTokens: number;
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
    output: Output.object({
      name: "brand_profile",
      description: "An evidence-backed Brand Kernel, voice, and visual identity.",
      schema: BrandAnalystModelResultSchema,
    }),
    temperature: 0.2,
    maxOutputTokens: 6_000,
    maxRetries: 1,
    timeout: { totalMs: 20_000, firstChunkMs: 14_000, chunkMs: 8_000 },
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
