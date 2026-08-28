import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ExcelJS from "@excel.js/exceljs";
import { load } from "cheerio";
import type { PromptSource } from "./prompt";
import {
  MAX_INLINE_FILE_BYTES,
  MAX_TOTAL_FILE_BYTES,
  type BrandAnalystPayload,
  type BrandSourceInput,
  type ProductCatalogue,
  type SourceAuthority,
  type SourceReport,
} from "./schema";

const MAX_PAGE_BYTES = 1_500_000;
const MAX_REMOTE_FILE_BYTES = MAX_INLINE_FILE_BYTES;
const MAX_TEXT_PER_SOURCE = 30_000;
const MAX_TOTAL_TEXT = 90_000;
const MAX_CRAWLED_PAGES = 4;
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 7_000;
const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_CATALOGUE_PRODUCTS = 1_000;
const MAX_CATALOGUE_COLUMNS = 50;
const MAX_HEADER_SCAN_ROWS = 20;

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type ResolveHost = (hostname: string) => Promise<string[]>;

export interface PreparedFile {
  data: Uint8Array;
  mediaType: string;
  filename: string;
}

export interface PreparedSource extends PromptSource {
  checksum: string;
  file?: PreparedFile;
  productCatalogue?: ProductCatalogue;
  crawledUrls: string[];
}

export interface PreparedSources {
  sources: PreparedSource[];
  reports: SourceReport[];
  crawledUrls: string[];
  productCatalogues: ProductCatalogue[];
}

export interface SourcePreparationDependencies {
  fetch?: FetchImplementation;
  resolveHost?: ResolveHost;
}

interface FetchedResource {
  url: string;
  bytes: Uint8Array;
  contentType: string;
}

interface ParsedPage {
  url: string;
  title: string;
  text: string;
  links: string[];
}

