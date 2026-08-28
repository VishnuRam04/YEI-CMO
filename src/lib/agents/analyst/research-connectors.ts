import type { AnalystPayload, AnalystResult } from "./schema";

type MarketSignal = AnalystResult["marketSignals"][number];
type ResearchSource = AnalystResult["sources"][number];
type ConnectorStatus = AnalystResult["connectorStatus"][number];

interface ResearchConnectorContext {
  payload: AnalystPayload;
  brandName: string;
  category: string;
  retrievedAt: string;
}

interface ConnectorEnvironment {
  [key: string]: string | undefined;
  YOUTUBE_DATA_API_KEY?: string;
  META_AD_LIBRARY_ACCESS_TOKEN?: string;
  META_GRAPH_API_VERSION?: string;
  RESEARCH_DEFAULT_COUNTRY?: string;
}

interface ConnectorDependencies {
  fetchImpl?: typeof fetch;
  environment?: ConnectorEnvironment;
}

export interface ResearchConnectorResult {
  signals: MarketSignal[];
  sources: ResearchSource[];
  statuses: ConnectorStatus[];
  missingData: string[];
  groundingTargets: string[];
}

export function researchGroundingTargets(): string[] {
  return [
    "Google Trends public results and official Google trend publications: https://trends.google.com/trends/",
    "TikTok Creative Center trends, top ads, hashtags, creators and videos: https://ads.tiktok.com/business/creativecenter/",
    "Meta Ad Library public results when relevant and accessible: https://www.facebook.com/ads/library/",
    "Official platform trend reports and reputable directly dated industry research.",
  ];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function compactText(value: unknown, maximum: number): string {
  return string(value).replace(/\s+/g, " ").slice(0, maximum);
}

function countryFromContext(context: ResearchConnectorContext, environment: ConnectorEnvironment): string | null {
  const haystack = [
    context.payload.objective,
    ...context.payload.topics,
  ].filter(Boolean).join(" ").toLowerCase();
  const countries: Array<[RegExp, string]> = [
    [/\b(?:malaysia|malaysian|kuala lumpur)\b/, "MY"],
    [/\b(?:singapore|singaporean)\b/, "SG"],
    [/\b(?:united kingdom|britain|british|\buk\b)\b/, "GB"],
    [/\b(?:united states|american|\busa?\b)\b/, "US"],
    [/\b(?:australia|australian)\b/, "AU"],
    [/\b(?:indonesia|indonesian)\b/, "ID"],
    [/\b(?:philippines|filipino)\b/, "PH"],
    [/\b(?:thailand|thai)\b/, "TH"],
  ];
  const inferred = countries.find(([pattern]) => pattern.test(haystack))?.[1];
  const configured = string(environment.RESEARCH_DEFAULT_COUNTRY).toUpperCase();
  return inferred ?? (/^[A-Z]{2}$/.test(configured) ? configured : null);
}

function researchQuery(context: ResearchConnectorContext): string {
  return [
    ...context.payload.topics.slice(0, 3),
    ...context.payload.productNames.slice(0, 2),
    context.category !== "Unknown category" ? context.category : "",
    context.brandName,
  ].filter(Boolean).join(" ").slice(0, 300);
}

async function jsonRequest(url: URL, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4_500),
  });
  const payload = record(await response.json().catch(() => ({})));
  if (!response.ok) {
    const apiError = record(payload.error);
    throw new Error(compactText(apiError.message, 300) || `HTTP ${response.status}`);
  }
  return payload;
}

