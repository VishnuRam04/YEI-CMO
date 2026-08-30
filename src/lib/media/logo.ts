import sharp from "sharp";

export interface BrandLogo {
  bytes: Uint8Array;
  mediaType: string;
}

/** Where the real logo is stamped, and how much room the artwork must leave. */
export const LOGO_CORNER = "top-left" as const;
/** Logo width as a share of the poster width. */
const LOGO_WIDTH_RATIO = 0.20;
/** Clear space around the logo, as a share of the poster width. */
const MARGIN_RATIO = 0.035;
/** The band the artwork keeps clear, as a share of the poster's height. */
const RESERVED_HEIGHT_RATIO = 0.10;

/**
 * Stamps the brand's own logo onto a generated poster.
 *
 * An image model redraws a mark from its description and never reproduces it:
 * the wordmark comes out misspelled, warped, or duplicated. Compositing the
 * uploaded file is the only way the logo is exactly the logo, so the artwork
 * is generated with this corner deliberately left empty.
 */
export async function stampLogo(
  poster: { bytes: Uint8Array; mediaType: string },
  logo: BrandLogo,
): Promise<{ bytes: Uint8Array; mediaType: string }> {
  const base = sharp(Buffer.from(poster.bytes));
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return poster;

  const logoWidth = Math.max(48, Math.round(width * LOGO_WIDTH_RATIO));
  const margin = Math.round(width * MARGIN_RATIO);
  const mark = await sharp(Buffer.from(logo.bytes))
    .resize({ width: logoWidth, withoutEnlargement: false })
    .png()
    .toBuffer();
  const markMeta = await sharp(mark).metadata();

  // Never let the mark spill outside the canvas on an unusual aspect ratio.
  if (margin + logoWidth > width || margin + (markMeta.height ?? 0) > height) {
    return poster;
  }

  const composited = await base
    .composite([{ input: mark, top: margin, left: margin }])
    .jpeg({ quality: 92 })
    .toBuffer();

  return { bytes: new Uint8Array(composited), mediaType: "image/jpeg" };
}

/** The space the artwork must keep clear, described for the image prompt. */
export function logoReservationNote(): string {
  return `A real logo is placed into the TOP-LEFT corner after this image is made.
Keep a shallow band across the top ${Math.round(RESERVED_HEIGHT_RATIO * 100)}% of the
height clear on the left ${Math.round(LOGO_WIDTH_RATIO * 100) + 6}% of the width: plain
background only there, no text, no illustration, no border pattern. It is a small
corner, not a large empty block - the rest of the poster runs normally right up
to it.

Do not draw a logo, mascot, monogram or brand mark anywhere. Do not write the
brand name anywhere in the artwork, in any corner, at any size. The brand is
identified by the mark that is added afterwards, so any name you draw becomes a
duplicate.`;
}
