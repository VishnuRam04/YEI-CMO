import { z } from "zod";
import type { AgentInput } from "@/lib/agents/types";
import {
  BrandAnalystPayloadSchema,
  MAX_INLINE_FILE_BYTES,
  MAX_SOURCE_COUNT,
  MAX_TOTAL_FILE_BYTES,
  SourceAuthoritySchema,
  type BrandAnalystPayload,
} from "./schema";

const MAX_REQUEST_BYTES = 30 * 1024 * 1024;

const envelopeSchema = z.object({
  brandId: z.string().trim().min(1).max(160),
  traceId: z.string().trim().min(1).max(160).optional(),
  payload: BrandAnalystPayloadSchema,
});

const fileMetadataSchema = z.array(
  z.object({
    label: z.string().trim().min(1).max(64).optional(),
    title: z.string().trim().min(1).max(160).optional(),
    authority: SourceAuthoritySchema.optional(),
  }),
);

function parseJsonField(value: FormDataEntryValue | null, label: string): unknown {
  if (value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${label} must be JSON text.`);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }
}

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inferredMimeType(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    avif: "image/avif",
    csv: "text/csv",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    html: "text/html",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    json: "application/json",
    md: "text/markdown",
    pdf: "application/pdf",
    png: "image/png",
    rtf: "application/rtf",
    txt: "text/plain",
    webp: "image/webp",
    xml: "text/xml",
  };
  return extension ? (types[extension] ?? "application/octet-stream") : "application/octet-stream";
}

function assertRequestSize(request: Request): void {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new Error(`Request exceeds the ${MAX_REQUEST_BYTES}-byte limit.`);
  }
}

async function parseMultipartRequest(
  request: Request,
): Promise<AgentInput<BrandAnalystPayload>> {
  const formData = await request.formData();
  const brandId = stringField(formData, "brandId");
  if (!brandId) throw new Error("brandId is required.");

  const rawPayload = parseJsonField(formData.get("payload"), "payload");
  const payloadBase =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? { ...(rawPayload as Record<string, unknown>) }
      : {};
  const sourcesField = parseJsonField(formData.get("sources"), "sources");
  const existingSources = Array.isArray(sourcesField)
    ? sourcesField
    : Array.isArray(payloadBase.sources)
      ? payloadBase.sources
      : [];
  const metadata = fileMetadataSchema.parse(
    parseJsonField(formData.get("fileMetadata"), "fileMetadata") ?? [],
  );

  const fileEntries = [...formData.entries()].filter(
    (entry): entry is [string, File] => entry[1] instanceof File && entry[1].size > 0,
  );
  if (fileEntries.length > MAX_SOURCE_COUNT) {
    throw new Error(`At most ${MAX_SOURCE_COUNT} uploaded files are supported.`);
  }

  let totalBytes = 0;
  const fileSources = await Promise.all(
    fileEntries.map(async ([fieldName, file], index) => {
      if (file.size > MAX_INLINE_FILE_BYTES) {
        throw new Error(`${file.name} exceeds the per-file upload limit.`);
      }
      totalBytes += file.size;
      if (totalBytes > MAX_TOTAL_FILE_BYTES) {
        throw new Error("Combined uploads exceed the total file limit.");
      }

      const mimeType = inferredMimeType(file);
      const kind = mimeType.startsWith("image/") ? "image" : "document";
      const details = metadata[index];
      return {
        kind,
        label: details?.label ?? (fieldName === "logo" ? "logo" : "uploaded-file"),
        title: details?.title,
        authority: details?.authority,
        fileName: file.name,
        mimeType,
        data: Buffer.from(await file.arrayBuffer()).toString("base64"),
      };
    }),
  );

  const forceRefreshField = stringField(formData, "forceRefresh");
  const contextField = parseJsonField(formData.get("context"), "context");
  const payload = BrandAnalystPayloadSchema.parse({
    ...payloadBase,
    companyName: stringField(formData, "companyName") ?? payloadBase.companyName,
    url: stringField(formData, "url") ?? payloadBase.url,
    context: contextField ?? payloadBase.context,
    forceRefresh:
      forceRefreshField === undefined
        ? payloadBase.forceRefresh
        : forceRefreshField === "true",
    sources: [...existingSources, ...fileSources],
  });

  return {
    brandId,
    traceId: stringField(formData, "traceId") ?? crypto.randomUUID(),
    payload,
  };
}

export async function parseBrandAnalystRequest(
  request: Request,
): Promise<AgentInput<BrandAnalystPayload>> {
  assertRequestSize(request);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    return parseMultipartRequest(request);
  }
  if (!contentType.includes("application/json")) {
    throw new Error("Content-Type must be application/json or multipart/form-data.");
  }

  const parsed = envelopeSchema.parse(await request.json());
  return {
    brandId: parsed.brandId,
    traceId: parsed.traceId ?? crypto.randomUUID(),
    payload: parsed.payload,
  };
}
