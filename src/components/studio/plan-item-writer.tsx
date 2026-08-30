"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  ImageIcon,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type {
  BrandAuditReport,
  Channel,
  ScriptGenerationResult,
  TextVariant,
} from "@/lib/agents/copywriter/schema";

const BLANK_LINE = String.fromCharCode(10, 10);
const NEWLINE = String.fromCharCode(10);

type ImageState = { url: string; mimeType: string } | null;
type Tab = "post" | "poster" | "script";

const angleLabels: Record<string, string> = {
  "pain-led": "Starts with the worry",
  "proof-led": "Starts with the proof",
  "contrarian": "Challenges the usual advice",
};

const criterionLabels: Record<string, string> = {
  voice: "Voice",
  claims: "Claim safety",
  channel: "Channel fit",
  positioning: "Positioning",
  audience: "Audience",
  proof: "Evidence",
  tone: "Tone",
  visual: "Brand look",
  legibility: "Readability",
  spelling: "Spelling",
};

/** Reads the agent route's NDJSON stream and returns the final result. */
async function runAgentRoute<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let result: T | null = null;
  let failure = "";
  for (const line of text.split(NEWLINE)) {
    if (!line.trim()) continue;
    let event: { type?: string; output?: { result?: T }; error?: { message?: string } };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "done" && event.output?.result) result = event.output.result;
    if (event.type === "error") failure = event.error?.message ?? "The Copywriter failed.";
  }
  if (result) return result;
  throw new Error(failure || "The Copywriter returned nothing to use.");
}

/**
 * The verdict is a headline number with the working folded away. Seven scored
 * rows under every draft turned the page into a wall to scroll past.
 */
function ScoreCard({ audit }: { audit: BrandAuditReport }) {
  const failing = audit.criteria.filter((criterion) => !criterion.passed);
  return (
    <details className="score-card">
      <summary>
        <span>Brand judge</span>
        <b className={audit.passed ? "pass" : "fail"}>
          {audit.overallScore}<small>/100</small>
        </b>
        {failing.length > 0 && <em>{failing.length} to check</em>}
        <ChevronDown size={13} />
      </summary>
      <div className="score-list">
        {audit.criteria.map((criterion) => (
          <div
            key={criterion.criterion}
            className={`score-row ${criterion.passed ? "" : "failed"}`}
          >
            <div className="score-row-top">
              <span>{criterionLabels[criterion.criterion] ?? criterion.criterion}</span>
              <i><em style={{ width: `${criterion.score}%` }} /></i>
              <b>{criterion.score}</b>
            </div>
            {criterion.reasons[0] && <p>{criterion.reasons[0]}</p>}
          </div>
        ))}
      </div>
      {!audit.passed && audit.notes.length > 0 && (
        <p className="score-warning">{audit.notes[audit.notes.length - 1]}</p>
      )}
    </details>
  );
}

