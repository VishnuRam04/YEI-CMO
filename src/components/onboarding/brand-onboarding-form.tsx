"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  FileSpreadsheet,
  FileText,
  Globe2,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  MAX_LANGUAGE_GUIDANCE_CHARS,
  MAX_SOURCE_COUNT,
  type BrandAnalystResult,
  type InformationRequest,
} from "@/lib/agents/brand-analyst/schema";

type SourceKind = "website" | "profile" | "reference";
type Phase = "welcome" | "intake" | "analysing" | "questions" | "complete";

type UrlSource = {
  id: string;
  kind: SourceKind;
  label: string;
  url: string;
};

type ChatMessage = {
  id: string;
  role: "cmo" | "user";
  text: string;
};

type VisualAssetRole =
  | "primary-logo"
  | "alternate-logo"
  | "approved-visual-reference"
  | "product-photography"
  | "people-photography"
  | "brand-guidelines"
  | "avoid-visual-reference";

const visualAssetFields: ReadonlyArray<{
  role: VisualAssetRole;
  title: string;
  description: string;
  accept: string;
  multiple: boolean;
  authority: "first-party" | "user-confirmed";
}> = [
  { role: "primary-logo", title: "Primary logo", description: "Preferred master logo", accept: "image/png,image/jpeg,image/webp", multiple: false, authority: "first-party" },
  { role: "alternate-logo", title: "Alternate logos", description: "Dark, light or compact variants", accept: "image/png,image/jpeg,image/webp", multiple: true, authority: "first-party" },
  { role: "approved-visual-reference", title: "Approved campaign examples", description: "Instagram posts or campaign work to emulate", accept: "image/png,image/jpeg,image/webp,image/avif", multiple: true, authority: "user-confirmed" },
  { role: "product-photography", title: "Product photography", description: "Accurate packaging and product references", accept: "image/png,image/jpeg,image/webp,image/avif", multiple: true, authority: "first-party" },
  { role: "people-photography", title: "Founder or team photography", description: "Approved people and workplace imagery", accept: "image/png,image/jpeg,image/webp,image/avif", multiple: true, authority: "first-party" },
  { role: "brand-guidelines", title: "Brand guidelines", description: "The authoritative guidelines PDF", accept: "application/pdf", multiple: false, authority: "first-party" },
  { role: "avoid-visual-reference", title: "Examples to avoid", description: "Visual directions the brand should reject", accept: "image/png,image/jpeg,image/webp,image/avif", multiple: true, authority: "user-confirmed" },
] as const;

const emptyVisualAssets = (): Record<VisualAssetRole, File[]> => ({
  "primary-logo": [],
  "alternate-logo": [],
  "approved-visual-reference": [],
  "product-photography": [],
  "people-photography": [],
  "brand-guidelines": [],
  "avoid-visual-reference": [],
});

const steps = [
  { eyebrow: "Foundation", title: "Start with the essentials", description: "Give the system a clear identity and primary public source." },
  { eyebrow: "Evidence", title: "Add what the brand already knows", description: "First-party documents and approved language carry the most authority." },
  { eyebrow: "Visual kit", title: "Teach the system how the brand looks", description: "Separate approved references, exact assets and avoid-examples so visual rules retain their meaning." },
  { eyebrow: "Products", title: "Connect the commercial catalogue", description: "Optional for product businesses. Exact product and pricing data stays structured." },
  { eyebrow: "Strategy", title: "Frame the market and customer", description: "Help the CMO understand who matters, what you sell and how you compete." },
  { eyebrow: "Guardrails", title: "Set the boundaries", description: "Confirm claims risk, approved language and anything agents must never assume." },
] as const;

const splitList = (value: string) =>
  value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

const fieldLabels: Record<string, string> = {
  markets: "Markets",
  audiences: "Priority audiences",
  priorities: "Marketing priorities",
  competitors: "Competitors",
  regulatedDomains: "Regulated domains",
  fontNames: "Font names",
  requiredWords: "Required language",
  bannedWords: "Banned language",
  disclaimers: "Legal disclaimers",
};

