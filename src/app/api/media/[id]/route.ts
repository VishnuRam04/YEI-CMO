import { loadStoredImage } from "@/lib/media/store";

export const runtime = "nodejs";

/** Serves an image held in the database when no blob store is configured. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  try {
    const image = await loadStoredImage(id);
    if (!image) {
      return Response.json({ ok: false, message: "Image not found." }, { status: 404 });
    }
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.mediaType,
        // The bytes for an asset id never change, so this is safe to keep.
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(image.bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ ok: false, message: "The image could not be read." }, { status: 503 });
  }
}
