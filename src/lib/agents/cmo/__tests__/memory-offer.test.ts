import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getDb: () => ({ cmoMessage: { findMany: mocks.findMany } }),
}));

import { loadPendingPlanOffer } from "../memory";

const offer = { response: { title: "t", executiveSummary: "s", keyPoints: [], options: [], recommendation: "", planOffer: true, nextStep: "Want me to build it?" } };
const question = { response: { title: "t", executiveSummary: "s", keyPoints: [], options: [], recommendation: "", planOffer: false, nextStep: "Instagram or email?" } };

describe("pending plan offer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("survives a clarifying question asked after the offer", async () => {
    // Newest first: the CMO offered, then asked one more question.
    mocks.findMany.mockResolvedValue([question, offer]);
    expect(await loadPendingPlanOffer("c1")).toBe(true);
  });

  it("is false when nothing recent offered a plan", async () => {
    mocks.findMany.mockResolvedValue([question, question, question]);
    expect(await loadPendingPlanOffer("c1")).toBe(false);
  });

  it("is false on a fresh conversation", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await loadPendingPlanOffer("c1")).toBe(false);
  });
});