function wordsForError(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) =>
    letter.toUpperCase());
}

function validationDetail(detail: string | undefined): string | null {
  if (!detail) return null;
  try {
    const issues = JSON.parse(detail) as Array<{
      path?: unknown[];
      message?: string;
      maximum?: number;
    }>;
    if (!Array.isArray(issues) || issues.length === 0) return null;
    return issues.slice(0, 3).map((issue) => {
      const path = (issue.path ?? []).filter(
        (part): part is string => typeof part === "string",
      );
      const field = path.at(-1) ?? "input";
      const label = fieldLabels[field] ?? wordsForError(field);
      const message = typeof issue.maximum === "number"
        ? `must be ${issue.maximum} characters or fewer per item.`
        : issue.message ?? "contains an invalid value.";
      return `${label} ${message}`;
    }).join(" ");
  } catch {
    return null;
  }
}

function responseError(value: unknown): string {
  if (value && typeof value === "object") {
    const candidate = value as {
      message?: string;
      error?: { message?: string; detail?: string };
    };
    return validationDetail(candidate.error?.detail) ??
      candidate.error?.detail ??
      candidate.error?.message ??
      candidate.message ??
      "Brand analysis failed.";
  }
  return "Brand analysis failed.";
}

async function readAgentStream(
  response: Response,
  onPreview?: (text: string) => void,
): Promise<BrandAnalystResult> {
  if (!response.ok || !response.body) {
    throw new Error(responseError(await response.json()));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: BrandAnalystResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        type: string;
        text?: string;
        error?: { message?: string; detail?: string };
        output?: { ok: boolean; result?: BrandAnalystResult };
      };
      if (event.type === "preview" && event.text) onPreview?.(event.text);
      if (event.type === "error") {
        throw new Error(event.error?.detail ?? event.error?.message ?? "Analysis failed.");
      }
      if (event.type === "done" && event.output?.ok && event.output.result) {
        result = event.output.result;
      }
    }
    if (done) break;
  }

  if (!result) throw new Error("The extraction stream ended unexpectedly.");
  return result;
}

function questionMessage(question: InformationRequest): string {
  return `${question.reason}\n\n${question.question}`;
}

