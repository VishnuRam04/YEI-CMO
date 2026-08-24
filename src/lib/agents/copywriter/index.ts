import { streamText, generateText, Output } from 'ai';
import { put } from '@vercel/blob'; // swap for your R2 client if that's what 02-dev-plan.md settled on

import type { Agent, AgentInput, AgentOutput, AgentError } from '@/lib/agents/types'; // 🔒 lead-owned, do not edit
import { model, MODELS } from '@/lib/agents/models'; // 🔒 lead-owned
import { computeCost } from '@/lib/agents/cost'; // 🔒 lead-owned
import { getDb } from '@/lib/db';

import {
  VariantsSchema,
  isTextPayload,
  isImagePayload,
  type CopywriterPayload,
  type CopywriterResult,
  type TextVariant,
} from './schema';
import { buildSystemPrompt, buildUserPrompt, buildImagePrompt } from './prompt';

const db = getDb();

export const copywriterAgent: Agent<CopywriterPayload, CopywriterResult> = {
  id: 'copywriter',
  model: MODELS.copywriter, // text default; image calls override at call time

  async run(input: AgentInput<CopywriterPayload>): Promise<AgentOutput<CopywriterResult>> {
    const startedAt = new Date();

    try {
      if (isTextPayload(input.payload)) {
        return await runTextGeneration(input, startedAt);
      }
      if (isImagePayload(input.payload)) {
        return await runImageGeneration(input, startedAt);
      }
      // Exhaustiveness guard — schema should make this unreachable.
      return errorOutput(input, startedAt, {
        code: 'VALIDATION_ERROR',
        message: 'Unrecognised copywriter payload mode.',
        retryable: false,
      });
    } catch (err) {
      // Belt-and-suspenders: runAgent() catches escapes per §9, but we keep
      // our own error context rather than relying on that alone.
      return errorOutput(input, startedAt, {
        code: 'MODEL_ERROR',
        message: 'The copywriter agent failed to generate a response. Please try again.',
        detail: err instanceof Error ? err.stack ?? err.message : String(err),
        retryable: true,
      });
    }
  },
};

// TEXT — structured output via Output.object (§6 standard pattern)

async function runTextGeneration(
  input: AgentInput<CopywriterPayload>,
  startedAt: Date,
): Promise<AgentOutput<CopywriterResult>> {
  const payload = input.payload;
  if (!isTextPayload(payload)) throw new Error('runTextGeneration called with non-text payload');

  const usedKernel = payload.usedKernel ?? true;
  const brand = await db.brand.findUniqueOrThrow({ where: { id: input.brandId } });

  const result = streamText({
    model: model(MODELS.copywriter),
    system: buildSystemPrompt(brand.kernel, brand.voice, usedKernel),
    prompt: buildUserPrompt(payload),
    output: Output.object({ schema: VariantsSchema }),
  });

  // §7: emit `state: 'working'` on first token, not on request start. If
  // this agent is invoked from the streaming API route, that route should
  // consume `result.fullStream` / `result.textStream` itself and emit the
  // AgentEvent shape as chunks arrive; run() here just awaits completion
  // for the final structured object + usage. See streamCopywriterText()
  // below, which the route can call INSTEAD of run() for the live SSE path.
  const object = await result.output;
  const usage = await result.usage;
  const finishedAt = new Date();

  const parsed = VariantsSchema.safeParse(object);
  if (!parsed.success) {
    return errorOutput(input, startedAt, {
      code: 'VALIDATION_ERROR',
      message: 'The model returned copy in an unexpected shape. Please retry.',
      detail: parsed.error.message,
      retryable: true,
    });
  }

  const variants: TextVariant[] = parsed.data.variants.map((v) => ({
    ...v,
    channel: payload.channel,
    usedKernel,
  }));

  // Persist as Asset rows — one per variant, per §10's "Writes Asset rows
  // with angle, body, usedKernel".
  await db.asset.createMany({
    data: variants.map((v) => ({
      brandId: input.brandId,
      channel: v.channel,
      angle: v.angle,
      body: v.body,
      subject: v.subject ?? null,
      preheader: v.preheader ?? null,
      hashtags: v.hashtags ?? [],
      usedKernel: v.usedKernel,
    })),
  });

  const costUsd = computeCost(MODELS.copywriter, usage.inputTokens ?? 0, usage.outputTokens ?? 0);

  return {
    agentId: 'copywriter',
    traceId: input.traceId,
    ok: true,
    result: { kind: 'text', variants },
    summary: summariseVariants(variants),
    telemetry: {
      model: MODELS.copywriter,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      costUsd,
      latencyMs: finishedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    },
    error: null,
  };
}