function ipv4IsNonPublic(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return true;
  }

  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function mappedIpv4(address: string): string | null {
  const marker = "::ffff:";
  if (!address.startsWith(marker)) return null;

  const suffix = address.slice(marker.length);
  if (suffix.includes(".")) return suffix;

  const parts = suffix.split(":");
  if (parts.length !== 2) return null;
  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;

  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function isNonPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const version = isIP(normalized);

  if (version === 4) return ipv4IsNonPublic(normalized);
  if (version !== 6) return true;

  const mapped = mappedIpv4(normalized);
  if (mapped) return ipv4IsNonPublic(mapped);

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2001:10:")
  );
}

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export async function assertPublicUrl(
  rawUrl: string,
  resolveHost: ResolveHost = defaultResolveHost,
): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS sources are supported.");
  }
  if (url.username || url.password) {
    throw new Error("Source URLs cannot contain credentials.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Local or private source hosts are not allowed.");
  }

  const addresses = isIP(hostname) ? [hostname] : await resolveHost(hostname);
  if (addresses.length === 0 || addresses.some(isNonPublicAddress)) {
    throw new Error("Source URL resolved to a non-public network address.");
  }

  url.hash = "";
  return url;
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`Source exceeds the ${maxBytes}-byte limit.`);
  }

  if (!response.body) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Source exceeds the ${maxBytes}-byte limit.`);
    }
    chunks.push(value);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function fetchPublicResource(
  rawUrl: string,
  maxBytes: number,
  dependencies: Required<SourcePreparationDependencies>,
): Promise<FetchedResource> {
  let currentUrl = rawUrl;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const safeUrl = await assertPublicUrl(currentUrl, dependencies.resolveHost);
    const response = await dependencies.fetch(safeUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "text/html,application/xhtml+xml,application/pdf,image/*,text/*;q=0.9,*/*;q=0.1",
        "User-Agent": "NorthwindBrandAnalyst/1.0",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Source redirect did not include a location.");
      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`Source returned HTTP ${response.status}.`);
    }

    const contentType =
      response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ??
      "application/octet-stream";

    return {
      url: safeUrl.toString(),
      bytes: await readLimitedBody(response, maxBytes),
      contentType,
    };
  }

  throw new Error(`Source exceeded ${MAX_REDIRECTS} redirects.`);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseHtmlPage(resource: FetchedResource): ParsedPage {
  const html = new TextDecoder("utf-8", { fatal: false }).decode(resource.bytes);
  const $ = load(html);
  const title =
    collapseWhitespace($("title").first().text()) || new URL(resource.url).hostname;
  const description =
    $("meta[name='description']").attr("content") ??
    $("meta[property='og:description']").attr("content") ??
    "";

  const links = $("a[href]")
    .toArray()
    .map((element) => $(element).attr("href"))
    .filter((href): href is string => Boolean(href))
    .flatMap((href) => {
      try {
        return [new URL(href, resource.url).toString()];
      } catch {
        return [];
      }
    });

  $("script,style,noscript,svg,iframe,form,nav,footer,header").remove();
  const body = collapseWhitespace($("main").text() || $("body").text());
  const text = collapseWhitespace(`${title}. ${description} ${body}`).slice(
    0,
    MAX_TEXT_PER_SOURCE,
  );

  return { url: resource.url, title, text, links };
}

function relevantSameOriginLinks(page: ParsedPage): string[] {
  const origin = new URL(page.url).origin;
  const pattern =
    /\b(about|company|product|products|service|services|pricing|case-study|case-studies|customers|faq|story|mission)\b/i;
  const seen = new Set<string>();

  return page.links
    .flatMap((rawUrl) => {
      const url = new URL(rawUrl);
      url.hash = "";
      if (url.origin !== origin || !pattern.test(url.pathname.replaceAll("/", " "))) {
        return [];
      }
      const normalized = url.toString();
      if (seen.has(normalized) || normalized === page.url) return [];
      seen.add(normalized);
      return [normalized];
    })
    .slice(0, MAX_CRAWLED_PAGES - 1);
}

async function fetchHtmlPage(
  url: string,
  dependencies: Required<SourcePreparationDependencies>,
): Promise<ParsedPage> {
  const resource = await fetchPublicResource(url, MAX_PAGE_BYTES, dependencies);
  if (
    !["text/html", "application/xhtml+xml", "text/plain"].includes(
      resource.contentType,
    )
  ) {
    throw new Error(`Expected a web page but received ${resource.contentType}.`);
  }
  return parseHtmlPage(resource);
}

async function crawlWebsite(
  url: string,
  dependencies: Required<SourcePreparationDependencies>,
): Promise<{ pages: ParsedPage[]; warnings: string[] }> {
  const firstPage = await fetchHtmlPage(url, dependencies);
  const additional = await Promise.allSettled(
    relevantSameOriginLinks(firstPage).map((link) => fetchHtmlPage(link, dependencies)),
  );
  const pages = [firstPage];
  const warnings: string[] = [];

  for (const result of additional) {
    if (result.status === "fulfilled") {
      if (result.value.text) pages.push(result.value);
    } else {
      warnings.push(
        `One discovered page could not be read: ${
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        }`,
      );
    }
  }

  return { pages, warnings };
}

function sourceAuthority(source: BrandSourceInput): SourceAuthority {
  if (source.authority) return source.authority;
  if (source.kind === "reference") return "third-party";
  if (source.kind === "website" || source.kind === "profile") {
    return "official-public";
  }
  if (source.kind === "text") return "user-confirmed";
  return "first-party";
}

function decodeInlineData(data: string): { bytes: Uint8Array; mediaType?: string } {
  const dataUrl = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(data);
  const encoded = (dataUrl?.[2] ?? data).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error("Uploaded source data is not valid base64.");
  }

  const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_INLINE_FILE_BYTES) {
    throw new Error(`Uploaded source must be 1-${MAX_INLINE_FILE_BYTES} bytes.`);
  }
  return { bytes, mediaType: dataUrl?.[1].toLowerCase() };
}

export function detectMediaType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  const prefix = new TextDecoder("ascii").decode(bytes.slice(0, 6));
  if (prefix === "GIF87a" || prefix === "GIF89a") return "image/gif";
  if (new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-") {
    return "application/pdf";
  }
  if (bytes.length >= 12 && new TextDecoder("ascii").decode(bytes.slice(4, 8)) === "ftyp") {
    const brand = new TextDecoder("ascii").decode(bytes.slice(8, 12));
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["heif", "mif1", "msf1"].includes(brand)) return "image/heif";
  }
  return null;
}

function checksum(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function titleFor(source: BrandSourceInput, fallback: string): string {
  return source.title ?? ("fileName" in source ? source.fileName : fallback);
}

type CatalogueField =
  | "name"
  | "sku"
  | "category"
  | "description"
  | "price"
  | "currency"
  | "compareAtPrice"
  | "availability"
  | "url";

const catalogueHeaderAliases: Record<CatalogueField, string[]> = {
  name: ["product", "product name", "name", "item", "item name", "title"],
  sku: ["sku", "product id", "product code", "item code", "code"],
  category: ["category", "product category", "collection", "product type"],
  description: ["description", "product description", "details", "summary"],
  price: ["price", "selling price", "sale price", "retail price", "unit price", "msrp", "rrp"],
  currency: ["currency", "currency code"],
  compareAtPrice: ["compare at price", "compare-at price", "original price", "list price", "regular price"],
  availability: ["availability", "stock", "stock status", "inventory status", "status"],
  url: ["url", "link", "product url", "product link", "page url"],
};

function normaliseHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const catalogueFieldByHeader = new Map<string, CatalogueField>(
  Object.entries(catalogueHeaderAliases).flatMap(([field, aliases]) =>
    aliases.map((alias) => [normaliseHeader(alias), field as CatalogueField]),
  ),
);

function cleanCellText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function spreadsheetCellText(cell: { text: string; value: unknown }): string {
  const text = cleanCellText(cell.text ?? "");
  if (text) return text;

  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (["string", "number", "boolean"].includes(typeof value)) {
    return cleanCellText(String(value));
  }
  if (typeof value === "object") {
    const item = value as {
      result?: unknown;
      text?: unknown;
      hyperlink?: unknown;
      richText?: Array<{ text?: unknown }>;
    };
    if (item.result !== undefined && item.result !== null) {
      return cleanCellText(String(item.result));
    }
    if (typeof item.text === "string") return cleanCellText(item.text);
    if (Array.isArray(item.richText)) {
      return cleanCellText(
        item.richText.map((part) => String(part.text ?? "")).join(""),
      );
    }
    if (typeof item.hyperlink === "string") return cleanCellText(item.hyperlink);
  }
  return "";
}

function parseCataloguePrice(value: string, rawValue: unknown): number | null {
  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue >= 0) {
    return rawValue;
  }
  const negative = /^\s*\(/.test(value) || /-\s*\d/.test(value);
  const numeric = value
    .replace(/\s/g, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "")
    .replace(/[^0-9.,-]/g, "")
    .replace(/,(?=\d{1,2}$)/, ".")
    .replace(/,/g, "");
  const parsed = Number.parseFloat(numeric);
  return !negative && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normaliseCurrency(explicit: string, priceText: string): string | null {
  const combined = `${explicit} ${priceText}`.toUpperCase();
  const known: Array<[RegExp, string]> = [
    [/\b(?:MYR|RM)\b/, "MYR"],
    [/\bSGD\b|S\$/, "SGD"],
    [/\bAUD\b|A\$/, "AUD"],
    [/\bCAD\b|C\$/, "CAD"],
    [/\bUSD\b|US\$/, "USD"],
    [/\bEUR\b|€/, "EUR"],
    [/\bGBP\b|£/, "GBP"],
    [/\bJPY\b|¥/, "JPY"],
    [/\bINR\b|₹/, "INR"],
  ];
  const match = known.find(([pattern]) => pattern.test(combined));
  if (match) return match[1];
  const code = explicit.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function safeProductUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function cataloguePromptText(catalogue: ProductCatalogue): string {
  const lines = catalogue.products.slice(0, 100).map((product) => {
    const values = [
      `name=${JSON.stringify(product.name)}`,
      product.sku ? `sku=${JSON.stringify(product.sku)}` : "",
      product.category ? `category=${JSON.stringify(product.category)}` : "",
      product.price !== null ? `price=${product.price}` : "",
      product.currency ? `currency=${product.currency}` : "",
      product.compareAtPrice !== null ? `compareAtPrice=${product.compareAtPrice}` : "",
      product.availability ? `availability=${JSON.stringify(product.availability)}` : "",
      product.description ? `description=${JSON.stringify(product.description)}` : "",
    ].filter(Boolean);
    return `- ${values.join("; ")}`;
  });
  const omitted = catalogue.products.length - lines.length;
  return [
    `[PRODUCT CATALOGUE ${JSON.stringify(catalogue.fileName)}]`,
    `Parsed products: ${catalogue.products.length}`,
    ...lines,
    omitted > 0 ? `[${omitted} additional products omitted from model context]` : "",
  ].filter(Boolean).join("\n").slice(0, MAX_TEXT_PER_SOURCE);
}

export async function parseProductCatalogue(
  bytes: Uint8Array,
  sourceId: string,
  fileName: string,
): Promise<ProductCatalogue> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes));
  } catch {
    throw new Error("The product catalogue is not a readable .xlsx workbook.");
  }

  const products: ProductCatalogue["products"] = [];
  const warnings: string[] = [];
  let totalRows = 0;

  for (const worksheet of workbook.worksheets) {
    if (products.length >= MAX_CATALOGUE_PRODUCTS) break;
    let headerRowNumber = 0;
    let mappedHeaders = new Map<CatalogueField, number>();
    let originalHeaders = new Map<number, string>();

    for (
      let rowNumber = 1;
      rowNumber <= Math.min(worksheet.actualRowCount, MAX_HEADER_SCAN_ROWS);
      rowNumber += 1
    ) {
      const candidate = worksheet.getRow(rowNumber);
      const fields = new Map<CatalogueField, number>();
      const labels = new Map<number, string>();
      for (
        let column = 1;
        column <= Math.min(candidate.cellCount, MAX_CATALOGUE_COLUMNS);
        column += 1
      ) {
        const label = spreadsheetCellText(candidate.getCell(column));
        if (!label) continue;
        labels.set(column, label.slice(0, 160));
        const field = catalogueFieldByHeader.get(normaliseHeader(label));
        if (field && !fields.has(field)) fields.set(field, column);
      }
      if (fields.has("name")) {
        headerRowNumber = rowNumber;
        mappedHeaders = fields;
        originalHeaders = labels;
        break;
      }
    }

    if (!headerRowNumber) {
      warnings.push(`${worksheet.name}: no Product Name column was found; sheet skipped.`);
      continue;
    }
    if (!mappedHeaders.has("price")) {
      warnings.push(`${worksheet.name}: no Price column was found.`);
    }

    for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
      if (products.length >= MAX_CATALOGUE_PRODUCTS) break;
      const row = worksheet.getRow(rowNumber);
      const nameColumn = mappedHeaders.get("name")!;
      const name = spreadsheetCellText(row.getCell(nameColumn)).slice(0, 300);
      const rowHasValues = [...originalHeaders.keys()].some((column) =>
        Boolean(spreadsheetCellText(row.getCell(column))),
      );
      if (!rowHasValues) continue;
      totalRows += 1;
      if (!name) {
        if (warnings.length < 50) {
          warnings.push(`${worksheet.name} row ${rowNumber}: missing Product Name; row skipped.`);
        }
        continue;
      }

      const fieldText = (field: CatalogueField) => {
        const column = mappedHeaders.get(field);
        return column ? spreadsheetCellText(row.getCell(column)) : "";
      };
      const nullableText = (field: CatalogueField, maximum: number) =>
        fieldText(field).slice(0, maximum) || null;
      const priceColumn = mappedHeaders.get("price");
      const compareColumn = mappedHeaders.get("compareAtPrice");
      const priceText = fieldText("price");
      const currencyText = fieldText("currency");
      const attributes: Record<string, string> = {};

      for (const [column, label] of originalHeaders) {
        if ([...mappedHeaders.values()].includes(column)) continue;
        const value = spreadsheetCellText(row.getCell(column));
        if (value) attributes[label] = value.slice(0, 1_000);
      }

      products.push({
        name,
        sku: nullableText("sku", 160),
        category: nullableText("category", 300),
        description: nullableText("description", 2_000),
        price: priceColumn
          ? parseCataloguePrice(priceText, row.getCell(priceColumn).value)
          : null,
        currency: normaliseCurrency(currencyText, priceText),
        compareAtPrice: compareColumn
          ? parseCataloguePrice(fieldText("compareAtPrice"), row.getCell(compareColumn).value)
          : null,
        availability: nullableText("availability", 160),
        url: safeProductUrl(fieldText("url")),
        attributes,
        sheet: worksheet.name.slice(0, 160),
        sourceRow: rowNumber,
      });
    }
  }

  if (products.length >= MAX_CATALOGUE_PRODUCTS) {
    warnings.push(`Catalogue was limited to the first ${MAX_CATALOGUE_PRODUCTS} products.`);
  }
  if (products.length === 0) {
    const detail = warnings[0] ? ` ${warnings[0]}` : "";
    throw new Error(`No products could be read from the catalogue.${detail}`);
  }

  return {
    sourceId,
    fileName,
    sheetNames: workbook.worksheets.slice(0, 100).map((sheet) => sheet.name),
    totalRows,
    products,
    warnings: warnings.slice(0, 50),
  };
}

async function prepareFileSource(
  id: string,
  source: Extract<BrandSourceInput, { kind: "image" | "document" }>,
  dependencies: Required<SourcePreparationDependencies>,
): Promise<PreparedSource> {
  const inline = source.data ? decodeInlineData(source.data) : null;
  const remote = source.url
    ? await fetchPublicResource(source.url, MAX_REMOTE_FILE_BYTES, dependencies)
    : null;
  const bytes = inline?.bytes ?? remote?.bytes;
  if (!bytes) throw new Error("File source did not contain data.");

  const suppliedMediaType = inline?.mediaType ?? remote?.contentType;
  if (
    suppliedMediaType &&
    suppliedMediaType !== "application/octet-stream" &&
    suppliedMediaType !== source.mimeType
  ) {
    throw new Error(
      `File MIME type ${suppliedMediaType} does not match ${source.mimeType}.`,
    );
  }

  const detectedMediaType = detectMediaType(bytes);
  if (source.kind === "image" && detectedMediaType !== source.mimeType) {
    throw new Error("Uploaded image bytes do not match the declared MIME type.");
  }
  if (source.mimeType === "application/pdf" && detectedMediaType !== "application/pdf") {
    throw new Error("Uploaded PDF bytes do not contain a valid PDF signature.");
  }

  const authority = sourceAuthority(source);
  const origin = source.url ?? `upload://${encodeURIComponent(source.fileName)}`;
  const base = {
    id,
    kind: source.kind,
    label: source.label,
    title: titleFor(source, source.fileName),
    authority,
    origin,
    checksum: checksum(bytes),
    crawledUrls: source.url ? [source.url] : [],
    warnings: [] as string[],
  };

  if (source.kind === "document" && source.mimeType === XLSX_MIME_TYPE) {
    const productCatalogue = await parseProductCatalogue(bytes, id, source.fileName);
    return {
      ...base,
      text: cataloguePromptText(productCatalogue),
      hasFile: false,
      warnings: productCatalogue.warnings,
      productCatalogue,
    };
  }

  if (source.kind === "document" && source.mimeType !== "application/pdf") {
    const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const text =
      source.mimeType === "text/html"
        ? parseHtmlPage({
            url: source.url ?? "https://uploaded.invalid/document",
            bytes,
            contentType: "text/html",
          }).text
        : rawText.trim().slice(0, MAX_TEXT_PER_SOURCE);
    if (!text) throw new Error("Uploaded document did not contain readable text.");
    return { ...base, text, hasFile: false };
  }

  return {
    ...base,
    hasFile: true,
    file: { data: bytes, mediaType: source.mimeType, filename: source.fileName },
  };
}

