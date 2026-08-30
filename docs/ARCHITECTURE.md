# NorthWind — Architecture

An agentic marketing workspace. A small-business owner talks to a **CMO agent**,
which decides one step at a time which specialists to run, and every piece of
content produced is reviewed against the brand's own memory before the user
sees it.

---

## 1. The whole system

```mermaid
flowchart TB
    User([Owner-operator])

    subgraph UI["Next.js app"]
        Onboard["/onboard<br/>build Brand Memory"]
        Chat["/cmo<br/>conversation"]
        Plan["/plan<br/>calendar + schedule"]
        Studio["/studio/[id]<br/>write one post"]
    end

    subgraph API["Route handlers (NDJSON streams)"]
        RCmo["/api/cmo"]
        RGen["/api/generate"]
        RCamp["/api/campaign"]
        RExtract["/api/extract"]
        RMedia["/api/media/[id]"]
    end

    subgraph Core["Agent runtime"]
        Runner["runAgent()<br/>timeout · telemetry · cost"]
        Loop["CMO agent loop"]
        Registry["Capability registry"]
    end

    subgraph Agents["Specialists"]
        Analyst["Analyst"]
        Strategist["Strategist"]
        Copywriter["Copywriter"]
        BrandAnalyst["Brand Analyst"]
        Critic["Campaign Critic"]
    end

    Judge{{"Brand Judge<br/>gates all content"}}

    subgraph Data["Postgres · Neon"]
        Brand[("Brand<br/>kernel · voice · logo")]
        Convo[("CmoConversation<br/>CmoMessage")]
        Campaign[("Campaign<br/>strategy + plan")]
        AssetT[("Asset<br/>image bytes")]
    end

    Ext["Google Gemini<br/>+ grounded search"]

    User --> Onboard & Chat & Plan & Studio
    Onboard --> RExtract --> BrandAnalyst
    Chat --> RCmo --> Loop
    Plan --> RCamp
    Studio --> RGen --> Copywriter
    Studio --> RMedia --> AssetT

    Loop --> Registry
    Loop -.runs.-> Runner
    Runner --> Analyst & Strategist & Copywriter & BrandAnalyst & Critic

    Copywriter --> Judge
    Judge -->|pass| AssetT
    Judge -.reject + reasons.-> Copywriter

    BrandAnalyst --> Brand
    Loop --> Convo
    Strategist --> Campaign
    Campaign --> Plan

    Analyst & Strategist & Copywriter & BrandAnalyst & Critic & Loop & Judge --> Ext
```

---

## 2. The CMO is a loop, not a router

The defining decision. The CMO does **not** plan a turn up front and execute it
blindly — it decides, runs one capability, observes the result, and decides
again, up to a step budget.

```mermaid
flowchart LR
    Start([User message]) --> Canned{Greeting or<br/>acknowledgement?}
    Canned -->|yes| Reply([Canned reply · no model call])
    Canned -->|no| Decide

    subgraph LoopBox["Agent loop · max 4 capability calls"]
        direction TB
        Decide["Decide next action<br/>gemini-3.7-flash"]
        Decide --> Action{action}
        Action -->|respond| Done([Answer])
        Action -->|ask| Question([One question])
        Action -->|use| Guard{Capability<br/>guard}
        Guard -->|allowed| Run["Run specialist"]
        Guard -->|denied| Obs
        Run --> Obs["Observation<br/>result or failure"]
        Obs --> Decide
    end
```

**Why a loop.** The Analyst can return zero sources; the loop sees that and
says so instead of planning on nothing. A single-shot router cannot react to
its own results.

**Guards are feedback, not deletion.** A refused call returns its reason as an
observation — *"the user has not agreed to a plan yet"* — so the model chooses
something else. Silently stripping the call left it unaware.

| Guard | Rule |
|---|---|
| Plan gate | Strategist only runs once the user asks for or agrees to a plan |
| Mutual exclusion | Copywriter never runs in the same turn as the Strategist |
| Duplicate work | Analyst refused after the Strategist, which researches itself |
| Step budget | 4 capability calls, then it must answer |
| Catalogue check | Invented product names dropped before delegation |

Adding a specialist means one entry in `cmo/registry.ts`. The prompt's
specialist menu is generated from it.

---

## 3. Every piece of content is judged

Nothing reaches the user unreviewed. The judge runs on a **different model**
from the writer.