async function youtubeConnector(
  context: ResearchConnectorContext,
  fetchImpl: typeof fetch,
  environment: ConnectorEnvironment,
  country: string | null,
): Promise<Pick<ResearchConnectorResult, "signals" | "sources" | "statuses" | "missingData">> {
  const key = string(environment.YOUTUBE_DATA_API_KEY);
  const channelRequested = context.payload.channels.some((channel) => /youtube/i.test(channel));
  const trendRequested = /\b(?:youtube|video trends?|popular videos?|what(?:'s| is) (?:working|popular)|content ideas?)\b/i.test(
    context.payload.objective ?? "",
  );
  if (!channelRequested && !trendRequested) {
    return {
      signals: [], sources: [], missingData: [],
      statuses: [{ source: "youtube-data", status: "skipped", detail: "The assignment did not request YouTube or broad video-trend evidence.", checkedAt: context.retrievedAt }],
    };
  }
  if (!key) {
    return {
      signals: [], sources: [],
      missingData: ["YouTube trend evidence was requested but YOUTUBE_DATA_API_KEY is not configured."],
      statuses: [{ source: "youtube-data", status: "unavailable", detail: "Add YOUTUBE_DATA_API_KEY to enable public video statistics.", checkedAt: context.retrievedAt }],
    };
  }

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("order", "viewCount");
    searchUrl.searchParams.set("maxResults", "10");
    searchUrl.searchParams.set("safeSearch", "strict");
    searchUrl.searchParams.set("q", researchQuery(context));
    searchUrl.searchParams.set("publishedAfter", context.payload.from);
    searchUrl.searchParams.set("key", key);
    if (country) searchUrl.searchParams.set("regionCode", country);
    const searchPayload = await jsonRequest(searchUrl, fetchImpl);
    const searchItems = array(searchPayload.items);
    const ids = searchItems
      .map((item) => string(record(record(item).id).videoId))
      .filter(Boolean)
      .slice(0, 10);
    if (ids.length === 0) {
      return {
        signals: [], sources: [], missingData: [],
        statuses: [{ source: "youtube-data", status: "active", detail: "The API returned no recent matching public videos.", checkedAt: context.retrievedAt }],
      };
    }

    const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    statsUrl.searchParams.set("part", "snippet,statistics");
    statsUrl.searchParams.set("id", ids.join(","));
    statsUrl.searchParams.set("key", key);
    const statsPayload = await jsonRequest(statsUrl, fetchImpl);
    const videos = array(statsPayload.items)
      .map((item) => record(item))
      .sort((left, right) => count(record(right.statistics).viewCount) - count(record(left.statistics).viewCount))
      .slice(0, 5);
    const sources: ResearchSource[] = [];
    const signals: MarketSignal[] = [];
    for (const [index, video] of videos.entries()) {
      const id = string(video.id);
      if (!id) continue;
      const snippet = record(video.snippet);
      const statistics = record(video.statistics);
      const url = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
      const title = compactText(snippet.title, 300) || `YouTube video ${id}`;
      const views = count(statistics.viewCount);
      const likes = count(statistics.likeCount);
      const comments = count(statistics.commentCount);
      sources.push({
        id: `youtube-${id}`.slice(0, 100),
        title,
        url,
        publishedAt: string(snippet.publishedAt) || null,
        retrievedAt: context.retrievedAt,
      });
      signals.push({
        id: `youtube-trend-${index + 1}`,
        finding: `Public YouTube result “${title}” has ${views.toLocaleString()} views, ${likes.toLocaleString()} likes and ${comments.toLocaleString()} comments as retrieved on ${context.retrievedAt.slice(0, 10)}.`,
        implication: "Use this as public attention evidence for topic and hook exploration, not as proof of conversion performance or brand fit.",
        sourceUrls: [url],
        observedAt: context.retrievedAt,
        confidence: 0.8,
      });
    }
    return {
      signals, sources, missingData: [],
      statuses: [{ source: "youtube-data", status: "active", detail: `${signals.length} recent public videos returned with platform statistics.`, checkedAt: context.retrievedAt }],
    };
  } catch (error) {
    return {
      signals: [], sources: [],
      missingData: [`YouTube Data API was unavailable: ${error instanceof Error ? error.message : String(error)}`],
      statuses: [{ source: "youtube-data", status: "failed", detail: error instanceof Error ? error.message : String(error), checkedAt: context.retrievedAt }],
    };
  }
}

