import { describe, expect, it } from "vitest";
import { AGENT_COUNT, AGENT_ROSTER } from "../roster";
import { CAPABILITIES } from "../cmo/registry";

describe("agent roster", () => {
  it("covers every capability the CMO can call", () => {
    // The registry holds the delegatable specialists; the roster adds the CMO
    // itself and the Brand Judge, which is called by the Copywriter.
    const names = new Set(AGENT_ROSTER.map((name) => name.toLowerCase()));
    for (const capability of CAPABILITIES) {
      expect(names.has(capability.title.toLowerCase())).toBe(true);
    }
    expect(AGENT_COUNT).toBe(CAPABILITIES.length + 2);
  });

  it("has no duplicates", () => {
    expect(new Set(AGENT_ROSTER).size).toBe(AGENT_ROSTER.length);
  });
});
