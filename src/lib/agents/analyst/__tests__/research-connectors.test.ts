import { describe, expect, it, vi } from "vitest";
import { runResearchConnectors } from "../research-connectors";
import { AnalystPayloadSchema } from "../schema";

const context = (objective: string, channels: string[] = []) => ({
  payload: AnalystPayloadSchema.parse({
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-26T00:00:00.000Z",
    mode: "market-research",
    objective,
    channels,
  }),
  brandName: "Northwind",
  category: "Eyewear",
  retrievedAt: "2026-08-26T12:00:00.000Z",
});

describe("Analyst research connectors", () => {
  it("reports requested connectors as unavailable when credentials are absent", async () => {
    const result = await runResearchConnectors(
      context("Find popular YouTube and Instagram competitor ads in Malaysia", ["youtube", "instagram"]),
      { environment: {} },
    );

    expect(result.statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "youtube-data", status: "unavailable" }),
      expect.objectContaining({ source: "meta-ad-library", status: "unavailable" }),
      expect.objectContaining({ source: "google-trends", status: "search-only" }),
      expect.objectContaining({ source: "tiktok-creative-center", status: "search-only" }),
    ]));
    expect(result.missingData.join(" ")).toContain("YOUTUBE_DATA_API_KEY");
    expect(result.missingData.join(" ")).toContain("META_AD_LIBRARY_ACCESS_TOKEN");
  });

  it("collects current public YouTube statistics with source URLs", async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) {
        return Response.json({ items: [{ id: { videoId: "video-1" } }] });
      }
      return Response.json({
        items: [{
          id: "video-1",
          snippet: { title: "What is trending", publishedAt: "2026-08-20T00:00:00.000Z" },
          statistics: { viewCount: "12000", likeCount: "900", commentCount: "80" },
        }],
      });
    }) as unknown as typeof fetch;

    const result = await runResearchConnectors(
      context("Find popular YouTube video trends in Malaysia", ["youtube"]),
      { fetchImpl, environment: { YOUTUBE_DATA_API_KEY: "test-key" } },
    );

    expect(result.signals[0]).toMatchObject({
      id: "youtube-trend-1",
      sourceUrls: ["https://www.youtube.com/watch?v=video-1"],
    });
    expect(result.signals[0].finding).toContain("12,000 views");
    expect(result.signals[0].implication).toContain("not as proof of conversion");
    expect(result.sources[0].publishedAt).toBe("2026-08-20T00:00:00.000Z");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not call quota-backed APIs for unrelated assignments", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await runResearchConnectors(
      context("Research changes to email deliverability"),
      { fetchImpl, environment: { YOUTUBE_DATA_API_KEY: "test-key", META_AD_LIBRARY_ACCESS_TOKEN: "token", RESEARCH_DEFAULT_COUNTRY: "MY" } },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "youtube-data", status: "skipped" }),
      expect.objectContaining({ source: "meta-ad-library", status: "skipped" }),
    ]));
  });
});
