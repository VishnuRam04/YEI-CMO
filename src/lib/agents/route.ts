import { NextRequest } from 'next/server';
import { streamText, Output } from 'ai';

import { runAgent } from '@/lib/agents/run'; // 🔒 lead-owned
import { model, MODELS } from '@/lib/agents/models'; // 🔒 lead-owned
import type { AgentEvent, AgentInput } from '@/lib/agents/types'; // 🔒 lead-owned
import { db } from '@/lib/db';

import { copywriterAgent } from '@/lib/agents/copywriter';
import { VariantsSchema, isTextPayload, type CopywriterPayload } from '@/lib/agents/copywriter/schema';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/agents/copywriter/prompt';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as AgentInput<CopywriterPayload>;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      send({ type: 'state', agentId: 'copywriter', state: 'queued' });

      try {
        if (isTextPayload(body.payload)) {
          // Live text path: consume the stream ourselves so the UI node can
          // show tokens arriving, per §7. `working` fires on FIRST TOKEN,
          // not on request start — see the flag below.
          const usedKernel = body.payload.usedKernel ?? true;
          const brand = await db.brand.findUniqueOrThrow({ where: { id: body.brandId } });

          const result = streamText({
            model: model(MODELS.copywriter),
            system: buildSystemPrompt(brand.kernel, brand.voice, usedKernel),
            prompt: buildUserPrompt(body.payload),
            output: Output.object({ schema: VariantsSchema }),
          });

          let firstTokenSeen = false;
          let cumulative = '';
          for await (const delta of result.textStream) {
            if (!firstTokenSeen) {
              send({ type: 'state', agentId: 'copywriter', state: 'working' });
              firstTokenSeen = true;
            }
            cumulative += delta;
            send({ type: 'preview', agentId: 'copywriter', text: cumulative });
          }

          // NOTE: the standard is explicit that run() should own the full
          // lifecycle (§0, §2.1) and that agents shouldn't be called twice
          // for one user action. Re-running generation here via runAgent()
          // to get the validated/persisted envelope is wasteful and risks
          // drift between what streamed and what got saved. Flag this for
          // the lead: either (a) runAgent() needs a variant that accepts an
          // already-produced AI SDK `result` instead of calling agent.run()
          // itself, or (b) copywriterAgent.run() needs to accept an optional
          // onChunk-style callback so index.ts can emit these events itself
          // and this route becomes a thin pass-through. Don't solve this
          // divergently per-agent (§0) — raise it in the group chat.
          const output = await runAgent(copywriterAgent, body);
          send({ type: 'done', agentId: 'copywriter', output });
        } else {
          // Image path has no first-token signal — show `working` from the
          // start through to the image landing (§3.3).
          send({ type: 'state', agentId: 'copywriter', state: 'working' });
          const output = await runAgent(copywriterAgent, body);
          send({ type: 'done', agentId: 'copywriter', output });
        }
      } catch (err) {
        send({
          type: 'error',
          agentId: 'copywriter',
          error: {
            code: 'UNKNOWN',
            message: 'Something went wrong generating this asset.',
            detail: err instanceof Error ? err.stack ?? err.message : String(err),
            retryable: true,
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}