import { getDb } from "@/lib/db";
import type { BrandAnalystPayload, BrandAnalystResult } from "./schema";

function primaryUrl(payload: BrandAnalystPayload): string | undefined {
  const preferred = payload.sources.find((source) => source.kind === "website");
  if (preferred && "url" in preferred) return preferred.url;
  const fallback = payload.sources.find((source) => "url" in source && source.url);
  return fallback && "url" in fallback ? fallback.url : payload.url;
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export async function persistBrandProfile(
  brandId: string,
  payload: BrandAnalystPayload,
  result: BrandAnalystResult,
  traceId: string,
): Promise<void> {
  const db = getDb();
  const existing = await db.brand.findUnique({
    where: { id: brandId },
    select: { name: true, url: true },
  });
  const url = primaryUrl(payload) ?? existing?.url ?? "";
  const name = payload.companyName ?? result.brandName ?? existing?.name ?? "Untitled brand";
  const extractedAt = new Date().toISOString();
  const provenance = {
    traceId,
    extractedAt,
    forceRefresh: payload.forceRefresh,
    crawledUrls: result.crawledUrls,
    sources: result.sources,
    evidence: result.evidence,
    conflicts: result.conflicts,
    missingInformation: result.missingInformation,
  };
  const kernel = jsonValue({
    ...result.kernel,
    visualIdentity: result.visualIdentity,
    provenance,
  });
  const voice = jsonValue({
    ...result.voice,
    provenance: {
      traceId,
      extractedAt,
      evidence: result.evidence.filter((item) => item.field.startsWith("voice.")),
    },
  });

  await db.brand.upsert({
    where: { id: brandId },
    update: { name, url, kernel, voice },
    create: { id: brandId, name, url, kernel, voice },
  });
}
