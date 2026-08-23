import { z } from "zod";
import { runAgent } from "@/lib/agents/run";
import type { Agent, AgentEvent, AgentInput } from "@/lib/agents/types";

const encoder = new TextEncoder();

const requestSchema = <P>(payloadSchema: z.ZodType<P>) =>
  z.object({
    brandId: z.string().min(1),
    traceId: z.string().min(1).optional(),
    payload: payloadSchema,
  });

const line = (event: AgentEvent) =>
  encoder.encode(`${JSON.stringify(event)}\n`);

export function createAgentRoute<P, R>(
  agent: Agent<P, R>,
  payloadSchema: z.ZodType<P>,
) {
  return async function POST(request: Request): Promise<Response> {
    let input: AgentInput<P>;

    try {
      const body = await request.json();
      const parsed = requestSchema(payloadSchema).parse(body);
      input = {
        brandId: parsed.brandId,
        payload: parsed.payload,
        traceId: parsed.traceId ?? crypto.randomUUID(),
      };
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "INPUT_ERROR",
            message: "Request body does not match the agent input schema.",
            detail: error instanceof Error ? error.message : String(error),
            retryable: false,
          },
        },
        { status: 400 },
      );
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          line({ type: "state", agentId: agent.id, state: "queued" }),
        );

        const output = await runAgent(agent, input);

        if (output.ok) {
          // The stubs are non-streaming. Real agents must move this event to their
          // first model token/partial object rather than request start.
          controller.enqueue(
            line({ type: "state", agentId: agent.id, state: "working" }),
          );
          controller.enqueue(
            line({ type: "done", agentId: agent.id, output }),
          );
        } else {
          controller.enqueue(
            line({
              type: "error",
              agentId: agent.id,
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
        "X-Content-Type-Options": "nosniff",
      },
    });
  };
}
