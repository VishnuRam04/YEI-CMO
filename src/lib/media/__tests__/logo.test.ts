import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { logoReservationNote, stampLogo } from "../logo";

async function solid(width: number, height: number, colour: { r: number; g: number; b: number }) {
  return new Uint8Array(await sharp({
    create: { width, height, channels: 3, background: colour },
  }).jpeg().toBuffer());
}

async function pixelAt(bytes: Uint8Array, x: number, y: number) {
  const { data, info } = await sharp(Buffer.from(bytes))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
}

describe("stamping the real logo", () => {
  it("places the brand's own file into the reserved corner", async () => {
    const poster = await solid(800, 600, { r: 255, g: 255, b: 255 });
    const logo = await solid(200, 200, { r: 0, g: 0, b: 255 });

    const stamped = await stampLogo(
      { bytes: poster, mediaType: "image/jpeg" },
      { bytes: logo, mediaType: "image/jpeg" },
    );

    // The corner now carries the logo, and the far side is untouched.
    const corner = await pixelAt(stamped.bytes, 60, 60);
    expect(corner.b).toBeGreaterThan(200);
    expect(corner.r).toBeLessThan(60);
    const elsewhere = await pixelAt(stamped.bytes, 700, 500);
    expect(elsewhere.r).toBeGreaterThan(200);
    expect(elsewhere.b).toBeGreaterThan(200);
  });

  it("keeps the poster's dimensions", async () => {
    const poster = await solid(1024, 768, { r: 240, g: 240, b: 240 });
    const logo = await solid(300, 120, { r: 200, g: 0, b: 0 });
    const stamped = await stampLogo(
      { bytes: poster, mediaType: "image/jpeg" },
      { bytes: logo, mediaType: "image/jpeg" },
    );
    const meta = await sharp(Buffer.from(stamped.bytes)).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(768);
  });

  it("returns the poster untouched when the mark cannot fit", async () => {
    // A sliver of a canvas has nowhere to put a mark without spilling.
    const poster = await solid(80, 20, { r: 10, g: 10, b: 10 });
    const logo = await solid(400, 400, { r: 0, g: 200, b: 0 });
    const stamped = await stampLogo(
      { bytes: poster, mediaType: "image/jpeg" },
      { bytes: logo, mediaType: "image/jpeg" },
    );
    expect(stamped.bytes).toBe(poster);
  });

  it("tells the image model to leave the corner empty and draw no mark", () => {
    const note = logoReservationNote();
    expect(note).toContain("top-left");
    expect(note).toContain("Do not draw a logo");
  });
});
