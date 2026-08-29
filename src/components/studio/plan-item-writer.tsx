"use client";

import { useState } from "react";
import { Check, Copy, ImageIcon, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import type { BrandAuditReport, Channel, TextVariant } from "@/lib/agents/copywriter/schema";

type ImageState = {
  url: string;
  mimeType: string;
} | null;

const angleLabels: Record<string, string> = {
  "pain-led": "Starts with the worry",
  "proof-led": "Starts with the proof",
  "contrarian": "Challenges the usual advice",
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
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let event: {
      type?: string;
      output?: { result?: T };
      error?: { message?: string };
    };
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

export function PlanItemWriter({
  brandId,
  channel,
  channelNote,
  brief,
  imageBrief,
}: {
  brandId: string;
  channel: Channel;
  channelNote: string;
  brief: string;
  imageBrief: string;
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

  async function write() {
    setTextStatus("working");
    setTextError("");
    try {
      const result = await runAgentRoute<{ kind: "text"; variants: TextVariant[]; brandAudit?: BrandAuditReport[] }>({
        brandId,
        payload: { mode: "text", channel, brief },
      });
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
        payload: {
          mode: "image",
          briefText: imageBrief,
          posterSource: chosen.body,
        },
      });
      setImage({ url: result.imageUrl, mimeType: result.mimeType });
      setPosterAudit(result.brandAudit?.[0] ?? null);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : String(error));
    } finally {
      setImageStatus("idle");
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

  function variantText(variant: TextVariant): string {
    return [
      variant.subject ? `Subject: ${variant.subject}` : "",
      variant.preheader ? `Preheader: ${variant.preheader}` : "",
      variant.body,
      variant.hashtags?.length ? variant.hashtags.join(" ") : "",
    ].filter(Boolean).join("\n\n");
  }

  const selectedAudit = brandAudit.find((audit) => audit.angle === variants[selected]?.angle) ?? null;

  return (
    <section className="writer">
      <div className="writer-bar">
        <button
          type="button"
          className="button button-dark"
          onClick={() => void write()}
          disabled={textStatus === "working"}
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
          disabled={imageStatus === "working" || variants.length === 0}
          title={variants.length === 0
            ? "Write the post first so the poster can carry its words"
            : undefined}
        >
          {imageStatus === "working"
            ? <><LoaderCircle size={13} /> Making the poster…</>
            : <><ImageIcon size={13} /> Make the poster</>}
        </button>
      </div>

      {channelNote && <p className="writer-note">{channelNote}</p>}
      {textError && <p className="writer-error">{textError}</p>}

      {variants.length === 0 && textStatus === "idle" && !textError && (
        <div className="writer-empty">
          <Sparkles size={17} />
          <p>
            The Copywriter writes three versions of this exact post from the
            plan — one starting with the worry, one with the proof, and one that
            challenges the usual advice. Pick the one that sounds like you, then
            make a poster that carries its words in your brand colours.
          </p>
        </div>
      )}

      {variants.length > 0 && (
        <div className="writer-variants">
          {variants.map((variant, index) => (
            <article
              key={variant.angle}
              className={`card variant-card ${selected === index ? "selected" : ""}`}
            >
              <div className="variant-top">
                <div>
                  <div className="variant-angle">Version {String.fromCharCode(65 + index)}</div>
                  <span className={`tag ${selected === index ? "tag-lime" : ""}`} style={{ marginTop: 7 }}>
                    {angleLabels[variant.angle] ?? variant.angle}
                  </span>
                </div>
              </div>
              {variant.subject && (
                <div className="writer-subject">
                  <b>Subject</b>{variant.subject}
                </div>
              )}
              <div className="post-copy">{variant.body}</div>
              {variant.hashtags && variant.hashtags.length > 0 && (
                <div className="writer-hashtags">{variant.hashtags.join(" ")}</div>
              )}
              {(() => {
                const audit = brandAudit.find((item) => item.angle === variant.angle);
                if (!audit) return null;
                return (
                  <div className="writer-score-card" style={{ marginTop: 14 }}>
                    <div className="writer-score-header">
                      <strong>Brand fit</strong>
                      <span>{audit.overallScore}/100</span>
                    </div>
                    <div className="writer-score-grid">
                      {audit.criteria.map((criterion) => (
                        <div key={criterion.criterion} className="writer-score-row">
                          <span>{criterion.criterion}</span>
                          <b>{criterion.score}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="variant-actions">
                <button
                  type="button"
                  className={`button ${selected === index ? "button-primary" : "button-ghost"}`}
                  style={{ flex: 1 }}
                  onClick={() => setSelected(index)}
                >
                  {selected === index ? <><Check size={12} /> Using this</> : "Use this"}
                </button>
                <button
                  type="button"
                  className="button button-ghost icon-button"
                  aria-label="Copy this version"
                  onClick={() => void copy(variantText(variant), index)}
                >
                  {copied === index ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedAudit && (
        <div className="writer-brand-report" style={{ marginTop: 18 }}>
          <div className="kernel-field-label">Brand judge</div>
          <div className="writer-score-header">
            <strong>{selectedAudit.angle}</strong>
            <span>{selectedAudit.overallScore}/100</span>
          </div>
          <div className="writer-score-grid">
            {selectedAudit.criteria.map((criterion) => (
              <div key={criterion.criterion} className="writer-score-row">
                <span>{criterion.criterion}</span>
                <b>{criterion.score}</b>
              </div>
            ))}
          </div>
          <ul className="writer-score-notes">
            {selectedAudit.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </div>
      )}

      {(image || imageError) && (
        <div className="writer-image">
          <div className="kernel-field-label">Poster</div>
          {imageError
            ? <p className="writer-error">{imageError}</p>
            : image && (
              // The generated file is served from blob storage, so a plain img
              // keeps this independent of the Next image loader's host config.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.url} alt="Generated campaign image" />
            )}
          {posterAudit && (
            <div className="writer-score-card" style={{ marginTop: 13 }}>
              <div className="writer-score-header">
                <span>Brand Judge · poster wording</span>
                <b className={posterAudit.passed ? "pass" : "fail"}>
                  {posterAudit.overallScore}/100
                </b>
              </div>
              <div className="writer-score-grid">
                {posterAudit.criteria.map((criterion) => (
                  <div key={criterion.criterion} className="writer-score-row">
                    <span>{criterion.criterion}</span>
                    <b>{criterion.score}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