export function BrandOnboardingForm({
  initialBrand,
}: {
  initialBrand: { id: string; name: string; url: string } | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("welcome");
  const [step, setStep] = useState(0);
  const [brandId] = useState(() => initialBrand?.id ?? `brand-${crypto.randomUUID()}`);
  const [companyName, setCompanyName] = useState(initialBrand?.name ?? "");
  const [website, setWebsite] = useState(
    initialBrand?.url === "https://example.com" ? "" : initialBrand?.url ?? "",
  );
  const [industry, setIndustry] = useState("");
  const [markets, setMarkets] = useState("");
  const [audiences, setAudiences] = useState("");
  const [priorities, setPriorities] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [pricingPosture, setPricingPosture] = useState("");
  const [founderStory, setFounderStory] = useState("");
  const [regulatoryStatus, setRegulatoryStatus] = useState("");
  const [regulatedDomains, setRegulatedDomains] = useState("");
  const [requiredWords, setRequiredWords] = useState("");
  const [bannedWords, setBannedWords] = useState("");
  const [disclaimers, setDisclaimers] = useState("");
  const [notes, setNotes] = useState("");
  const [approvedCopy, setApprovedCopy] = useState("");
  const [urlSources, setUrlSources] = useState<UrlSource[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [visualAssets, setVisualAssets] = useState<Record<VisualAssetRole, File[]>>(emptyVisualAssets);
  const [fontNames, setFontNames] = useState("");
  const [visualGuidance, setVisualGuidance] = useState("");
  const [avoidVisualGuidance, setAvoidVisualGuidance] = useState("");
  const [catalogueFile, setCatalogueFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("Preparing your evidence");
  const [error, setError] = useState("");
  const [result, setResult] = useState<BrandAnalystResult | null>(null);
  const [questions, setQuestions] = useState<InformationRequest[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const visualFileEntries = useMemo(
    () => visualAssetFields.flatMap((field) =>
      visualAssets[field.role].map((file) => ({ file, field }))),
    [visualAssets],
  );

  const sourceCount = useMemo(
    () =>
      Number(Boolean(website.trim())) +
      Number(Boolean(approvedCopy.trim())) +
      urlSources.filter((source) => source.url.trim()).length +
      files.length +
      visualFileEntries.length +
      Number(Boolean(catalogueFile)),
    [approvedCopy, catalogueFile, files.length, urlSources, visualFileEntries.length, website],
  );

  const currentQuestion = questions[questionIndex];
  const optionalGapCount = result?.informationRequests.filter(
    (request) => request.severity === "optional",
  ).length ?? 0;

  function addMessage(role: ChatMessage["role"], text: string) {
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role, text },
    ]);
  }

  function addUrlSource() {
    setUrlSources((current) => [
      ...current,
      { id: crypto.randomUUID(), kind: "profile", label: "official-profile", url: "" },
    ]);
  }

  function updateUrlSource(id: string, patch: Partial<UrlSource>) {
    setUrlSources((current) =>
      current.map((source) => source.id === id ? { ...source, ...patch } : source),
    );
  }

  function updateVisualAssets(role: VisualAssetRole, selected: File[]) {
    const field = visualAssetFields.find((candidate) => candidate.role === role);
    setVisualAssets((current) => ({
      ...current,
      [role]: field?.multiple ? [...current[role], ...selected] : selected.slice(0, 1),
    }));
  }

  function removeVisualAsset(role: VisualAssetRole, file: File) {
    setVisualAssets((current) => ({
      ...current,
      [role]: current[role].filter((candidate) => candidate !== file),
    }));
  }

  function nextStep() {
    setError("");
    if (step === 0 && !companyName.trim()) {
      setError("Add the company name before continuing.");
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function validateSubmission(): {
    contextLists: Record<string, string[]>;
    totalFileBytes: number;
  } | null {
    const hasStructuredContext = [
      industry,
      markets,
      audiences,
      priorities,
      competitors,
      pricingPosture,
      founderStory,
      regulatoryStatus,
      regulatedDomains,
      fontNames,
      visualGuidance,
      avoidVisualGuidance,
      requiredWords,
      bannedWords,
      disclaimers,
      notes,
    ].some((value) => value.trim());
    if (sourceCount === 0 && !hasStructuredContext) {
      setError("Add a website, source, upload, approved copy, or company context.");
      return null;
    }
    if (sourceCount > MAX_SOURCE_COUNT) {
      setError(`The Brand Analyst accepts at most ${MAX_SOURCE_COUNT} sources per analysis.`);
      return null;
    }

    const contextLists = {
      markets: splitList(markets),
      audiences: splitList(audiences),
      priorities: splitList(priorities),
      competitors: splitList(competitors),
      regulatedDomains: splitList(regulatedDomains),
      fontNames: splitList(fontNames),
      requiredWords: splitList(requiredWords),
      bannedWords: splitList(bannedWords),
      disclaimers: splitList(disclaimers),
    };
    const limits: Array<[keyof typeof contextLists, number]> = [
      ["markets", 160],
      ["audiences", 300],
      ["priorities", 300],
      ["competitors", 160],
      ["regulatedDomains", 160],
      ["fontNames", 160],
      ["requiredWords", MAX_LANGUAGE_GUIDANCE_CHARS],
      ["bannedWords", MAX_LANGUAGE_GUIDANCE_CHARS],
      ["disclaimers", 500],
    ];
    const invalidList = limits.find(([field, maximum]) =>
      contextLists[field].some((item) => item.length > maximum),
    );
    if (invalidList) {
      const [field, maximum] = invalidList;
      setError(`${fieldLabels[field]} must be ${maximum} characters or fewer per item.`);
      return null;
    }

    const totalFileBytes =
      files.reduce((total, file) => total + file.size, 0) +
      visualFileEntries.reduce((total, entry) => total + entry.file.size, 0) +
      (catalogueFile?.size ?? 0);
    if (totalFileBytes > 20 * 1024 * 1024) {
      setError("Combined uploads must be 20 MB or smaller.");
      return null;
    }
    return { contextLists, totalFileBytes };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const validated = validateSubmission();
    if (!validated) return;

    setBusy(true);
    setError("");
    setResult(null);
    setProgress("Preparing your brand evidence");
    setPhase("analysing");
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "cmo",
        text: `Hi${companyName.trim() ? ` ${companyName.trim()}` : ""}. I’m your CMO. I’ll coordinate the Brand Analyst, protect the facts you supplied and only interrupt when a decision genuinely needs you.`,
      },
      {
        id: crypto.randomUUID(),
        role: "cmo",
        text: "The Brand Analyst is reading your evidence now. I’ll turn the result into one shared memory for every specialist.",
      },
    ]);

    const sources: Array<Record<string, unknown>> = [];
    if (website.trim()) {
      sources.push({
        kind: "website",
        label: "official-website",
        authority: "official-public",
        url: website.trim(),
      });
    }
    for (const source of urlSources) {
      if (!source.url.trim()) continue;
      sources.push({
        kind: source.kind,
        label: source.label.trim() || source.kind,
        authority: source.kind === "reference" ? "third-party" : "official-public",
        url: source.url.trim(),
      });
    }
    if (approvedCopy.trim()) {
      sources.push({
        kind: "text",
        label: "approved-copy",
        title: "User-provided approved copy",
        authority: "user-confirmed",
        content: approvedCopy.trim(),
      });
    }

    const context = {
      industry: industry.trim() || undefined,
      pricingPosture: pricingPosture.trim() || undefined,
      founderStory: founderStory.trim() || undefined,
      regulatoryStatus: regulatoryStatus || undefined,
      ...validated.contextLists,
      visualGuidance: visualGuidance.trim() || undefined,
      avoidVisualGuidance: avoidVisualGuidance.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    const formData = new FormData();
    formData.set("brandId", brandId);
    formData.set("traceId", crypto.randomUUID());
    if (companyName.trim()) formData.set("companyName", companyName.trim());
    if (website.trim()) formData.set("url", website.trim());
    formData.set("forceRefresh", "true");
    formData.set("sources", JSON.stringify(sources));
    formData.set("context", JSON.stringify(context));
    formData.set("fileMetadata", JSON.stringify([
      ...files.map((file) => ({
        label: file.type.startsWith("image/") ? "brand-visual" : "brand-document",
        title: file.name,
        authority: "first-party",
      })),
      ...visualFileEntries.map(({ file, field }) => ({
        label: field.role,
        title: file.name,
        authority: field.authority,
      })),
      ...(catalogueFile
        ? [{ label: "product-catalogue", title: catalogueFile.name, authority: "first-party" }]
        : []),
    ]));
    files.forEach((file) => formData.append("files", file));
    visualFileEntries.forEach(({ file }) => formData.append("files", file));
    if (catalogueFile) formData.append("catalogue", catalogueFile);

    try {
      const extracted = await readAgentStream(
        await fetch("/api/extract", { method: "POST", body: formData }),
        (text) => setProgress(text),
      );
      setResult(extracted);
      const priorityQuestions = extracted.informationRequests.filter(
        (request) => request.severity !== "optional",
      );
      setQuestions(priorityQuestions);
      setQuestionIndex(0);
      setProgress("Brand memory saved to Neon");
      addMessage(
        "cmo",
        priorityQuestions.length
          ? `The first pass is complete. I found ${priorityQuestions.length} decision${priorityQuestions.length === 1 ? "" : "s"} that could affect execution. We’ll handle them one at a time.`
          : "The first pass is complete. I have enough confirmed information to activate your brand memory.",
      );
      if (priorityQuestions.length > 0) {
        addMessage("cmo", questionMessage(priorityQuestions[0]));
        setPhase("questions");
      } else {
        addMessage("cmo", "You’re ready. Every agent can now work from the same evidence-backed source of truth.");
        setPhase("complete");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Brand analysis failed.");
      setPhase("intake");
    } finally {
      setBusy(false);
    }
  }

  function advanceQuestion() {
    const nextIndex = questionIndex + 1;
    setAnswer("");
    if (nextIndex < questions.length) {
      setQuestionIndex(nextIndex);
      addMessage("cmo", questionMessage(questions[nextIndex]));
      return;
    }
    addMessage(
      "cmo",
      optionalGapCount > 0
        ? `Your core memory is ready. I left ${optionalGapCount} optional gap${optionalGapCount === 1 ? "" : "s"} visible for later rather than slowing you down.`
        : "Your core memory is ready. Every specialist can now work from the same confirmed facts.",
    );
    setPhase("complete");
  }

  async function submitClarification(value: string) {
    const cleanAnswer = value.trim();
    if (!currentQuestion || !cleanAnswer || busy) return;
    if (currentQuestion.resolution === "upload-catalogue") {
      setPhase("intake");
      setStep(2);
      setError("Upload a corrected catalogue, then run the analysis again.");
      return;
    }

    setBusy(true);
    setError("");
    addMessage("user", cleanAnswer);
    setProgress("Updating confirmed brand memory");
    try {
      const updated = await readAgentStream(await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandId,
          traceId: crypto.randomUUID(),
          payload: {
            clarification: {
              requestId: currentQuestion.id,
              field: currentQuestion.field,
              question: currentQuestion.question,
              answer: cleanAnswer,
            },
          },
        }),
      }));
      setResult(updated);
      addMessage("cmo", "Confirmed. I’ve added that answer as first-party evidence and updated the shared memory.");
      advanceQuestion();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The answer could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function skipQuestion() {
    if (!currentQuestion || busy) return;
    addMessage("user", "Skip for now");
    addMessage("cmo", "Understood. I’ll keep it visibly incomplete and prevent dependent work from inventing the answer.");
    advanceQuestion();
  }

  if (phase === "welcome") {
    return (
      <section className="onboard-welcome">
        <div className="onboard-welcome-mark"><BrainCircuit size={25} /></div>
        <div className="onboard-welcome-kicker">Northwind · CMO intelligence</div>
        <h1>{initialBrand ? "Strengthen what your agents know." : "Build the memory behind your marketing."}</h1>
        <p>A short, guided setup. Give us the evidence once; your CMO and every specialist will work from the same truth.</p>
        <button type="button" onClick={() => setPhase("intake")}>
          {initialBrand ? "Update onboarding" : "Onboard my brand"} <ArrowRight size={16} />
        </button>
        <span><ShieldCheck size={12} /> Private to this workspace · You can skip anything optional</span>
      </section>
    );
  }

  if (phase === "analysing" || phase === "questions" || phase === "complete") {
    return (
      <section className="onboard-cmo-stage">
        <div className="onboard-cmo-chat">
          <header>
            <div className="onboard-cmo-avatar"><BrainCircuit size={19} /></div>
            <span><strong>Your CMO</strong><small><i /> Building {companyName || "your brand"}</small></span>
            <em>{phase === "complete" ? "Ready" : phase === "questions" ? "Confirming" : "Working"}</em>
          </header>

          <div className="onboard-cmo-thread" aria-live="polite">
            {messages.map((message) => (
              <div className={`onboard-cmo-message ${message.role}`} key={message.id}>
                <span>{message.role === "cmo" ? "CMO" : "You"}</span>
                <p>{message.text}</p>
              </div>
            ))}
            {(phase === "analysing" || busy) && (
              <div className="onboard-cmo-working">
                <LoaderCircle size={13} />
                <span>{progress}</span>
              </div>
            )}
          </div>

          {phase === "questions" && currentQuestion && !busy && (
            <div className="onboard-cmo-answer">
              {currentQuestion.resolution === "upload-catalogue" ? (
                <button
                  type="button"
                  className="onboard-answer-primary"
                  onClick={() => {
                    setPhase("intake");
                    setStep(2);
                    setError("Upload a corrected catalogue, then analyze again.");
                  }}
                >
                  Fix catalogue <ArrowRight size={13} />
                </button>
              ) : (
                <>
                  {currentQuestion.options.length > 0 && (
                    <div className="onboard-answer-options">
                      {currentQuestion.options.map((option) => (
                        <button type="button" key={option} onClick={() => void submitClarification(option)}>
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    void submitClarification(answer);
                  }}>
                    <textarea
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Type your answer…"
                      rows={2}
                      autoFocus
                    />
                    <button type="submit" disabled={!answer.trim()} aria-label="Send answer"><Send size={15} /></button>
                  </form>
                </>
              )}
              <button type="button" className="onboard-skip" onClick={skipQuestion}>Skip for now</button>
            </div>
          )}

          {error && (
            <div className="onboard-chat-error" role="alert"><AlertCircle size={13} />{error}</div>
          )}

          {phase === "complete" && (
            <footer className="onboard-complete-actions">
              <div>
                <Check size={14} />
                <span><strong>{result?.brandName ?? companyName}</strong><small>{result?.evidence.length ?? 0} evidence points · {result?.sources.filter((source) => source.status !== "failed").length ?? 0} sources</small></span>
              </div>
              <button type="button" onClick={() => router.push("/brand")}>Open brand memory <ArrowRight size={13} /></button>
              <button type="button" className="secondary" onClick={() => router.push("/cmo")}>Talk to your CMO</button>
            </footer>
          )}
        </div>
      </section>
    );
  }

  const activeStep = steps[step];
  return (
    <form className="onboarding-wizard" onSubmit={submit}>
      <header className="onboarding-wizard-head">
        <button type="button" onClick={() => step === 0 ? setPhase("welcome") : setStep(step - 1)} aria-label="Go back">
          <ArrowLeft size={16} />
        </button>
        <div>
          <span>Step {step + 1} of {steps.length}</span>
          <div className="onboarding-progress-track"><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
        </div>
        <small>{activeStep.eyebrow}</small>
      </header>

      <section className="onboarding-step-card">
        <div className="onboarding-step-title">
          <span>{String(step + 1).padStart(2, "0")}</span>
          <div><h1>{activeStep.title}</h1><p>{activeStep.description}</p></div>
        </div>

        {step === 0 && (
          <div className="onboarding-fields">
            <label className="intake-field"><span>Company name</span><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Acme Labs" autoFocus /></label>
            <label className="intake-field"><span>Official website <em>recommended</em></span><div className="intake-input-icon"><Globe2 size={14} /><input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://acme.com" inputMode="url" /></div></label>
            <label className="intake-field"><span>Industry</span><input value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="B2B software, skincare, financial services…" /></label>
            <label className="intake-field"><span>Markets <em>comma or line separated</em></span><input value={markets} onChange={(event) => setMarkets(event.target.value)} placeholder="Malaysia, Singapore, Australia" /></label>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-fields single">
            <div className="onboarding-source-top"><span>{sourceCount}/{MAX_SOURCE_COUNT} sources</span><button type="button" onClick={addUrlSource}><Plus size={12} /> Add public source</button></div>
            {urlSources.map((source) => (
              <div className="source-row" key={source.id}>
                <select value={source.kind} aria-label="Source type" onChange={(event) => updateUrlSource(source.id, {
                  kind: event.target.value as SourceKind,
                  label: event.target.value === "reference" ? "third-party-reference" : event.target.value === "profile" ? "official-profile" : "supporting-website",
                })}>
                  <option value="profile">Public profile</option><option value="website">Website</option><option value="reference">Reference</option>
                </select>
                <div className="intake-input-icon"><Link2 size={13} /><input value={source.url} onChange={(event) => updateUrlSource(source.id, { url: event.target.value })} placeholder="https://linkedin.com/company/acme" aria-label="Source URL" /></div>
                <button type="button" className="source-remove" onClick={() => setUrlSources((current) => current.filter((item) => item.id !== source.id))} aria-label="Remove source"><Trash2 size={14} /></button>
              </div>
            ))}
            <label className="intake-field"><span>Approved copy, founder notes or messaging</span><textarea rows={5} value={approvedCopy} onChange={(event) => setApprovedCopy(event.target.value)} placeholder="Paste language the brand already approves." /></label>
            <label className="upload-zone">
              <UploadCloud size={20} /><strong>Upload brand evidence</strong><span>Logos, brand guides, PDFs, CSV, JSON or text · 8 MB each</span>
              <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif,application/pdf,application/json,application/rtf,text/plain,text/html,text/csv,text/markdown,text/rtf,text/xml" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
            </label>
            {files.length > 0 && <div className="upload-list wizard-upload-list">{files.map((file) => <div key={`${file.name}-${file.size}`}>{file.type.startsWith("image/") ? <ImageIcon size={13} /> : <FileText size={13} />}<span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small><button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))}><Trash2 size={12} /></button></div>)}</div>}
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-fields single">
            <div className="visual-kit-intro">
              <ImageIcon size={15} />
              <span>Upload only assets you have permission to use. Their labels tell every downstream agent whether to copy, reference or avoid the visual direction.</span>
            </div>
            <div className="visual-upload-grid">
              {visualAssetFields.map((field) => (
                <div className="visual-upload-field" key={field.role}>
                  <label className="upload-zone visual-upload-zone">
                    {field.role === "brand-guidelines" ? <FileText size={18} /> : <ImageIcon size={18} />}
                    <strong>{field.title}</strong>
                    <span>{field.description}</span>
                    <input
                      type="file"
                      accept={field.accept}
                      multiple={field.multiple}
                      onChange={(event) => {
                        updateVisualAssets(field.role, Array.from(event.target.files ?? []));
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {visualAssets[field.role].length > 0 && (
                    <div className="visual-file-list">
                      {visualAssets[field.role].map((file) => (
                        <span key={`${file.name}-${file.size}`}>
                          <small>{file.name}</small>
                          <button type="button" onClick={() => removeVisualAsset(field.role, file)} aria-label={`Remove ${file.name}`}><Trash2 size={10} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="onboarding-fields">
              <label className="intake-field"><span>Approved fonts <em>comma or line separated</em></span><textarea rows={3} value={fontNames} onChange={(event) => setFontNames(event.target.value)} placeholder="Inter, Canela, Neue Haas Grotesk" /></label>
              <label className="intake-field"><span>Visual direction</span><textarea rows={3} value={visualGuidance} onChange={(event) => setVisualGuidance(event.target.value)} placeholder="Editorial photography, generous whitespace, restrained lime accents…" /></label>
              <label className="intake-field wide"><span>What should the brand never look like?</span><textarea rows={3} value={avoidVisualGuidance} onChange={(event) => setAvoidVisualGuidance(event.target.value)} placeholder="Avoid generic stock photography, neon gradients, crowded layouts or fabricated product packaging." /></label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-fields single">
            <div className="catalogue-guidance">
              <div><strong>Required</strong><span>Product Name</span></div>
              <div><strong>Recommended</strong><span>SKU, Category, Description, Price, Currency, Availability and Product URL</span></div>
              <div><strong>Capacity</strong><span>1,000 products · multiple sheets · 8 MB</span></div>
            </div>
            <label className="upload-zone catalogue-upload">
              <FileSpreadsheet size={22} /><strong>{catalogueFile ? "Replace product catalogue" : "Upload product catalogue"}</strong><span>Excel workbook (.xlsx) only</span>
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 8 * 1024 * 1024)) {
                  setCatalogueFile(null);
                  setError("Use an .xlsx workbook that is 8 MB or smaller.");
                  event.target.value = "";
                  return;
                }
                setError("");
                setCatalogueFile(file);
              }} />
            </label>
            {catalogueFile && <div className="upload-list wizard-upload-list"><div><FileSpreadsheet size={13} /><span>{catalogueFile.name}</span><small>{(catalogueFile.size / 1024 / 1024).toFixed(1)} MB</small><button type="button" onClick={() => setCatalogueFile(null)}><Trash2 size={12} /></button></div></div>}
            <div className="onboarding-optional-note"><Sparkles size={13} /><span>Not selling products? Leave this empty and continue.</span></div>
          </div>
        )}

        {step === 4 && (
          <div className="onboarding-fields">
            <label className="intake-field"><span>Priority audiences</span><textarea rows={3} value={audiences} onChange={(event) => setAudiences(event.target.value)} placeholder="CMOs at Series A B2B companies" /></label>
            <label className="intake-field"><span>Marketing priorities</span><textarea rows={3} value={priorities} onChange={(event) => setPriorities(event.target.value)} placeholder="Build category awareness, increase qualified demos" /></label>
            <label className="intake-field"><span>Competitors</span><textarea rows={3} value={competitors} onChange={(event) => setCompetitors(event.target.value)} placeholder="Competitor A, Competitor B" /></label>
            <label className="intake-field"><span>Pricing posture</span><textarea rows={3} value={pricingPosture} onChange={(event) => setPricingPosture(event.target.value)} placeholder="Premium value, value-led, budget, freemium or mixed" /></label>
            <label className="intake-field wide"><span>Founder and origin story</span><textarea rows={4} value={founderStory} onChange={(event) => setFounderStory(event.target.value)} placeholder="Who founded the company, why it started and confirmed milestones." /></label>
          </div>
        )}

        {step === 5 && (
          <div className="onboarding-fields">
            <label className="intake-field"><span>Claims-risk status</span><select value={regulatoryStatus} onChange={(event) => setRegulatoryStatus(event.target.value)}><option value="">Let the analyst assess it</option><option value="regulated">Regulated or claims-sensitive</option><option value="not-regulated">Not regulated</option><option value="unsure">Unsure — apply extra review</option></select><input value={regulatedDomains} onChange={(event) => setRegulatedDomains(event.target.value)} placeholder="Health, finance, supplements, safety…" /></label>
            <label className="intake-field"><span>Required language</span><textarea rows={3} value={requiredWords} onChange={(event) => setRequiredWords(event.target.value)} placeholder="Words, phrases or longer language rules to preserve" /></label>
            <label className="intake-field"><span>Banned language</span><textarea rows={3} value={bannedWords} onChange={(event) => setBannedWords(event.target.value)} placeholder="Words, promises or tones the agents must avoid" /></label>
            <label className="intake-field"><span>Legal disclaimers</span><textarea rows={3} value={disclaimers} onChange={(event) => setDisclaimers(event.target.value)} placeholder="One per line" /></label>
            <label className="intake-field wide"><span>Anything else the CMO must know</span><textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Business model, product constraints, recent repositioning or corrections to public information." /></label>
          </div>
        )}

        {error && <div className="wizard-error" role="alert"><AlertCircle size={13} />{error}</div>}
      </section>

      <footer className="onboarding-wizard-actions">
        <span><ShieldCheck size={12} /> Saved only when you start the analysis</span>
        {step < steps.length - 1 ? (
          <button type="button" onClick={nextStep}>Continue <ArrowRight size={14} /></button>
        ) : (
          <button type="submit" disabled={busy}><Sparkles size={14} /> Build my brand memory</button>
        )}
      </footer>
    </form>
  );
}
