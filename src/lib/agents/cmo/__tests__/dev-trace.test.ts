import { describe, expect, it, vi } from "vitest";
import {
  emitCmoDevTrace,
  sanitizeCmoTraceDetail,
  subscribeToCmoDevTrace,
} from "../dev-trace";

describe("CMO development trace", () => {
  it("delivers trace stages to the matching request only", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToCmoDevTrace("trace-1", listener);

    emitCmoDevTrace("another-trace", {
      agentId: "analyst",
      stage: "research",
      label: "Should not be delivered",
      status: "working",
    });
    emitCmoDevTrace("trace-1", {
      agentId: "analyst",
      stage: "research",
      label: "Collecting current evidence",
      status: "working",
      detail: { objective: "Find current trends" },
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({
      type: "trace",
      traceId: "trace-1",
      agentId: "analyst",
      stage: "research",
      status: "working",
    });
    unsubscribe();
  });

  it("redacts credentials and bounds long trace content", () => {
    const detail = sanitizeCmoTraceDetail({
      objective: "Build a campaign",
      accessToken: "do-not-expose",
      nested: { apiKey: "also-secret" },
      longText: "x".repeat(2_100),
    }) as Record<string, unknown>;

    expect(detail.accessToken).toBe("[redacted]");
    expect(detail.nested).toEqual({ apiKey: "[redacted]" });
    expect(String(detail.longText)).toContain("[truncated]");
  });
});
