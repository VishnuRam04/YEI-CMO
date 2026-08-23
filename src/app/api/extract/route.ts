import { brandAnalystAgent } from "@/lib/agents/brand-analyst";
import { withBrandAnalystProgress } from "@/lib/agents/brand-analyst/progress";
import { parseBrandAnalystRequest } from "@/lib/agents/brand-analyst/request";
import { runAgent } from "@/lib/agents/run";
import type { AgentEvent } from "@/lib/agents/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const encoder = new TextEncoder();

const line = (event: AgentEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

export async function POST(request: Request): Promise<Response> {
  let input;
  try {
    input = await parseBrandAnalystRequest(request);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INPUT_ERROR",
          message: "Request body does not match the Brand Analyst input schema.",
          detail: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let workingEmitted = false;
      controller.enqueue(
        line({ type: "state", agentId: "brand-analyst", state: "queued" }),
      );

      const output = await withBrandAnalystProgress(
        input.traceId,
        (progress) => {
          if (progress.phase === "model-output" && !workingEmitted) {
            controller.enqueue(
              line({
                type: "state",
                agentId: "brand-analyst",
                state: "working",
              }),
            );
            workingEmitted = true;
          }
          controller.enqueue(
            line({
              type: "preview",
              agentId: "brand-analyst",
              text: progress.text.slice(0, 240),
            }),
          );
        },
        () => runAgent(brandAnalystAgent, input),
      );

      if (output.ok) {
        if (!workingEmitted) {
          controller.enqueue(
            line({
              type: "state",
              agentId: "brand-analyst",
              state: "working",
            }),
          );
        }
        controller.enqueue(
          line({ type: "done", agentId: "brand-analyst", output }),
        );
      } else {
        controller.enqueue(
          line({
            type: "error",
            agentId: "brand-analyst",
            error: output.error!,
          }),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
