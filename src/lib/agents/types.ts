export type AgentId =
  | "cmo"
  | "brand-analyst"
  | "copywriter"
  | "analyst"
  | "strategist"
  | "brand-judge"
  | "campaign-critic";

export type AgentState = "idle" | "queued" | "working" | "complete" | "error";

export interface AgentInput<TPayload = unknown> {
  brandId: string;
  payload: TPayload;
  traceId: string;
}

export interface AgentOutput<TResult = unknown> {
  agentId: AgentId;
  traceId: string;
  ok: boolean;
  result: TResult | null;
  summary: string;
  telemetry: AgentTelemetry;
  error: AgentError | null;
}

export interface AgentTelemetry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  startedAt: string;
  finishedAt: string;
}

export interface AgentError {
  code:
    | "MODEL_ERROR"
    | "VALIDATION_ERROR"
    | "INPUT_ERROR"
    | "TIMEOUT"
    | "UNKNOWN";
  message: string;
  detail?: string;
  retryable: boolean;
}

export interface Agent<TPayload, TResult> {
  id: AgentId;
  model: string;
  run(input: AgentInput<TPayload>): Promise<AgentOutput<TResult>>;
}

export type AgentEvent =
  | { type: "state"; agentId: AgentId; state: AgentState }
  | { type: "preview"; agentId: AgentId; text: string }
  | { type: "tokens"; agentId: AgentId; count: number }
  | { type: "done"; agentId: AgentId; output: AgentOutput }
  | { type: "error"; agentId: AgentId; error: AgentError };
