import { getDb } from "@/lib/db";
import { applyConfirmedField } from "./confirm";
import {
  ConfirmedInformationSchema,
  type BrandAnalystPayload,
  type BrandAnalystResult,
} from "./schema";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

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
    select: { name: true, url: true, kernel: true },
  });
  const url = primaryUrl(payload) ?? existing?.url ?? "";
  const name = payload.companyName ?? result.brandName ?? existing?.name ?? "Untitled brand";
  const extractedAt = new Date().toISOString();
  const existingProvenance = record(record(existing?.kernel).provenance);
  const existingConfirmed = ConfirmedInformationSchema.array().safeParse(
    existingProvenance.confirmedInformation,
  );
  const confirmedInformation = result.confirmedInformation.length > 0
    ? result.confirmedInformation
    : existingConfirmed.success
      ? existingConfirmed.data
      : [];
  const confirmedKernel = confirmedInformation.reduce(
    (kernel, item) => applyConfirmedField(kernel, item.field, item.value),
    result.kernel,
  );
  const resolvedFields = new Set(confirmedInformation.map((item) => item.field));
  const informationRequests = result.informationRequests.filter(
    (request) => !resolvedFields.has(request.field),
  );
  result.kernel = confirmedKernel;
  result.confirmedInformation = confirmedInformation;
  result.informationRequests = informationRequests;
  const provenance = {
    traceId,
    extractedAt,
    forceRefresh: payload.forceRefresh,
    crawledUrls: result.crawledUrls,
    sources: result.sources,
    evidence: result.evidence,
    conflicts: result.conflicts,
    missingInformation: result.missingInformation,
    informationRequests,
    confirmedInformation,
  };
  const kernel = jsonValue({
    ...confirmedKernel,
    productCatalogues: result.productCatalogues,
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
