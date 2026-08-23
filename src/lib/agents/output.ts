import type {
  AgentError,
  AgentId,
  AgentOutput,
  AgentTelemetry,
} from "@/lib/agents/types";

const pendingTelemetry = (model: string): AgentTelemetry => ({
  model,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  latencyMs: 0,
  startedAt: "",
  finishedAt: "",
});

export function agentSuccess<TResult>(options: {
  agentId: AgentId;
  traceId: string;
  model: string;
  result: TResult;
  summary: string;
  inputTokens?: number;
  outputTokens?: number;
}): AgentOutput<TResult> {
  return {
    agentId: options.agentId,
    traceId: options.traceId,
    ok: true,
    result: options.result,
    summary: options.summary.slice(0, 40),
    telemetry: {
      ...pendingTelemetry(options.model),
      inputTokens: options.inputTokens ?? 0,
      outputTokens: options.outputTokens ?? 0,
    },
    error: null,
  };
}

export function agentFailure<TResult>(options: {
  agentId: AgentId;
  traceId: string;
  model: string;
  summary: string;
  error: AgentError;
}): AgentOutput<TResult> {
  return {
    agentId: options.agentId,
    traceId: options.traceId,
    ok: false,
    result: null,
    summary: options.summary.slice(0, 40),
    telemetry: pendingTelemetry(options.model),
    error: options.error,
  };
}
