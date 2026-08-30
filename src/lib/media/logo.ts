import sharp from "sharp";

export interface BrandLogo {
  bytes: Uint8Array;
  mediaType: string;
}

/** Where the real logo is stamped, and how much room the artwork must leave. */
export const LOGO_CORNER = "top-left" as const;
/** Logo width as a share of the poster width. */
const LOGO_WIDTH_RATIO = 0.18;
/** Clear space around the logo, as a share of the poster width. */
const MARGIN_RATIO = 0.035;

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
  return `A real logo will be placed into the top-left corner after this image is
made. Leave the top-left ${Math.round(LOGO_WIDTH_RATIO * 100) + 8}% of the width
and the same height completely empty - flat background only, no text, no
illustration, no border pattern. Do not draw a logo, mascot, monogram, brand
mark or brand name anywhere in the image.`;
}
