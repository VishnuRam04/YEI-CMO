import Link from "next/link";
import { connection } from "next/server";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CircleDollarSign,
  Crosshair,
  Database,
  ExternalLink,
  Gem,
  PackageOpen,
  Palette,
  RefreshCw,
  Scale,
  ShieldCheck,
  Users,
  Volume2,
} from "lucide-react";
import { PageHeading } from "@/components/ui/page-heading";
import { getActiveBrandMemory } from "@/lib/brand-memory";

function words(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function axisLabels(axis: string): [string, string] {
  const labels = axis.split(/To(?=[A-Z])/);
  return labels.length === 2
    ? [words(labels[0]), words(labels[1])]
    : [`Less ${words(axis)}`, `More ${words(axis)}`];
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function productPriceLabel(price: number | null, currency: string | null): string {
  if (price === null) return "Not listed";
  if (currency) {
    try {
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(price);
    } catch {
      return `${currency} ${price.toLocaleString("en")}`;
    }
  }
  return price.toLocaleString("en", { maximumFractionDigits: 2 });
}

export default async function BrandPage() {
  await connection();
  const brand = await getActiveBrandMemory();

  if (!brand) {
    return (
      <div className="page-wrap">
        <PageHeading
          eyebrow="Brand memory · Not configured"
          title="Your agents need a source of truth."
          description="Run the Brand Analyst with your website, approved copy, documents, and commercial context before asking the agent network to create marketing work."
          actions={(
            <Link href="/onboard" className="button button-primary">
              Start onboarding <ArrowRight size={13} />
            </Link>
          )}
        />
      </div>
    );
  }

  const { kernel, voice } = brand;
  const requiredWords = voice.requiredWords ?? [];
  const bannedWords = voice.bannedWords ?? [];
  const provenance = kernel.provenance;
  const visual = kernel.visualIdentity;
  const sources = provenance?.sources ?? [];
  const evidence = provenance?.evidence ?? [];
  const conflicts = provenance?.conflicts ?? [];
  const missing = provenance?.missingInformation ?? [];
  const informationRequests = provenance?.informationRequests ?? [];
  const confirmedInformation = provenance?.confirmedInformation ?? [];
  const catalogues = kernel.productCatalogues ?? [];
  const products = catalogues.flatMap((catalogue) => catalogue.products);
  const updatedAt = provenance?.extractedAt ?? brand.updatedAt;

  return (
    <div className="page-wrap brand-memory-page">
      <PageHeading
        eyebrow={`Brand memory · Updated ${dateLabel(updatedAt)}`}
        title={`${brand.name}’s source of truth.`}
        description="Every agent reads this evidence-backed kernel, voice profile, and visual identity before it recommends or creates marketing work."
        actions={(
          <>
            {brand.url && brand.url !== "https://example.com" && (
              <a href={brand.url} target="_blank" rel="noreferrer" className="button button-ghost">
                Visit site <ExternalLink size={13} />
              </a>
            )}
            <Link href="/onboard" className="button button-dark">
              <RefreshCw size={13} /> Re-analyze
            </Link>
          </>
        )}
      />

      <div className="memory-health-strip">
        <div><Database size={14} /><span><strong>{sources.length || "Demo"}</strong> sources</span></div>
        <div><ShieldCheck size={14} /><span><strong>{evidence.length}</strong> evidence points</span></div>
        <div className={conflicts.length ? "warning" : ""}><AlertTriangle size={14} /><span><strong>{conflicts.length}</strong> conflicts</span></div>
        <div><Check size={14} /><span><strong>{informationRequests.length || missing.length}</strong> open gaps</span></div>
        <div><PackageOpen size={14} /><span><strong>{products.length}</strong> products</span></div>
      </div>

      <div className="brand-layout">
        <div className="brand-memory-main">
          <section className="kernel-card-grid">
            <article className="card memory-card">
              <div className="memory-number">01</div>
              <div className="memory-icon"><Crosshair size={14} /></div>
              <div className="memory-title">Positioning</div>
              <div className="memory-copy">{kernel.positioning ?? "Positioning has not been confirmed."}</div>
              {kernel.category && <span className="memory-category">{kernel.category}</span>}
            </article>

            <article className="card memory-card">
              <div className="memory-number">02</div>
              <div className="memory-icon"><Users size={14} /></div>
              <div className="memory-title">Ideal customers</div>
              <div className="icp-list">
                {(kernel.icps ?? []).map((icp) => (
                  <div key={icp.name}>
                    <strong>{icp.name}</strong>
                    <span>{icp.needs.join(" · ")}</span>
                  </div>
                ))}
                {!kernel.icps?.length && <span className="memory-muted">No ICP evidence yet.</span>}
              </div>
            </article>

            <article className="card memory-card">
              <div className="memory-number">03</div>
              <div className="memory-icon"><Gem size={14} /></div>
              <div className="memory-title">Differentiators</div>
              <div className="bullet-list">
                {(kernel.differentiators ?? []).map((item) => <div className="bullet-item" key={item}>{item}</div>)}
              </div>
            </article>

            <article className="card memory-card">
              <div className="memory-number">04</div>
              <div className="memory-icon"><ShieldCheck size={14} /></div>
              <div className="memory-title">Proof and competition</div>
              <div className="bullet-list">
                {(kernel.proofPoints ?? []).map((item) => <div className="bullet-item" key={item}>{item}</div>)}
              </div>
              {kernel.competitors && kernel.competitors.length > 0 && (
                <div className="competitor-tags">
                  {kernel.competitors.map((item) => <span className="tag" key={item}>{item}</span>)}
                </div>
              )}
            </article>

            <article className="card memory-card">
              <div className="memory-number">05</div>
              <div className="memory-icon"><CircleDollarSign size={14} /></div>
              <div className="memory-title">Pricing posture</div>
              {kernel.pricingPosture ? (
                <>
                  <span className="memory-category">{words(kernel.pricingPosture.position)}</span>
                  <div className="memory-copy">{kernel.pricingPosture.summary || "Pricing evidence is still incomplete."}</div>
                  {kernel.pricingPosture.priceObjectionGuidance && (
                    <p className="memory-muted">Objection guidance: {kernel.pricingPosture.priceObjectionGuidance}</p>
                  )}
                </>
              ) : <span className="memory-muted">No pricing-position evidence yet.</span>}
            </article>

            <article className="card memory-card">
              <div className="memory-number">06</div>
              <div className="memory-icon"><BookOpen size={14} /></div>
              <div className="memory-title">Founder and origin</div>
              {kernel.founderStory ? (
                <>
                  <div className="memory-copy">{kernel.founderStory.originSummary || "The origin story is incomplete."}</div>
                  {(kernel.founderStory.founders.length > 0 || kernel.founderStory.foundingYear) && (
                    <span className="memory-category">
                      {[kernel.founderStory.founders.join(", "), kernel.founderStory.foundingYear].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </>
              ) : <span className="memory-muted">No confirmed founder story yet.</span>}
            </article>

            <article className="card memory-card">
              <div className="memory-number">07</div>
              <div className="memory-icon"><Scale size={14} /></div>
              <div className="memory-title">Claims risk</div>
              {kernel.regulatedClaims ? (
                <>
                  <span className={`tag ${kernel.regulatedClaims.needsClaimsReview ? "tag-orange" : "tag-lime"}`}>
                    {words(kernel.regulatedClaims.status)}
                  </span>
                  <div className="memory-copy">{kernel.regulatedClaims.rationale || "Claims-risk rationale is still incomplete."}</div>
                  {kernel.regulatedClaims.domains.length > 0 && (
                    <div className="competitor-tags">
                      {kernel.regulatedClaims.domains.map((domain) => <span className="tag" key={domain}>{domain}</span>)}
                    </div>
                  )}
                </>
              ) : <span className="memory-muted">Claims risk has not been assessed.</span>}
            </article>
          </section>

          <section className="card card-pad memory-section">
            <div className="card-head">
              <div>
                <div className="card-note">Handling resistance</div>
                <h2 className="section-title">Objections and rebuttals</h2>
              </div>
              <span className="tag">{kernel.objections?.length ?? 0} mapped</span>
            </div>
            <div className="objection-list">
              {(kernel.objections ?? []).map((item) => (
                <div className="objection-row" key={item.objection}>
                  <strong>“{item.objection}”</strong>
                  <span>{item.rebuttal}</span>
                </div>
              ))}
              {!kernel.objections?.length && <p className="memory-muted">Re-analyze with sales calls, FAQs, or objection notes to complete this section.</p>}
            </div>
          </section>
        </div>

        <aside className="card voice-panel">
          <div className="card-head">
            <div><div className="brief-kicker">Voice profile</div><h2 className="section-title">How {brand.name} sounds</h2></div>
            <Volume2 size={17} color="#c8f169" />
          </div>
          {Object.entries(voice.toneAxes ?? {}).map(([axis, value]) => {
            const [left, right] = axisLabels(axis);
            return (
              <div className="voice-axis" key={axis}>
                <div className="voice-axis-labels"><span>{left}</span><span>{right}</span></div>
                <div className="voice-track"><span style={{ left: `${((value - 1) / 4) * 100}%` }} /></div>
              </div>
            );
          })}
          {voice.exemplars?.[0] && <div className="quote-card">“{voice.exemplars[0]}”</div>}
          <div className="voice-rules">
            <div className="kernel-field-label">Do</div>
            <div>{(voice.do ?? []).map((item) => <span className="tag tag-lime" key={item}>{item}</span>)}</div>
            <div className="kernel-field-label">Avoid</div>
            <div>{(voice.dont ?? []).map((item) => <span className="tag" key={item}>{item}</span>)}</div>
            <div className="kernel-field-label">Required language</div>
            <div>{requiredWords.length > 0
              ? requiredWords.map((item) => <span className="tag tag-lime" key={item}>{item}</span>)
              : <span className="memory-muted">None recorded</span>}</div>
            <div className="kernel-field-label">Banned language</div>
            <div>{bannedWords.length > 0
              ? bannedWords.map((item) => <span className="tag tag-orange" key={item}>{item}</span>)
              : <span className="memory-muted">None recorded</span>}</div>
          </div>
        </aside>
      </div>

      {catalogues.length > 0 && (
        <section className="card card-pad memory-section catalogue-section">
          <div className="card-head">
            <div>
              <div className="card-note">First-party commercial data</div>
              <h2 className="section-title">Product catalogue and pricing</h2>
            </div>
            <span className="tag tag-lime">{products.length} products · {catalogues.length} workbook{catalogues.length === 1 ? "" : "s"}</span>
          </div>
          <div className="catalogue-source-tags">
            {catalogues.map((catalogue) => (
              <span className="tag" key={catalogue.sourceId}>
                {catalogue.fileName} · {catalogue.sheetNames.length} sheet{catalogue.sheetNames.length === 1 ? "" : "s"}
              </span>
            ))}
          </div>
          <div className="catalogue-table-wrap">
            <table className="catalogue-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Listed price</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 30).map((product) => (
                  <tr key={`${product.sheet}-${product.sourceRow}-${product.sku ?? product.name}`}>
                    <td>
                      {product.url
                        ? <a href={product.url} target="_blank" rel="noreferrer">{product.name}<ExternalLink size={10} /></a>
                        : <strong>{product.name}</strong>}
                      {product.description && <small>{product.description}</small>}
                    </td>
                    <td>{product.sku ?? "—"}</td>
                    <td>{product.category ?? "—"}</td>
                    <td>
                      <strong>{productPriceLabel(product.price, product.currency)}</strong>
                      {product.compareAtPrice !== null && <small>Compare at {productPriceLabel(product.compareAtPrice, product.currency)}</small>}
                    </td>
                    <td>{product.availability ?? "Not listed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {products.length > 30 && <p className="memory-muted catalogue-overflow">Showing 30 of {products.length} products.</p>}
          {catalogues.flatMap((catalogue) => catalogue.warnings).length > 0 && (
            <div className="catalogue-warnings">
              {catalogues.flatMap((catalogue) => catalogue.warnings).slice(0, 5).map((warning) => (
                <span key={warning}><AlertTriangle size={11} />{warning}</span>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="brand-detail-grid">
        <section className="card card-pad memory-section visual-section">
          <div className="card-head">
            <div><div className="card-note">Visual identity</div><h2 className="section-title">Recognizable brand cues</h2></div>
            <Palette size={17} color="#708078" />
          </div>
          {visual?.logo && (
            <div className="visual-logo-summary">
              <strong>{words(visual.logo.type)} logo</strong>
              <span>{visual.logo.visibleText.join(" · ") || "No visible wording"}</span>
            </div>
          )}
          <div className="color-list">
            {(visual?.colors ?? []).map((color) => (
              <div key={`${color.hex}-${color.role}`}>
                <i style={{ background: color.hex }} />
                <span><strong>{color.hex.toUpperCase()}</strong>{words(color.role)} · {Math.round(color.confidence * 100)}% confidence</span>
              </div>
            ))}
            {!visual?.colors?.length && <span className="memory-muted">No authoritative colors were extracted.</span>}
          </div>
          <div className="visual-tags">
            {[...(visual?.fontFamilies ?? []), ...(visual?.typographyCharacteristics ?? []), ...(visual?.motifs ?? [])].map((item) => <span className="tag" key={item}>{item}</span>)}
          </div>
          {(visual?.usageNotes ?? []).map((note) => <p className="visual-note" key={note}>{note}</p>)}
        </section>

        <section className="card card-pad memory-section">
          <div className="card-head">
            <div><div className="card-note">Source provenance</div><h2 className="section-title">What the analyst used</h2></div>
            <span className="tag tag-lime">{sources.filter((source) => source.status === "processed").length} verified</span>
          </div>
          <div className="memory-source-list">
            {sources.map((source) => (
              <div key={source.id}>
                <span className={`source-status ${source.status}`} />
                <span><strong>{source.title}</strong><small>{words(source.kind)} · {source.label}</small></span>
                <em>{source.status}</em>
              </div>
            ))}
            {!sources.length && <p className="memory-muted">This is seed memory. Re-analyze to attach evidence and provenance.</p>}
          </div>
        </section>
      </div>

      <section className="card card-pad memory-section evidence-section">
        <div className="card-head">
          <div><div className="card-note">Traceable memory</div><h2 className="section-title">Evidence ledger</h2></div>
          <span className="tag">{evidence.length} citations</span>
        </div>
        <div className="evidence-ledger">
          {evidence.slice(0, 12).map((item, index) => (
            <div key={`${item.field}-${item.sourceId}-${index}`}>
              <span className="evidence-confidence">{Math.round(item.confidence * 100)}%</span>
              <span><strong>{words(item.field)}</strong><small>{item.excerptOrObservation}</small></span>
              <code>{item.sourceId}</code>
            </div>
          ))}
          {!evidence.length && <p className="memory-muted">Evidence citations will appear after the new Brand Analyst completes an extraction.</p>}
        </div>
      </section>

      {informationRequests.length > 0 && (
        <section className="card card-pad memory-section information-request-section">
          <div className="card-head">
            <div>
              <div className="card-note">CMO follow-up queue</div>
              <h2 className="section-title">Open brand questions</h2>
            </div>
            <span className="tag tag-orange">{informationRequests.length} unresolved</span>
          </div>
          <p className="memory-muted">The CMO asks blocking and review questions one at a time. Optional gaps remain visible without stopping unrelated work.</p>
          <div className="information-request-list">
            {informationRequests.map((request) => (
              <div key={request.id}>
                <span className={`tag ${request.severity === "optional" ? "" : "tag-orange"}`}>{words(request.severity)}</span>
                <span>
                  <strong>{request.question}</strong>
                  <small>{request.reason}</small>
                  {request.affects.length > 0 && <em>May affect: {request.affects.join(" · ")}</em>}
                </span>
              </div>
            ))}
          </div>
          {confirmedInformation.length > 0 && (
            <p className="memory-muted confirmed-information-count">{confirmedInformation.length} user-confirmed answer{confirmedInformation.length === 1 ? "" : "s"} stored as first-party memory.</p>
          )}
        </section>
      )}

      {(conflicts.length > 0 || missing.length > 0) && (
        <div className="memory-review-grid">
          <section className="card card-pad memory-section">
            <div className="card-note">Needs a decision</div>
            <h2 className="section-title">Source conflicts</h2>
            {conflicts.map((conflict) => (
              <div className="memory-review-item warning" key={conflict.field}>
                <AlertTriangle size={14} /><span><strong>{words(conflict.field)}</strong>{conflict.question}</span>
              </div>
            ))}
          </section>
          <section className="card card-pad memory-section">
            <div className="card-note">Improve next extraction</div>
            <h2 className="section-title">Missing information</h2>
            {missing.map((item) => (
              <div className="memory-review-item" key={item}>
                <Check size={14} /><span>{item}</span>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