async function metaAdLibraryConnector(
  context: ResearchConnectorContext,
  fetchImpl: typeof fetch,
  environment: ConnectorEnvironment,
  country: string | null,
): Promise<Pick<ResearchConnectorResult, "signals" | "sources" | "statuses" | "missingData">> {
  const requested = /\b(?:meta|facebook|instagram|competitor ads?|ad library|advertising creative)\b/i.test(
    [context.payload.objective, ...context.payload.channels].filter(Boolean).join(" "),
  );
  if (!requested) {
    return {
      signals: [], sources: [], missingData: [],
      statuses: [{ source: "meta-ad-library", status: "skipped", detail: "The assignment did not request Meta or competitor-ad evidence.", checkedAt: context.retrievedAt }],
    };
  }
  const token = string(environment.META_AD_LIBRARY_ACCESS_TOKEN);
  if (!token || !country) {
    const missing = [!token ? "META_AD_LIBRARY_ACCESS_TOKEN" : "", !country ? "RESEARCH_DEFAULT_COUNTRY" : ""].filter(Boolean).join(" and ");
    return {
      signals: [], sources: [],
      missingData: [`Meta Ad Library evidence was requested but ${missing} is not configured.`],
      statuses: [{ source: "meta-ad-library", status: "unavailable", detail: `Configure ${missing}; API coverage still depends on Meta’s eligible ad categories and regions.`, checkedAt: context.retrievedAt }],
    };
  }

  try {
    const version = string(environment.META_GRAPH_API_VERSION) || "v24.0";
    const url = new URL(`https://graph.facebook.com/${encodeURIComponent(version)}/ads_archive`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("ad_active_status", "ACTIVE");
    url.searchParams.set("ad_reached_countries", JSON.stringify([country]));
    url.searchParams.set("ad_type", "ALL");
    url.searchParams.set("search_terms", researchQuery(context));
    url.searchParams.set("limit", "10");
    url.searchParams.set("fields", "id,page_id,page_name,ad_creation_time,ad_delivery_start_time,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,publisher_platforms");
    const payload = await jsonRequest(url, fetchImpl);
    const ads = array(payload.data).map(record).slice(0, 5);
    const sources: ResearchSource[] = [];
    const signals: MarketSignal[] = [];
    for (const [index, ad] of ads.entries()) {
      const id = string(ad.id) || `${index + 1}`;
      const snapshotUrl = string(ad.ad_snapshot_url);
      if (!URL.canParse(snapshotUrl)) continue;
      const pageName = compactText(ad.page_name, 160) || "Unknown advertiser";
      const body = compactText(array(ad.ad_creative_bodies)[0], 500) || "Creative text was not returned.";
      const started = string(ad.ad_delivery_start_time) || string(ad.ad_creation_time);
      sources.push({
        id: `meta-ad-${id}`.slice(0, 100),
        title: `${pageName} — Meta Ad Library`,
        url: snapshotUrl,
        publishedAt: started || null,
        retrievedAt: context.retrievedAt,
      });
      signals.push({
        id: `meta-ad-signal-${index + 1}`,
        finding: `Meta Ad Library shows an active ad from ${pageName}${started ? ` beginning ${started.slice(0, 10)}` : ""}. Creative excerpt: ${body}`.slice(0, 1_000),
        implication: "Treat an active creative as evidence of what an advertiser is testing, not proof that the ad is successful.",
        sourceUrls: [snapshotUrl],
        observedAt: context.retrievedAt,
        confidence: 0.75,
      });
    }
    return {
      signals, sources, missingData: [],
      statuses: [{ source: "meta-ad-library", status: "active", detail: `${signals.length} eligible active ads returned.`, checkedAt: context.retrievedAt }],
    };
  } catch (error) {
    return {
      signals: [], sources: [],
      missingData: [`Meta Ad Library API was unavailable: ${error instanceof Error ? error.message : String(error)}`],
      statuses: [{ source: "meta-ad-library", status: "failed", detail: error instanceof Error ? error.message : String(error), checkedAt: context.retrievedAt }],
    };
  }
}

export async function runResearchConnectors(
  context: ResearchConnectorContext,
  dependencies: ConnectorDependencies = {},
): Promise<ResearchConnectorResult> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const environment: ConnectorEnvironment = dependencies.environment ?? process.env;
  const country = countryFromContext(context, environment);
  const [youtube, meta] = await Promise.all([
    youtubeConnector(context, fetchImpl, environment, country),
    metaAdLibraryConnector(context, fetchImpl, environment, country),
  ]);

  return {
    signals: [...youtube.signals, ...meta.signals].slice(0, 10),
    sources: [...youtube.sources, ...meta.sources].slice(0, 25),
    statuses: [
      { source: "google-grounded-search", status: "active", detail: "Searches recent public webpages and returns grounded citations.", checkedAt: context.retrievedAt },
      ...youtube.statuses,
      ...meta.statuses,
      { source: "tiktok-creative-center", status: "search-only", detail: "No supported public data API; official Creative Center pages are used only through grounded public search.", checkedAt: context.retrievedAt },
      { source: "google-trends", status: "search-only", detail: "The official API remains limited-access alpha; public Trends evidence is used only when grounded search can cite it.", checkedAt: context.retrievedAt },
    ],
    missingData: [...youtube.missingData, ...meta.missingData],
    groundingTargets: researchGroundingTargets(),
  };
}