export function PlanItemWriter({
  brandId,
  channel,
  channelNote,
  brief,
  imageBrief,
  scriptBrief,
  needsScript,
}: {
  brandId: string;
  channel: Channel;
  channelNote: string;
  brief: string;
  imageBrief: string;
  scriptBrief: string;
  needsScript: boolean;
}) {
  const [variants, setVariants] = useState<TextVariant[]>([]);
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(-1);
  const [brandAudit, setBrandAudit] = useState<BrandAuditReport[]>([]);
  const [textStatus, setTextStatus] = useState<"idle" | "working">("idle");
  const [textError, setTextError] = useState("");
  const [image, setImage] = useState<ImageState>(null);
  const [imageStatus, setImageStatus] = useState<"idle" | "working">("idle");
  const [imageError, setImageError] = useState("");
  const [posterAudit, setPosterAudit] = useState<BrandAuditReport | null>(null);
  const [script, setScript] = useState<ScriptGenerationResult | null>(null);
  const [scriptStatus, setScriptStatus] = useState<"idle" | "working">("idle");
  const [scriptError, setScriptError] = useState("");
  const [tab, setTab] = useState<Tab>("post");

  async function write() {
    setTextStatus("working");
    setTextError("");
    setTab("post");
    try {
      const result = await runAgentRoute<{
        kind: "text";
        variants: TextVariant[];
        brandAudit?: BrandAuditReport[];
      }>({ brandId, payload: { mode: "text", channel, brief } });
      setVariants(result.variants);
      setBrandAudit(result.brandAudit ?? []);
      setSelected(0);
    } catch (error) {
      setTextError(error instanceof Error ? error.message : String(error));
    } finally {
      setTextStatus("idle");
    }
  }

  async function makeImage() {
    const chosen = variants[selected];
    if (!chosen) return;
    setImageStatus("working");
    setImageError("");
    setPosterAudit(null);
    setTab("poster");
    try {
      // The Copywriter compresses the chosen caption into poster wording, so
      // the artwork says the same thing in far fewer words.
      const result = await runAgentRoute<{
        kind: "image";
        imageUrl: string;
        mimeType: string;
        brandAudit?: BrandAuditReport[];
      }>({
        brandId,
        payload: { mode: "image", briefText: imageBrief, posterSource: chosen.body },
      });
      setImage({ url: result.imageUrl, mimeType: result.mimeType });
      setPosterAudit(result.brandAudit?.[0] ?? null);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : String(error));
    } finally {
      setImageStatus("idle");
    }
  }

  async function writeScript() {
    setScriptStatus("working");
    setScriptError("");
    setTab("script");
    try {
      setScript(await runAgentRoute<ScriptGenerationResult>({
        brandId,
        payload: { mode: "script", brief: scriptBrief },
      }));
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : String(error));
    } finally {
      setScriptStatus("idle");
    }
  }

  async function copy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      window.setTimeout(() => setCopied(-1), 1_800);
    } catch {
      setCopied(-1);
    }
  }

  function variantText(entry: TextVariant): string {
    return [
      entry.subject ? `Subject: ${entry.subject}` : "",
      entry.preheader ? `Preheader: ${entry.preheader}` : "",
      entry.body,
      entry.hashtags?.length ? entry.hashtags.join(" ") : "",
    ].filter(Boolean).join(BLANK_LINE);
  }

  function scriptText(value: ScriptGenerationResult): string {
    return [
      `HOOK: ${value.hook}`,
      ...value.scenes.map((scene, index) =>
        `${index + 1}. (${scene.seconds}s) ${scene.shot}${NEWLINE}   Action: ${scene.action}${NEWLINE}   Say/show: ${scene.saidOrShown}`),
      `CALL TO ACTION: ${value.callToAction}`,
      value.shoppingList.length ? `BEFORE YOU FILM: ${value.shoppingList.join(", ")}` : "",
    ].filter(Boolean).join(BLANK_LINE);
  }

  const variant = variants[selected];
  const variantAudit = brandAudit.find((audit) => audit.angle === variant?.angle);
  const busy = textStatus === "working" || imageStatus === "working" || scriptStatus === "working";
  const tabs: Array<{ id: Tab; label: string; ready: boolean }> = [
    { id: "post", label: "Post", ready: variants.length > 0 },
    { id: "poster", label: "Poster", ready: Boolean(image || imageError) },
    ...(needsScript
      ? [{ id: "script" as Tab, label: "Script", ready: Boolean(script || scriptError) }]
      : []),
  ];

  return (
    <section className="writer">
      <div className="writer-bar">
        <button
          type="button"
          className="button button-dark"
          onClick={() => void write()}
          disabled={busy}
        >
          {textStatus === "working"
            ? <><LoaderCircle size={13} /> Writing…</>
            : variants.length > 0
              ? <><RefreshCw size={13} /> Write again</>
              : <><Sparkles size={13} /> Write this post</>}
        </button>
        <button
          type="button"
          className="button button-ghost"
          onClick={() => void makeImage()}
          disabled={busy || variants.length === 0}
          title={variants.length === 0 ? "Write the post first" : undefined}
        >
          {imageStatus === "working"
            ? <><LoaderCircle size={13} /> Making the poster…</>
            : <><ImageIcon size={13} /> Make the poster</>}
        </button>
        {needsScript && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void writeScript()}
            disabled={busy}
          >
            {scriptStatus === "working"
              ? <><LoaderCircle size={13} /> Writing the script…</>
              : <><Clapperboard size={13} /> Write the video script</>}
          </button>
        )}
      </div>

      {(needsScript || channelNote) && (
        <p className="writer-note">
          {needsScript && "The plan asks for a video here, so a shot-by-shot script is available. "}
          {channelNote}
        </p>
      )}

      {variants.length === 0 && textStatus === "idle" && !textError && (
        <div className="writer-empty">
          <Sparkles size={17} />
          <p>
            The Copywriter writes three versions of this post from the plan, then
            a poster carrying its words in your brand colours. Everything is
            checked against Brand Memory before you see it.
          </p>
        </div>
      )}

      {textError && <p className="writer-error">{textError}</p>}

      {tabs.some((entry) => entry.ready) && (
        <div className="writer-tabs" role="tablist">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={tab === entry.id ? "active" : ""}
              onClick={() => setTab(entry.id)}
              disabled={!entry.ready}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      {tab === "post" && variant && (
        <div className="writer-panel">
          <div className="version-pills">
            {variants.map((entry, index) => {
              const audit = brandAudit.find((item) => item.angle === entry.angle);
              return (
                <button
                  key={entry.angle}
                  type="button"
                  className={selected === index ? "active" : ""}
                  onClick={() => setSelected(index)}
                >
                  <b>{angleLabels[entry.angle] ?? entry.angle}</b>
                  {audit && <em>{audit.overallScore}</em>}
                </button>
              );
            })}
          </div>

          {variant.subject && (
            <div className="writer-subject"><b>Subject</b>{variant.subject}</div>
          )}
          <div className="post-copy">{variant.body}</div>
          {variant.hashtags && variant.hashtags.length > 0 && (
            <div className="writer-hashtags">{variant.hashtags.join(" ")}</div>
          )}

          <div className="panel-actions">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void copy(variantText(variant), selected)}
            >
              {copied === selected
                ? <><Check size={13} /> Copied</>
                : <><Copy size={13} /> Copy this version</>}
            </button>
          </div>

          {variantAudit && <ScoreCard audit={variantAudit} />}
        </div>
      )}

      {tab === "poster" && (image || imageError) && (
        <div className="writer-panel">
          {imageError
            ? <p className="writer-error">{imageError}</p>
            : image && (
              // Served from blob storage or the media route, so a plain img
              // keeps this independent of the Next image loader's host config.
              // eslint-disable-next-line @next/next/no-img-element
              <img className="poster-image" src={image.url} alt="Generated campaign poster" />
            )}
          {posterAudit && <ScoreCard audit={posterAudit} />}
        </div>
      )}

      {tab === "script" && (script || scriptError) && (
        <div className="writer-panel">
          {scriptError && <p className="writer-error">{scriptError}</p>}
          {script && (
            <>
              <div className="script-head">
                <span>About {script.totalSeconds} seconds · {script.scenes.length} shots</span>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => void copy(scriptText(script), -2)}
                >
                  {copied === -2
                    ? <><Check size={13} /> Copied</>
                    : <><Copy size={13} /> Copy script</>}
                </button>
              </div>
              <p className="script-hook">{script.hook}</p>
              <ol className="script-scenes">
                {script.scenes.map((scene, index) => (
                  <li key={index}>
                    <b>{scene.seconds}s · {scene.shot}</b>
                    <span>{scene.action}</span>
                    <em>&ldquo;{scene.saidOrShown}&rdquo;</em>
                  </li>
                ))}
              </ol>
              <p className="script-cta">{script.callToAction}</p>
              {script.shoppingList.length > 0 && (
                <p className="script-list">
                  <b>Before you film:</b> {script.shoppingList.join(" · ")}
                </p>
              )}
              {script.brandAudit?.[0] && <ScoreCard audit={script.brandAudit[0]} />}
            </>
          )}
        </div>
      )}
    </section>
  );
}
