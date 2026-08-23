# Brand Analyst multi-source pipeline

## Purpose

The Brand Analyst turns user-provided brand material into an evidence-backed
Brand Kernel, voice profile, and visual identity. A company website is useful,
but it is not mandatory when the user can provide other authoritative sources.

The agent owns extraction and refresh. It does not become the brand memory: the
confirmed result stored on the `Brand` row is the source of truth consumed by
the CMO, Copywriter, and Analyst agents.

## User intake

Require a company name and at least one usable source. Accept any combination
of the following:

| Source | Examples | Primary use |
| --- | --- | --- |
| Website | Company homepage, About, product, pricing, case-study pages | Positioning, category, ICPs, claims, proof, voice |
| Uploaded logo or image | PNG, JPEG, WebP, SVG converted to a safe raster preview | Logo type, visible wording, palette, visual character |
| Brand document | Brand guidelines, pitch deck, brochure, one-pager, case study | Approved messaging, identity rules, proof, voice |
| Pasted text | Company description, founder notes, approved copy, audience notes | Explicit first-party facts and constraints |
| Official profile URL | LinkedIn company page, product directory, public social profile | Current public language and recurring tone |
| Reference URL | Press coverage, customer review page, competitor page | Market perception and comparison only |

Each source must have a user-selected label such as `logo`, `brand-guidelines`,
`approved-copy`, `product-information`, `customer-proof`, `official-profile`,
or `external-reference`. The label affects how much authority the source has.

The intake screen should also collect optional structured facts that are hard to
infer reliably:

- industry and operating markets;
- products or services to prioritize;
- target audiences;
- known competitors;
- required words, prohibited words, and legal disclaimers;
- preferred brand colors when exact values are known;
- any source that should be treated as historical rather than current.

## Pipeline

```text
Collect sources
      |
      v
Validate, secure, and fingerprint each source
      |
      v
Fetch or decode by source type
      |
      v
Normalize into SourceArtifacts
      |
      v
Extract claims and observations per source
      |
      v
Merge by authority, recency, and corroboration
      |
      v
Validate required fields, evidence, and conflicts
      |
      v
User reviews, edits, and confirms
      |
      v
Persist Brand Kernel, voice, visual identity, and provenance
```

### 1. Validate and register sources

- Generate a source ID for every item.
- Allow only supported MIME types and enforce file, page, and total-run limits.
- Detect MIME type from bytes instead of trusting the filename.
- Canonicalize URLs and deduplicate URLs and files using a content hash.
- Fetch only public HTTP/HTTPS destinations. Block loopback, private network,
  link-local, metadata-service, and credential-bearing URLs, including after
  redirects and DNS resolution.
- Record the source label, origin, upload time, checksum, and user-supplied
  authority.
- For the owned-path MVP, send browser uploads as `multipart/form-data`; the
  route validates them and passes bounded inline bytes to Gemini for that one
  extraction run. Do not place raw file bytes or base64 data in hand-written
  JSON requests. The durable phase moves uploads to private object storage and
  passes short-lived object references.

### 2. Ingest by source type

Website ingestion:

- Fetch the submitted page and discover same-origin About, Product, Pricing,
  Case Study, FAQ, and Contact pages.
- Respect page and byte limits, timeouts, redirects, and crawl policy.
- Remove scripts, styles, navigation repetition, cookie banners, and forms.
- Retain headings, body text, metadata, canonical URL, and page title.

Document ingestion:

- Extract text and page references from supported documents.
- Render pages containing important visual identity material when necessary.
- Preserve headings and page numbers so evidence can be traced back.
- Mark scans or unreadable pages for vision/OCR processing.

Image and logo ingestion:

- Strip unnecessary metadata and create a bounded analysis copy.
- Use vision to identify wordmark text, symbol/wordmark/combination style,
  tagline, logo variants, visual motifs, and background/contrast behavior.
- Calculate dominant colors from pixels and express them as candidate hex
  values. Treat colors stated in brand guidelines or supplied by the user as
  more authoritative than colors sampled from compressed images.
