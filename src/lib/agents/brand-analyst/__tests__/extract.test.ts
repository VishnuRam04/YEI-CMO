import { describe, expect, it } from "vitest";
import fixture from "./golden.fixture.json";
import {
  extractJsonEnvelope,
  normaliseBrandAnalystModelResult,
} from "../extract";
import { BrandAnalystModelResultSchema } from "../schema";

describe("Brand Analyst structured output repair", () => {
  it("extracts an object from a fenced or prefaced response", () => {
    expect(extractJsonEnvelope('Here is the result:\n```json\n{"ok":true}\n```'))
      .toBe('{"ok":true}');
  });

  it("does not modify incomplete JSON", () => {
    expect(extractJsonEnvelope('{"ok":')).toBe('{"ok":');
  });

  it("repairs common schema variations without inventing evidence", () => {
    const generated = structuredClone(fixture.modelResult) as Record<string, unknown>;
    const kernel = generated.kernel as { differentiators: string[] };
    const voice = generated.voice as {
      toneAxes: Record<string, number>;
      exemplars: string[];
    };
    const visualIdentity = generated.visualIdentity as Record<string, unknown>;
    kernel.differentiators.push("A fourth item that exceeds the limit");
    voice.toneAxes.measuredToBold = 4.7;
    voice.exemplars = [];
    visualIdentity.logo = {
      sourceId: "official-site",
      type: "unsupported-logo-type",
      visibleText: null,
      tagline: null,
    };

    const repaired = BrandAnalystModelResultSchema.parse(
      normaliseBrandAnalystModelResult(generated),
    );

    expect(repaired.kernel.differentiators).toHaveLength(3);
    expect(repaired.voice.toneAxes.measuredToBold).toBe(5);
    expect(repaired.voice.exemplars).toEqual([]);
    expect(repaired.visualIdentity.logo).toMatchObject({
      type: "unknown",
      visibleText: [],
    });
    expect(repaired.visualIdentity.logo).not.toHaveProperty("tagline");
  });
});
