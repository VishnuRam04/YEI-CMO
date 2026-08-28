import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  findUnique: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    asset: {
      create: mocks.create,
      update: mocks.update,
      findUnique: mocks.findUnique,
    },
  }),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put }));

import { imageExtension, loadStoredImage, storeGeneratedImage } from "../store";

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const original = process.env.BLOB_READ_WRITE_TOKEN;

describe("generated image storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    mocks.create.mockResolvedValue({ id: "asset_1" });
    mocks.update.mockResolvedValue({ id: "asset_1" });
  });

  afterEach(() => {
    if (original === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = original;
  });

  it("stores in the database when no blob token is configured", async () => {
    const stored = await storeGeneratedImage({
      brandId: "brand_1",
      traceId: "trace_1",
      bytes,
      mediaType: "image/png",
      brief: "A classroom photo",
    });

    expect(stored.backend).toBe("database");
    expect(stored.url).toBe("/api/media/asset_1");
    expect(mocks.put).not.toHaveBeenCalled();
    // The bytes are written, then the row learns its own served URL.
    expect(mocks.create.mock.calls[0][0].data.mediaData).toBeInstanceOf(Buffer);
    expect(mocks.update.mock.calls[0][0].data.mediaUrl).toBe("/api/media/asset_1");
  });

  it("uses the blob host when a token is configured", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    mocks.put.mockResolvedValue({ url: "https://blob.example/assets/a.png" });

    const stored = await storeGeneratedImage({
      brandId: "brand_1",
      traceId: "trace_1",
      bytes,
      mediaType: "image/jpeg",
      brief: "A classroom photo",
    });

    expect(stored.backend).toBe("blob");
    expect(stored.url).toBe("https://blob.example/assets/a.png");
    expect(mocks.put.mock.calls[0][0]).toContain("trace_1.jpg");
    // Nothing large is duplicated into the database on the blob path.
    expect(mocks.create.mock.calls[0][0].data.mediaData).toBeUndefined();
  });

  it("reads bytes back for the media route", async () => {
    mocks.findUnique.mockResolvedValue({
      mediaData: Buffer.from(bytes),
      mediaType: "image/webp",
    });
    const image = await loadStoredImage("asset_1");
    expect(image?.mediaType).toBe("image/webp");
    expect(Array.from(image!.bytes)).toEqual(Array.from(bytes));
  });

  it("returns nothing for an asset stored elsewhere", async () => {
    mocks.findUnique.mockResolvedValue({ mediaData: null, mediaType: "image/png" });
    expect(await loadStoredImage("asset_1")).toBeNull();
    mocks.findUnique.mockResolvedValue(null);
    expect(await loadStoredImage("missing")).toBeNull();
  });

  it("names files by their real type", () => {
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/webp")).toBe("webp");
    expect(imageExtension("image/png")).toBe("png");
  });
});
