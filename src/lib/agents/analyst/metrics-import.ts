import ExcelJS from "@excel.js/exceljs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5_000;
const MAX_REPORTED_ERRORS = 50;

const HEADER_ALIASES = {
  date: ["date", "day", "publishdate", "publisheddate"],
  channel: ["channel", "platform", "network", "socialnetwork"],
  format: ["format", "contenttype", "posttype", "mediatype"],
  pillar: ["pillar", "contentpillar", "campaignpillar"],
  impressions: ["impressions"],
  clicks: ["clicks", "linkclicks", "linkclick"],
  spend: ["spend", "adspend", "amountspent", "cost"],
  conversions: ["conversions", "conversion", "purchases", "leads"],
} as const;

type ImportField = keyof typeof HEADER_ALIASES;

export interface MetricImportRow {
  date: Date;
  channel: string;
  format: string;
  pillar: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  source: string;
  rowNumber: number;
}

export interface MetricImportSummary {
  rows: number;
  channels: string[];
  from: string | null;
  to: string | null;
  totals: {
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
  };
}

export interface MetricImportResult {
  rows: MetricImportRow[];
  errors: string[];
  warnings: string[];
  summary: MetricImportSummary;
}

function normalizedHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function displayValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "").trim();
}

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted value.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function excelDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "number") return excelDate(value);

  const raw = displayValue(value);
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/.exec(raw);
  if (!iso) return null;
  const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  if (
    date.getUTCFullYear() !== Number(iso[1])
    || date.getUTCMonth() !== Number(iso[2]) - 1
    || date.getUTCDate() !== Number(iso[3])
  ) return null;
  return date;
}

function parseMetricNumber(value: unknown, integer: boolean): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) return null;
    return value;
  }
  const raw = displayValue(value).replace(/[$,\s]/g, "");
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) return null;
  return parsed;
}

function columnsFor(headers: unknown[]): Partial<Record<ImportField, number>> {
  const normalized = headers.map(normalizedHeader);
  return Object.fromEntries(
    Object.entries(HEADER_ALIASES).flatMap(([field, aliases]) => {
      const index = normalized.findIndex((header) => (aliases as readonly string[]).includes(header));
      return index >= 0 ? [[field, index]] : [];
    }),
  );
}

function nonEmptyRow(values: unknown[]): boolean {
  return values.some((value) => displayValue(value).length > 0);
}

function addError(errors: string[], message: string): void {
  if (errors.length < MAX_REPORTED_ERRORS) errors.push(message);
}

function parseTable(
  values: unknown[][],
  source: string,
  result: Pick<MetricImportResult, "rows" | "errors" | "warnings">,
): void {
  const headerIndex = values.findIndex(nonEmptyRow);
  if (headerIndex < 0) {
    result.warnings.push(`${source}: sheet is empty and was skipped.`);
    return;
  }

  const columns = columnsFor(values[headerIndex]);
  const required: ImportField[] = ["date", "channel", "impressions", "clicks", "spend", "conversions"];
  const missing = required.filter((field) => columns[field] === undefined);
  if (missing.length) {
    addError(result.errors, `${source}: missing required columns: ${missing.join(", ")}.`);
    return;
  }
  if (columns.format === undefined) {
    result.warnings.push(`${source}: no format column; imported rows will use “Unclassified”.`);
  }
  if (columns.pillar === undefined) {
    result.warnings.push(`${source}: no pillar column; imported rows will use “Unclassified”.`);
  }

  for (let index = headerIndex + 1; index < values.length; index += 1) {
    const valuesForRow = values[index];
    if (!nonEmptyRow(valuesForRow)) continue;
    const rowNumber = index + 1;
    const at = (field: ImportField) => {
      const column = columns[field];
      return column === undefined ? undefined : valuesForRow[column];
    };
    const date = parseDate(at("date"));
    const channel = displayValue(at("channel")).slice(0, 120);
    const format = displayValue(at("format")).slice(0, 120) || "Unclassified";
    const pillar = displayValue(at("pillar")).slice(0, 120) || "Unclassified";
    const impressions = parseMetricNumber(at("impressions"), true);
    const clicks = parseMetricNumber(at("clicks"), true);
    const spend = parseMetricNumber(at("spend"), false);
    const conversions = parseMetricNumber(at("conversions"), true);
    const rowErrors: string[] = [];

    if (!date) rowErrors.push("date must use YYYY-MM-DD or be an Excel date");
    if (!channel) rowErrors.push("channel is required");
    if (impressions === null) rowErrors.push("impressions must be a non-negative whole number");
    if (clicks === null) rowErrors.push("clicks must be a non-negative whole number");
    if (spend === null) rowErrors.push("spend must be a non-negative number");
    if (conversions === null) rowErrors.push("conversions must be a non-negative whole number");
    if (impressions !== null && clicks !== null && clicks > impressions) {
      rowErrors.push("clicks cannot exceed impressions");
    }
    if (clicks !== null && conversions !== null && conversions > clicks) {
      rowErrors.push("conversions cannot exceed clicks");
    }

    if (rowErrors.length) {
      addError(result.errors, `${source} row ${rowNumber}: ${rowErrors.join("; ")}.`);
      continue;
    }
    if (result.rows.length >= MAX_ROWS) {
      addError(result.errors, `Import exceeds the ${MAX_ROWS.toLocaleString()} row limit.`);
      return;
    }
    result.rows.push({
      date: date!,
      channel,
      format,
      pillar,
      impressions: impressions!,
      clicks: clicks!,
      spend: spend!,
      conversions: conversions!,
      source,
      rowNumber,
    });
  }
}

