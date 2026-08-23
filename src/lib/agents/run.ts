import { ZodError } from "zod";
import { computeCost } from "@/lib/agents/cost";
import type {
  Agent,
  AgentError,
  AgentId,
  AgentInput,
  AgentOutput,
} from "@/lib/agents/types";

const timeoutFor = (agentId: AgentId) =>
  agentId === "brand-analyst" ? 30_000 : 20_000;

function normaliseError(error: unknown): AgentError {
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "The model returned data in an unexpected format.",
      detail: error.message,
      retryable: false,
    };
  }

  if (error instanceof Error && error.name === "AgentTimeoutError") {
    return {
      code: "TIMEOUT",
      message: "The agent took too long to respond. Please retry.",
      detail: error.message,
      retryable: true,
    };
  }

  return {
    code: "UNKNOWN",
    message: "The agent could not complete this request.",
    detail: error instanceof Error ? error.stack : String(error),
    retryable: false,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`Agent exceeded ${timeoutMs}ms timeout.`);
      error.name = "AgentTimeoutError";
      reject(error);
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function runAgent<P, R>(
  agent: Agent<P, R>,
  input: AgentInput<P>,
): Promise<AgentOutput<R>> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  try {
    const output = await withTimeout(agent.run(input), timeoutFor(agent.id));
    const finished = Date.now();
    const inputTokens = output.telemetry.inputTokens || 0;
    const outputTokens = output.telemetry.outputTokens || 0;

    return {
      ...output,
      agentId: agent.id,
      traceId: input.traceId,
      summary: output.summary.slice(0, 40),
      telemetry: {
        model: agent.model,
        inputTokens,
        outputTokens,
        costUsd: computeCost(agent.model, inputTokens, outputTokens),
        latencyMs: finished - started,
        startedAt,
        finishedAt: new Date(finished).toISOString(),
      },
    };
  } catch (error) {
    const finished = Date.now();
    return {
      agentId: agent.id,
      traceId: input.traceId,
      ok: false,
      result: null,
      summary: "Agent failed",
      telemetry: {
        model: agent.model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: finished - started,
        startedAt,
        finishedAt: new Date(finished).toISOString(),
      },
      error: normaliseError(error),
    };
  }
}