- Do not infer positioning, ICPs, or tone solely from a logo.
- Do not claim an exact font family from an image unless an authoritative
  source names it; report visual typography characteristics instead.

Pasted text and profile/reference URLs follow the same normalization and
security rules as website content.

### 3. Normalize to a shared evidence format

Every ingester produces a `SourceArtifact` before Gemini synthesis:

```ts
type SourceArtifact = {
  id: string;
  kind: "website" | "document" | "image" | "text" | "profile" | "reference";
  label: string;
  title: string;
  origin: string;
  authority: "user-confirmed" | "first-party" | "official-public" | "third-party";
  capturedAt: string;
  checksum: string;
  text?: string;
  imageRef?: string;
  locationMap?: Array<{ section: string; location: string }>;
  warnings: string[];
};
```

All source text and image-derived text is untrusted data. Delimit each artifact
in prompts, identify it by source ID, and instruct the model to ignore any
commands contained inside it.

### 4. Extract per source

Run a structured extraction for each artifact or small related batch. Produce
candidate facts rather than a final Brand Kernel:

```ts
type EvidenceClaim = {
  field: string;
  value: unknown;
  sourceId: string;
  evidence: string;
  location?: string;
  confidence: number;
  observedAt: string;
};
```

This first pass prevents one long document from drowning out other evidence,
keeps citations intact, and allows a failed source to be retried independently.

### 5. Synthesize and resolve conflicts

Merge candidate claims using this default authority order:

1. User-confirmed facts and corrections.
2. Current first-party brand guidelines and approved copy.
3. Current company website and official company profiles.
4. Other first-party material such as decks and brochures.
5. Third-party references.

Within the same tier, prefer newer, more specific, and independently
corroborated evidence. Third-party sources may describe market perception or
competitors, but must not silently override first-party brand facts.

When credible sources disagree, retain the conflict and ask the user. Never
invent a compromise. Each final field should have confidence and at least one
source reference; low-evidence fields should be marked as uncertain rather than
filled with generic marketing language.

### 6. Produce the draft brand profile

Preserve the existing `kernel`, `voice`, and `crawledUrls` fields for downstream
compatibility, then add optional multi-source fields:

```ts
type MultiSourceBrandResult = {
  kernel: BrandKernel;
  voice: BrandVoice;
  crawledUrls: string[];
  visualIdentity: {
    logo: {
      sourceId: string;
      type: "symbol" | "wordmark" | "combination" | "unknown";
      visibleText: string[];
      tagline?: string;
    } | null;
    colors: Array<{
      hex: string;
      role: "primary" | "secondary" | "accent" | "unknown";
      sourceId: string;
      confidence: number;
    }>;
    typographyCharacteristics: string[];
    motifs: string[];
    usageNotes: string[];
  };
  sources: Array<{
    id: string;
    kind: string;
    label: string;
    title: string;
    status: "processed" | "partial" | "failed";
    warnings: string[];
  }>;
  evidence: Record<string, Array<{
    sourceId: string;
    excerptOrObservation: string;
    location?: string;
    confidence: number;
  }>>;
  conflicts: Array<{
    field: string;
    options: Array<{ value: unknown; sourceIds: string[] }>;
    question: string;
  }>;
  missingInformation: string[];
};
```

Visual identity is descriptive evidence for future creative work. It must not
be treated as a complete brand-guideline system unless the user supplied one.

### 7. Review and confirmation

The onboarding UI should show:

- one source tile per upload or URL with processing status;
- extracted Brand Kernel, voice, and visual identity sections;
- a source badge and confidence indicator beside each field;
- conflicts as explicit choices;
- unanswered questions for missing high-value information;
- editable fields before confirmation;
- `Add sources`, `Re-run analysis`, and `Confirm brand profile` actions.

Only the confirmed profile becomes active brand memory. User edits are recorded
as `user-confirmed` evidence and take priority on later refreshes.

### 8. Persist and refresh

For a durable implementation, persist source metadata, extraction runs, and
field evidence separately from the final `Brand` row. The recommended shared
database additions are:

- `BrandSource`: source type, label, URI, MIME type, checksum, authority,
  status, metadata, and timestamps;
