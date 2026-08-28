"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  UploadCloud,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ImportPreview {
  ok: boolean;
  action?: "preview" | "import";
  error?: string;
  imported?: number;
  replaced?: number;
  errors?: string[];
  warnings?: string[];
  summary?: {
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
  };
  sample?: Array<{
    date: string;
    channel: string;
    format: string;
    pillar: string;
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
  }>;
}

const TEMPLATE = [
  "date,channel,format,pillar,impressions,clicks,spend,conversions",
  "2026-08-01,Instagram,Reel,Founder story,1000,50,0,5",
  "2026-08-01,LinkedIn,Carousel,Education,500,20,12.50,2",
].join("\n");

function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export function MetricsImporter({ brandId, brandName }: { brandId: string; brandName: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [pending, setPending] = useState<"preview" | "import" | null>(null);

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "northwind-social-metrics-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function submit(action: "preview" | "import") {
    if (!file) return;
    setPending(action);
    if (action === "preview") setResult(null);
    try {
      const body = new FormData();
      body.set("brandId", brandId);
      body.set("action", action);
      body.set("mode", mode);
      body.set("file", file);
      const response = await fetch("/api/digest/import", { method: "POST", body });
      const payload = await response.json() as ImportPreview;
      setResult(payload);
      if (response.ok && action === "import") router.refresh();
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setPending(null);
    }
  }

  const validPreview = result?.ok && result.action === "preview" && result.summary;

  return (
    <section className="card metrics-importer">
      <div className="metrics-import-head">
        <div>
          <div className="card-note">Owned performance · {brandName}</div>
          <h2 className="section-title">Import social metrics</h2>
          <p>Upload a CSV or XLSX export. Northwind validates every row before anything reaches Neon.</p>
        </div>
        <button className="button button-ghost" type="button" onClick={downloadTemplate}>
          <Download size={13} /> Download template
        </button>
      </div>

      <div className="metrics-import-grid">
        <div>
          <label className="upload-zone metrics-upload-zone">
            <UploadCloud size={21} />
            <strong>{file ? file.name : "Choose a CSV or XLSX file"}</strong>
            <span>Maximum 10 MB and 5,000 data rows</span>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </label>
          <div className="metrics-import-options">
            <label>
              <input
                type="radio"
                name="metric-import-mode"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
              />
              <span><strong>Replace period</strong>Remove existing rows for the imported channels and date range first.</span>
            </label>
            <label>
              <input
                type="radio"
                name="metric-import-mode"
                checked={mode === "append"}
                onChange={() => setMode("append")}
              />
              <span><strong>Append rows</strong>Keep existing data. Use only when this file contains new records.</span>
            </label>
          </div>
          <div className="metrics-import-actions">
            <button
              className="button button-dark"
              type="button"
              disabled={!file || pending !== null}
              onClick={() => submit("preview")}
            >
              {pending === "preview" ? <LoaderCircle className="spin" size={13} /> : <FileSpreadsheet size={13} />}
              Validate file
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={!validPreview || pending !== null}
              onClick={() => submit("import")}
            >
              {pending === "import" ? <LoaderCircle className="spin" size={13} /> : <CheckCircle2 size={13} />}
              Import validated rows
            </button>
          </div>
        </div>

        <div className="metrics-format-card">
          <strong>Required columns</strong>
          <code>date · channel · impressions · clicks · spend · conversions</code>
          <p>Use <b>0</b> when a measurement is genuinely not applicable. Do not leave it blank. Format and pillar are optional and become “Unclassified.”</p>
        </div>
      </div>

      {result && (
        <div className={`metrics-import-result ${result.ok ? "success" : "error"}`} aria-live="polite">
          <div className="metrics-result-title">
            {result.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <strong>
              {result.ok && result.action === "import"
                ? `${result.imported ?? 0} rows imported`
                : result.ok
                  ? "File is valid and ready to import"
                  : "This file needs attention"}
            </strong>
          </div>
          {result.error && <p>{result.error}</p>}
          {result.summary && (
            <div className="metrics-preview-stats">
              <span><b>{result.summary.rows.toLocaleString()}</b> rows</span>
              <span><b>{result.summary.channels.join(", ")}</b> channels</span>
              <span><b>{dateLabel(result.summary.from)} – {dateLabel(result.summary.to)}</b> period</span>
              {result.action === "import" && result.replaced !== undefined && result.replaced > 0 && (
                <span><b>{result.replaced}</b> previous rows replaced</span>
              )}
            </div>
          )}
          {(result.errors ?? []).map((message) => <p className="metrics-error-line" key={message}>{message}</p>)}
          {(result.warnings ?? []).map((message) => <p className="metrics-warning-line" key={message}>{message}</p>)}
          {result.sample && result.sample.length > 0 && (
            <div className="metrics-table-wrap">
              <table className="metrics-preview-table">
                <thead><tr><th>Date</th><th>Channel</th><th>Format</th><th>Impressions</th><th>Clicks</th><th>Spend</th><th>Conversions</th></tr></thead>
                <tbody>{result.sample.map((row, index) => <tr key={`${row.date}-${row.channel}-${index}`}>
                  <td>{dateLabel(row.date)}</td><td>{row.channel}</td><td>{row.format}</td><td>{row.impressions.toLocaleString()}</td><td>{row.clicks.toLocaleString()}</td><td>{row.spend.toLocaleString()}</td><td>{row.conversions.toLocaleString()}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
