export type CmoTraceAgentId =
  | "cmo"
  | "brand-analyst"
  | "analyst"
  | "strategist"
  | "copywriter";

export type CmoTraceStatus = "queued" | "working" | "completed" | "failed";

export interface CmoDevTraceEvent {
  type: "trace";
  id: string;
  traceId: string;
  agentId: CmoTraceAgentId;
  stage: string;
  label: string;
  status: CmoTraceStatus;
  timestamp: string;
  elapsedMs: number;
  detail?: unknown;
}

type TraceListener = (event: CmoDevTraceEvent) => void;

const listeners = new Map<string, { startedAt: number; listener: TraceListener }>();
const sensitiveKey = /(?:authorization|cookie|credential|database.?url|password|secret|token|api.?key)/i;

export function isCmoDevTraceEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CMO_DEV_TRACE === "true";
}

function sanitized(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.length > 2_000 ? `${value.slice(0, 2_000)}… [truncated]` : value;
  }
  if (typeof value === "undefined") return undefined;
  if (depth >= 6) return "[depth limit]";
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((item) => sanitized(item, depth + 1));
    if (value.length > 20) items.push(`[${value.length - 20} more items]`);
    return items;
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, item] of entries.slice(0, 40)) {
      output[key] = sensitiveKey.test(key) ? "[redacted]" : sanitized(item, depth + 1);
    }
    if (entries.length > 40) output.__truncated = `${entries.length - 40} more fields`;
    return output;
  }
  return String(value);
}

export function sanitizeCmoTraceDetail(value: unknown): unknown {
  return sanitized(value);
}

export function subscribeToCmoDevTrace(
  traceId: string,
  listener: TraceListener,
): () => void {
  listeners.set(traceId, { startedAt: Date.now(), listener });
  return () => {
    const subscription = listeners.get(traceId);
    if (subscription?.listener === listener) listeners.delete(traceId);
  };
}

export function emitCmoDevTrace(
  traceId: string,
  event: Omit<CmoDevTraceEvent, "type" | "id" | "traceId" | "timestamp" | "elapsedMs">,
): void {
  if (!isCmoDevTraceEnabled()) return;
  const subscription = listeners.get(traceId);
  if (!subscription) return;
  subscription.listener({
    ...event,
    type: "trace",
    id: crypto.randomUUID(),
    traceId,
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - subscription.startedAt,
    detail: event.detail === undefined ? undefined : sanitizeCmoTraceDetail(event.detail),
  });
}
