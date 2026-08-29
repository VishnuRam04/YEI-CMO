import { put } from "@vercel/blob";
import { getDb } from "@/lib/db";

export interface StoredImage {
  url: string;
  mediaType: string;
  /** Where the bytes ended up, for tracing and tests. */
  backend: "blob" | "database";
}

export function imageExtension(mediaType: string): string {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}

/**
 * Persists a generated image and returns a URL the browser can load.
 *
 * Vercel Blob is used when a token is configured. Without one the bytes go
 * into the Asset row and are served from /api/media/[id]. Generation itself
 * only needs the Google API key, so requiring a blob credential would block
 * the feature for no reason in local and self-hosted setups.
 */
export async function storeGeneratedImage(input: {
  brandId: string;
  traceId: string;
  bytes: Uint8Array;
  mediaType: string;
  brief: string;
  channel?: string;
}): Promise<StoredImage> {
  const channel = input.channel ?? "instagram";

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(
      `assets/${input.brandId}/${input.traceId}.${imageExtension(input.mediaType)}`,
      Buffer.from(input.bytes),
      { access: "public", contentType: input.mediaType },
    );
    await getDb().asset.create({
      data: {
        brandId: input.brandId,
        channel,
        angle: "image",
        body: input.brief,
        mediaUrl: blob.url,
        mediaType: input.mediaType,
        usedKernel: true,
      },
    });
    return { url: blob.url, mediaType: input.mediaType, backend: "blob" };
  }

  // The row is created first so the served URL can carry its id.
  const asset = await getDb().asset.create({
    data: {
      brandId: input.brandId,
      channel,
      angle: "image",
      body: input.brief,
      mediaType: input.mediaType,
      mediaData: Buffer.from(input.bytes),
      usedKernel: true,
    },
    select: { id: true },
  });
  const url = `/api/media/${asset.id}`;
  await getDb().asset.update({ where: { id: asset.id }, data: { mediaUrl: url } });
  return { url, mediaType: input.mediaType, backend: "database" };
}

export async function loadStoredImage(
  assetId: string,
): Promise<{ bytes: Uint8Array; mediaType: string } | null> {
  const asset = await getDb().asset.findUnique({
    where: { id: assetId },
    select: { mediaData: true, mediaType: true },
  });
  if (!asset?.mediaData) return null;
  return {
    bytes: Uint8Array.from(asset.mediaData),
    mediaType: asset.mediaType ?? "image/png",
  };
}