async function prepareOneSource(
  id: string,
  source: BrandSourceInput,
  dependencies: Required<SourcePreparationDependencies>,
): Promise<PreparedSource> {
  const authority = sourceAuthority(source);

  if (source.kind === "text") {
    return {
      id,
      kind: source.kind,
      label: source.label,
      title: titleFor(source, "Pasted brand context"),
      authority,
      origin: `user-input://${id}`,
      text: source.content,
      hasFile: false,
      warnings: [],
      checksum: checksum(source.content),
      crawledUrls: [],
    };
  }

  if (source.kind === "image" || source.kind === "document") {
    return prepareFileSource(id, source, dependencies);
  }

  const website = source.kind === "website";
  const { pages, warnings } = website
    ? await crawlWebsite(source.url, dependencies)
    : { pages: [await fetchHtmlPage(source.url, dependencies)], warnings: [] };
  const text = pages
    .map(
      (page) =>
        `[PAGE ${page.url}]\nTITLE: ${page.title}\nCONTENT: ${page.text}`,
    )
    .join("\n\n")
    .slice(0, MAX_TEXT_PER_SOURCE);

  if (!text) throw new Error("Source did not contain readable page content.");

  return {
    id,
    kind: source.kind,
    label: source.label,
    title: titleFor(source, pages[0].title),
    authority,
    origin: source.url,
    text,
    hasFile: false,
    warnings,
    checksum: checksum(text),
    crawledUrls: pages.map((page) => page.url),
  };
}