function summariseVariants(variants: TextVariant[]): string {
  const s = `${variants.length} variants · ${variants.map((v) => v.angle).join('/')}`;
  return s.length <= 40 ? s : `${variants.length} variants generated`;
}

const IMAGE_MODEL_BY_TIER = {
  draft: 'gemini-3.1-flash-lite-image',
  default: MODELS.copywriterImage, // 'gemini-3.1-flash-image'
  hero: 'gemini-3-pro-image',
} as const;

async function runImageGeneration(
  input: AgentInput<CopywriterPayload>,
  startedAt: Date,
): Promise<AgentOutput<CopywriterResult>> {
  const payload = input.payload;
  if (!isImagePayload(payload)) throw new Error('runImageGeneration called with non-image payload');

  const tier = payload.tier ?? 'default';
  const imageModelId = IMAGE_MODEL_BY_TIER[tier];

  const brand = await db.brand.findUniqueOrThrow({ where: { id: input.brandId } });
  // visualKit is expected to live alongside kernel/voice on the Brand row.
  // If it doesn't exist yet as a column, that's a 🔒 schema.prisma change —
  // raise it with the lead per §3.3, don't bolt it onto Asset.body.
  const prompt = buildImagePrompt(brand.kernel, brand.visualKit, payload.briefText);

  const result = await generateText({
    model: model(imageModelId),
    prompt: payload.referenceImageUrls?.length
      ? [
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: prompt },
              ...payload.referenceImageUrls.map((url) => ({
                type: 'image' as const,
                image: url,
              })),
            ],
          },
        ]
      : prompt,
  });

  const imageFile = result.files.find((f) => f.mediaType.startsWith('image/'));
  if (!imageFile) {
    return errorOutput(input, startedAt, {
      code: 'MODEL_ERROR',
      message: 'The image model did not return an image. Please try again.',
      retryable: true,
    });
  }

  const blob = await put(
    `assets/${input.brandId}/${input.traceId}.png`,
    Buffer.from(imageFile.uint8Array),
    { access: 'public', contentType: imageFile.mediaType },
  );

  const finishedAt = new Date();

  await db.asset.create({
    data: {
      brandId: input.brandId,
      channel: 'instagram', // adjust if images can target other channels
      angle: 'image',
      body: '', // Asset.body is text-only per §3.3 — image lives in mediaUrl
      mediaUrl: blob.url,
      usedKernel: true, // no usedKernel:false mode for images this phase
    },
  });

  const usage = result.usage;
  const costUsd = computeCost(imageModelId, usage.inputTokens ?? 0, usage.outputTokens ?? 0);

  return {
    agentId: 'copywriter',
    traceId: input.traceId,
    ok: true,
    result: { kind: 'image', imageUrl: blob.url, mimeType: imageFile.mediaType, tier },
    summary: `1 image · ${tier}`,
    telemetry: {
      model: imageModelId,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      costUsd,
      latencyMs: finishedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    },
    error: null,
  };
}

function errorOutput(
  input: AgentInput<CopywriterPayload>,
  startedAt: Date,
  error: AgentError,
): AgentOutput<CopywriterResult> {
  const finishedAt = new Date();
  return {
    agentId: 'copywriter',
    traceId: input.traceId,
    ok: false,
    result: null,
    summary: 'Generation failed',
    telemetry: {
      model: MODELS.copywriter,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: finishedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    },
    error,
  };
}