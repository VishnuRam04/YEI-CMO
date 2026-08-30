import { z } from "zod";
import { cmoAgent } from "@/lib/agents/cmo";
import { CmoPayloadSchema } from "@/lib/agents/cmo/schema";
import {
  emitCmoDevTrace,
  isCmoDevTraceEnabled,
  subscribeToCmoDevTrace,
  type CmoDevTraceEvent,
} from "@/lib/agents/cmo/dev-trace";
import { loadCmoHistory } from "@/lib/agents/cmo/memory";
import { runAgent } from "@/lib/agents/run";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
// The CMO orchestrates its own decomposition plus the Analyst and the
// Strategist in sequence. Must exceed the CMO ceiling in lib/agents/run.ts.
export const maxDuration = 240;

const encoder = new TextEncoder();
const CmoRequestSchema = z.object({
  brandId: z.string().min(1),
  traceId: z.string().min(1).optional(),
  payload: CmoPayloadSchema,
});

function line(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

export async function POST(request: Request): Promise<Response> {
  let parsed: z.infer<typeof CmoRequestSchema>;
  try {
    parsed = CmoRequestSchema.parse(await request.json());
  } catch (error) {
    return Response.json({
      ok: false,
      error: {
        code: "INPUT_ERROR",
        message: "Request body does not match the CMO input schema.",
        detail: error instanceof Error ? error.message : String(error),
        retryable: false,
      },
    }, { status: 400 });
  }

  const traceId = parsed.traceId ?? crypto.randomUUID();
  const input = { brandId: parsed.brandId, traceId, payload: parsed.payload };
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const enqueue = (value: unknown) => {
        if (open) controller.enqueue(line(value));
      };
      // Which agent is working is progress the user should see. The payload
      // attached to each stage is developer detail, so it is stripped unless
      // dev trace is on.
      const showDetail = isCmoDevTraceEnabled();
      const unsubscribe = subscribeToCmoDevTrace(traceId, (event: CmoDevTraceEvent) =>
        enqueue(showDetail ? event : { ...event, detail: undefined }));

      enqueue({ type: "state", agentId: "cmo", state: "queued" });
      emitCmoDevTrace(traceId, {
        agentId: "cmo",
        stage: "request",
        label: "Received the CMO request",
        status: "working",
        detail: { message: parsed.payload.message },
      });

      const output = await runAgent(cmoAgent, input);
      if (output.ok) {
        enqueue({ type: "state", agentId: "cmo", state: "working" });
        enqueue({ type: "done", agentId: "cmo", output });
      } else {
        emitCmoDevTrace(traceId, {
          agentId: "cmo",
          stage: "request",
          label: output.error?.code === "TIMEOUT"
            ? "CMO orchestration reached its time limit"
            : "CMO request failed",
          status: "failed",
          detail: {
            summary: output.summary,
            error: output.error,
            telemetry: output.telemetry,
          },
        });
        enqueue({ type: "error", agentId: "cmo", error: output.error });
      }

      unsubscribe();
      open = false;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(request: Request) {
  try {
    const brand = await getDb().brand.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    });

    if (!brand) {
      return Response.json(
        {
          ok: false,
          message: "Onboard a brand before starting a CMO conversation.",
        },
        { status: 404 },
      );
    }

    const requestedConversationId = new URL(request.url).searchParams.get(
      "conversationId",
    );
    const history = requestedConversationId
      ? await loadCmoHistory(brand.id, requestedConversationId)
      : null;

    return Response.json({
      ok: true,
      brand,
      devTraceEnabled: isCmoDevTraceEnabled(),
      conversationId: history ? requestedConversationId : null,
      messages: history ?? [],
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: "The CMO could not load the active brand.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}