```mermaid
flowchart TB
    Brief["Brief from the approved plan"] --> Write["Copywriter writes<br/>gemini-3.6-flash"]
    Write --> Screen["Deterministic screen<br/>banned words · claim shapes · length"]
    Screen --> Semantic["Judged against Brand Memory<br/>gemini-3.1-pro-preview"]
    Semantic --> Verdict{Pass?}
    Verdict -->|no| Feedback["Reasons fed back"] --> Write
    Verdict -->|yes| Out([Shown to the user])

    Poster["Poster wording"] --> Semantic
    Render["Rendered image"] --> Visual["Visual judge<br/>palette · logo · legibility · spelling"]
    Visual --> Verdict
```

**Two layers.** Objective rules are deterministic and free — banned words,
regulated terms, unevidenced claim shapes, channel length. Judgement needs a
model: positioning, audience, evidence, tone, each scored against the brand's
confirmed memory with a stated reason.

**The judge sees exactly what the writer saw.** Giving it a narrower slice made
it reject copy for citing confirmed pricing the brief had supplied.

**It fails closed.** If the judge cannot be reached, content is marked *not
reviewed* rather than passed — the deterministic rules alone score clean copy
around 98, which would have been a silent green tick.

---

## 4. Where the plan comes from

```mermaid
sequenceDiagram
    actor U as User
    participant C as CMO loop
    participant A as Analyst
    participant S as Strategist
    participant DB as Campaign

    U->>C: "is a Merdeka intake a good idea?"
    C-->>U: discusses, offers to build a plan
    U->>C: "yes"
    C->>A: research the market
    A-->>C: signals + cited sources
    C->>S: build the plan
    S-->>C: 3 options + schedule for the best fit
    C->>DB: save as proposed
    C-->>U: three options
    U->>DB: picks option 2
    Note over DB: schedule rebuilt around<br/>that option's channel and duration
    DB-->>U: /plan calendar + day-by-day
```

The Strategist only ever schedules **its own recommended option**, so choosing a
different one recomputes the dates, cadence, channel and measurement.

---

## 5. Runtime facts

| Agent | Model | Budget | Notes |
|---|---|---|---|
| CMO | `gemini-3.7-flash` | 150s | Loop, up to 4 capability calls |
| Analyst | `gemini-3.6-flash` | 40s | Grounded search + optional connectors |
| Strategist | `gemini-3.7-flash` | 85s | Structured output, deterministic fallback |
| Copywriter | `gemini-3.6-flash` | 200s | Text, poster, script — worst case 3 renders |
| Copywriter (image) | `gemini-3.1-flash-image` | — | Poster artwork |
| Brand Analyst | `gemini-3.1-pro-preview` | 110s | Crawls the site, rebuilds memory |
| Brand Judge | `gemini-3.1-pro-preview` | — | Never the model that wrote the draft |
| Campaign Critic | `gemini-3.1-pro-preview` | 20s | Pre-flight and post-flight review |

`runAgent()` wraps every call with a timeout, prices it against that model's own
rate, and returns telemetry. The CMO aggregates the whole turn, so the chat
footer shows real spend: a question ≈ RM0.02, a full plan ≈ RM0.13.

---

## 6. Data

```mermaid
erDiagram
    Brand ||--o{ CmoConversation : "has"
    Brand ||--o{ Campaign : "has"
    Brand ||--o{ Asset : "has"
    Brand ||--o{ Metric : "has"
    CmoConversation ||--o{ CmoMessage : "has"

    Brand {
        json kernel "positioning, ICPs, proof, visual identity"
        json voice "tone, do, dont, banned words"
        bytes logoImage "composited into posters"
    }
    Campaign {
        json strategy "full Strategist result"
        json executionPlan "rebuilt on option choice"
        string status "proposed | selected"
    }
    Asset {
        bytes mediaData "when no blob store is configured"
        string mediaUrl "blob URL or /api/media/[id]"
    }
```

**Brand Memory** is the single source of truth. Agents may only assert what it
confirms; anything else must be hedged or refused.

**The logo is stored, not described.** Posters composite the real file — an
image model asked to redraw a mark from words never reproduces it.

---

## 7. Principles worth keeping

1. **The runtime decides what runs, not the model.** The model proposes; guards
   in code enforce. Every guard exists because a rule in the prompt was broken.
2. **Fail closed on anything the user will publish.** Unreviewed content is
   never reported as approved.
3. **Deterministic where possible, model where necessary.** Word counts and
   banned terms need no model. Positioning and tone do.
4. **Degrade, don't dead-end.** A poster that never passes returns its best
   attempt with the concerns attached, because the wording gate already cleared
   the claims.
5. **Say what is missing.** No research is reported as no research, not
   filled in with plausible prose.
