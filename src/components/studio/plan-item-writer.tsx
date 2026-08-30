"use client";

import { useState } from "react";
import { Check, Clapperboard, Copy, ImageIcon, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import type {
  BrandAuditReport,
  Channel,
  ScriptGenerationResult,
  TextVariant,
} from "@/lib/agents/copywriter/schema";

const BLANK_LINE = String.fromCharCode(10, 10);

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

function ScoreCard({ title, audit }: { title: string; audit: BrandAuditReport }) {
  return (
    <section className="score-card">
      <header>
        <span>{title}</span>
        <b className={audit.passed ? "pass" : "fail"}>
          {audit.overallScore}<small>/100</small>
        </b>
      </header>
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
    </section>
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

  async function writeScript() {
    setScriptStatus("working");
    setScriptError("");
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

  function variantText(variant: TextVariant): string {
    return [
      variant.subject ? `Subject: ${variant.subject}` : "",
      variant.preheader ? `Preheader: ${variant.preheader}` : "",
      variant.body,
      variant.hashtags?.length ? variant.hashtags.join(" ") : "",
    ].filter(Boolean).join("\n\n");
  }


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
        {needsScript && (
          <button
            type="button"
            className="button button-ghost"
            onClick={() => void writeScript()}
            disabled={scriptStatus === "working"}
          >
            {scriptStatus === "working"
              ? <><LoaderCircle size={13} /> Writing the script…</>
              : <><Clapperboard size={13} /> Write the video script</>}
          </button>
        )}
      </div>

      {needsScript && (
        <p className="writer-note">
          The plan asks for a video here, so you can also get a shot-by-shot
          script to film from.
        </p>
      )}
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
                  <ScoreCard title="Brand judge" audit={audit} />
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


      {scriptError && <p className="writer-error">{scriptError}</p>}
      {script && (
        <section className="script-card">
          <header>
            <span>Video script · about {script.totalSeconds}s</span>
            <button
              type="button"
              className="button button-ghost icon-button"
              aria-label="Copy the script"
              onClick={() => void copy(
                [
                  `HOOK: ${script.hook}`,
                  ...script.scenes.map((scene, index) =>
                    `${index + 1}. (${scene.seconds}s) ${scene.shot}
   Action: ${scene.action}
   Say/show: ${scene.saidOrShown}`),
                  `CALL TO ACTION: ${script.callToAction}`,
                  script.shoppingList.length ? `BEFORE YOU FILM: ${script.shoppingList.join(", ")}` : "",
                ].filter(Boolean).join(BLANK_LINE),
                -2,
              )}
            >
              {copied === -2 ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </header>
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
          {script.brandAudit?.[0] && (
            <ScoreCard title="Brand judge · script" audit={script.brandAudit[0]} />
          )}
        </section>
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
          {posterAudit && <ScoreCard title="Brand judge · poster" audit={posterAudit} />}
        </div>
      )}
    </section>
  );
}