function contextSource(payload: BrandAnalystPayload): BrandSourceInput | null {
  if (!payload.context) return null;
  const entries = Object.entries(payload.context).filter(([, value]) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
  if (entries.length === 0) return null;

  const content = entries
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join("; ") : value}`)
    .join("\n");

  return {
    id: "user-context",
    kind: "text",
    label: "user-confirmed-context",
    title: "User-confirmed brand context",
    authority: "user-confirmed",
    content,
  };
}

function assignSourceIds(sources: BrandSourceInput[]): Array<{
  id: string;
  source: BrandSourceInput;
}> {
  const used = new Set<string>();
  return sources.map((source, index) => {
    const base = source.id ?? `source-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    return { id, source };
  });
}

export async function prepareBrandSources(
  payload: BrandAnalystPayload,
  dependencyOverrides: SourcePreparationDependencies = {},
): Promise<PreparedSources> {
  const dependencies: Required<SourcePreparationDependencies> = {
    fetch: dependencyOverrides.fetch ?? fetch,
    resolveHost: dependencyOverrides.resolveHost ?? defaultResolveHost,
  };
  const context = contextSource(payload);
  const inputs = context ? [context, ...payload.sources] : payload.sources;
  const identified = assignSourceIds(inputs);
  const settled = await Promise.allSettled(
    identified.map(({ id, source }) => prepareOneSource(id, source, dependencies)),
  );

  const prepared: PreparedSource[] = [];
  const reports: SourceReport[] = [];
  const seenChecksums = new Set<string>();
  let totalFileBytes = 0;
  let remainingText = MAX_TOTAL_TEXT;

  settled.forEach((result, index) => {
    const { id, source } = identified[index];
    const fallbackTitle = titleFor(
      source,
      "url" in source && source.url ? source.url : `Source ${index + 1}`,
    );

    if (result.status === "rejected") {
      reports.push({
        id,
        kind: source.kind,
        label: source.label,
        title: fallbackTitle,
        status: "failed",
        warnings: [
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        ],
      });
      return;
    }

    const item = result.value;
    if (seenChecksums.has(item.checksum)) {
      reports.push({
        id,
        kind: item.kind as SourceReport["kind"],
        label: item.label,
        title: item.title,
        status: "partial",
        warnings: ["Duplicate content was skipped."],
      });
      return;
    }

    if (item.file) {
      totalFileBytes += item.file.data.byteLength;
      if (totalFileBytes > MAX_TOTAL_FILE_BYTES) {
        reports.push({
          id,
          kind: item.kind as SourceReport["kind"],
          label: item.label,
          title: item.title,
          status: "failed",
          warnings: ["Combined uploads exceed the total file limit."],
        });
        return;
      }
    }

    if (item.text) {
      if (remainingText <= 0) {
        reports.push({
          id,
          kind: item.kind as SourceReport["kind"],
          label: item.label,
          title: item.title,
          status: "failed",
          warnings: ["Combined source text exceeds the analysis limit."],
        });
        return;
      }
      if (item.text.length > remainingText) {
        item.text = item.text.slice(0, remainingText);
        item.warnings.push("Source text was truncated to fit the analysis limit.");
      }
      remainingText -= item.text.length;
    }

    seenChecksums.add(item.checksum);
    prepared.push(item);
    reports.push({
      id,
      kind: item.kind as SourceReport["kind"],
      label: item.label,
      title: item.title,
      status: item.warnings.length ? "partial" : "processed",
      warnings: item.warnings,
    });
  });

  return {
    sources: prepared,
    reports,
    crawledUrls: [...new Set(prepared.flatMap((source) => source.crawledUrls))],
    productCatalogues: prepared.flatMap((source) =>
      source.productCatalogue ? [source.productCatalogue] : [],
    ),
  };
}