function summarize(rows: MetricImportRow[]): MetricImportSummary {
  const orderedDates = rows.map((row) => row.date.getTime()).sort((left, right) => left - right);
  return {
    rows: rows.length,
    channels: Array.from(new Set(rows.map((row) => row.channel))).sort(),
    from: orderedDates.length ? new Date(orderedDates[0]).toISOString() : null,
    to: orderedDates.length ? new Date(orderedDates[orderedDates.length - 1]).toISOString() : null,
    totals: rows.reduce(
      (totals, row) => ({
        impressions: totals.impressions + row.impressions,
        clicks: totals.clicks + row.clicks,
        spend: Math.round((totals.spend + row.spend) * 100) / 100,
        conversions: totals.conversions + row.conversions,
      }),
      { impressions: 0, clicks: 0, spend: 0, conversions: 0 },
    ),
  };
}

export async function parseMetricImport(fileName: string, bytes: Uint8Array): Promise<MetricImportResult> {
  const result: MetricImportResult = {
    rows: [],
    errors: [],
    warnings: [],
    summary: summarize([]),
  };
  if (bytes.byteLength === 0) {
    result.errors.push("The selected file is empty.");
    return result;
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    result.errors.push("The selected file exceeds the 10 MB limit.");
    return result;
  }

  const extension = fileName.toLowerCase().split(".").pop();
  try {
    if (extension === "csv") {
      const table = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      parseTable(table, fileName, result);
    } else if (extension === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes);
      for (const worksheet of workbook.worksheets) {
        const table: unknown[][] = [];
        for (let rowNumber = 1; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
          const row = worksheet.getRow(rowNumber);
          const values: unknown[] = [];
          for (let column = 1; column <= row.cellCount; column += 1) {
            const cell = row.getCell(column);
            values.push(cell.value ?? cell.text);
          }
          table.push(values);
        }
        parseTable(table, worksheet.name, result);
      }
    } else {
      result.errors.push("Unsupported file. Upload a .csv or .xlsx file.");
    }
  } catch (error) {
    result.errors.push(`Could not read the file: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (result.errors.length >= MAX_REPORTED_ERRORS) {
    result.errors.push("Additional row errors were omitted. Fix the reported errors and validate again.");
  }
  if (result.rows.length === 0 && result.errors.length === 0) {
    result.errors.push("No metric rows were found.");
  }
  result.summary = summarize(result.rows);
  return result;
}

export function serializableMetricImport(result: MetricImportResult) {
  return {
    errors: result.errors,
    warnings: result.warnings,
    summary: result.summary,
    sample: result.rows.slice(0, 5).map((row) => ({
      ...row,
      date: row.date.toISOString(),
    })),
  };
}