- `BrandExtractionRun`: source IDs, model/version, status, warnings, started and
  completed timestamps;
- either `BrandEvidence` rows or a versioned JSON snapshot containing field-level
  provenance and conflicts.

The confirmed `kernel`, `voice`, and optional `visualIdentity` snapshot remain on
the `Brand` record for fast reads by other agents.

Refresh only changed sources by comparing URL metadata and content checksums.
Re-run per-source extraction for changed items, then re-synthesize the full
profile. Preserve user-confirmed corrections unless the user explicitly clears
them.

## API shape

The route accepts the legacy JSON envelope, multi-source JSON, and real
`multipart/form-data` uploads. The durable storage form sends object references
to the same source schema:

```json
{
  "brandId": "brand-id",
  "payload": {
    "companyName": "Northwind Labs",
    "sources": [
      {
        "kind": "website",
        "url": "https://northwindlabs.com",
        "label": "official-website"
      },
      {
        "kind": "image",
        "objectUrl": "signed-or-private-object-reference",
        "mimeType": "image/png",
        "fileName": "northwind-logo.png",
        "label": "logo"
      },
      {
        "kind": "text",
        "title": "Founder notes",
        "content": "We sell to lean B2B marketing teams...",
        "label": "approved-copy"
      }
    ],
    "forceRefresh": false
  }
}
```

For backward compatibility, the payload schema may temporarily transform the
old `{ "url": "..." }` form into a single website source.

The API should allow partial success. A failed source is returned with its error
while usable sources continue through synthesis. Reject the run only when no
source produces usable evidence.

## Streaming and status

The shared agent states remain `queued`, `working`, `complete`, and `error`.
Use preview events for finer progress:

- `Validating 5 sources`;
- `Reading website: About`;
- `Analyzing logo`;
- `Extracting brand voice from 4 usable sources`;
- `Resolving 2 conflicting claims`;
- `Draft ready for review`.

Per the shared contract, emit `working` on the first Gemini partial result, not
when the HTTP request begins.

## Failure and quality rules

- Continue when individual sources fail and expose every warning to the user.
- Never use generic filler to satisfy a required output field.
- Never present third-party claims as confirmed first-party facts.
- Never allow source content to change system instructions or tool behavior.
- Redact secrets or credentials detected in uploaded text before model use.
- Keep raw uploads private and use short-lived signed access for model calls.
- Delete temporary processing copies after extraction according to the agreed
  retention policy.
- Log source IDs, hashes, model version, validation failures, latency, and token
  usage without logging raw private content.

## Delivery phases

### Phase 1: owned-path prototype

- Expand `brand-analyst/schema.ts` with a discriminated `sources` array while
  retaining legacy URL input.
- Add source normalization, website crawling, image/document preparation,
  structured Gemini extraction, synthesis, Zod validation, and partial-failure
  handling under `brand-analyst/**`.
- Add prompt and schema tests covering mixed sources, prompt injection,
  conflicting evidence, failed sources, and logo-only limitations.
- Keep persistence limited to the existing `Brand.kernel` and `Brand.voice`
  fields until the shared database contract is approved.

### Phase 2: contract-change review

- Select private object storage and implement signed browser uploads.
- Add persistent source, extraction-run, provenance, and visual-identity storage.
- Extend the onboarding UI for source management and evidence review.
- Upgrade the shared streaming route if agent-originated preview events require
  a common interface.

### Phase 3: refresh and governance

- Add source versioning, selective refresh, retention controls, audit history,
  user-confirmed overrides, and field-level comparison between extraction runs.

## Ownership boundary

Dev B can implement agent logic, schemas, prompts, tests, and routes inside:

- `src/lib/agents/brand-analyst/**`
- `src/app/api/extract/**`

The following require a `contract-change` review because they are lead-owned or
affect other agents:

- `prisma/schema.prisma` and migrations;
- shared agent types, runner, route, output, model, and cost files;
- the final shape that the CMO and Copywriter consume;
- object-storage environment variables and deployment configuration;
- onboarding UI changes if UI ownership has not been assigned.
