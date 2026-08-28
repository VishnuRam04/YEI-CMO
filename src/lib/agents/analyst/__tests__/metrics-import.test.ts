import ExcelJS from "@excel.js/exceljs";
import { describe, expect, it } from "vitest";
import { parseMetricImport } from "../metrics-import";

describe("social metrics import", () => {
  it("parses a valid CSV without changing metric meanings", async () => {
    const csv = [
      "date,channel,format,pillar,impressions,clicks,spend,conversions",
      "2026-08-20,Instagram,Reel,Founder story,1000,50,0,5",
      "2026-08-21,LinkedIn,Carousel,Education,500,20,12.50,2",
    ].join("\n");

    const result = await parseMetricImport("metrics.csv", new TextEncoder().encode(csv));

    expect(result.errors).toEqual([]);
    expect(result.summary).toMatchObject({
      rows: 2,
      channels: ["Instagram", "LinkedIn"],
      totals: { impressions: 1500, clicks: 70, spend: 12.5, conversions: 7 },
    });
    expect(result.rows[0]).toMatchObject({ format: "Reel", pillar: "Founder story" });
  });

  it("reports missing required measurements instead of assuming zero", async () => {
    const csv = [
      "date,channel,impressions,clicks",
      "2026-08-20,Instagram,1000,50",
    ].join("\n");

    const result = await parseMetricImport("metrics.csv", new TextEncoder().encode(csv));

    expect(result.errors[0]).toContain("spend, conversions");
    expect(result.rows).toEqual([]);
  });

  it("uses explicit Unclassified labels when optional dimensions are absent", async () => {
    const csv = [
      "date,channel,impressions,clicks,spend,conversions",
      "2026-08-20,Instagram,1000,50,0,5",
    ].join("\n");

    const result = await parseMetricImport("metrics.csv", new TextEncoder().encode(csv));

    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ format: "Unclassified", pillar: "Unclassified" });
  });

  it("reads XLSX workbooks", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Organic");
    worksheet.addRow(["date", "platform", "format", "pillar", "impressions", "clicks", "spend", "conversions"]);
    worksheet.addRow([new Date("2026-08-20T00:00:00.000Z"), "YouTube", "Video", "Proof", 2000, 100, 0, 8]);
    const buffer = await workbook.xlsx.writeBuffer();

    const result = await parseMetricImport("metrics.xlsx", new Uint8Array(buffer));

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ channel: "YouTube", impressions: 2000 });
  });

  it("rejects impossible funnel values", async () => {
    const csv = [
      "date,channel,format,pillar,impressions,clicks,spend,conversions",
      "2026-08-20,Instagram,Reel,Proof,20,30,0,31",
    ].join("\n");

    const result = await parseMetricImport("metrics.csv", new TextEncoder().encode(csv));

    expect(result.errors[0]).toContain("clicks cannot exceed impressions");
    expect(result.errors[0]).toContain("conversions cannot exceed clicks");
  });
});
