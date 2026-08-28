# Development handoff

## First-time setup

1. Install Node.js 22 and run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. In Neon, open **Project dashboard → Connect** and copy both connection strings:
   - pooled (`-pooler` in the hostname) into `DATABASE_URL`;
   - direct (no `-pooler`) into `DIRECT_URL`.
4. Create a Gemini API key in Google AI Studio and put it in
   `GOOGLE_GENERATIVE_AI_API_KEY`.
5. Run `npm run db:generate`, `npm run db:deploy`, and `npm run db:seed`.
6. Run `npm run dev`, then open `/api/health/db`. An `ok: true` response proves the
   application can query Neon.

Never add `NEXT_PUBLIC_` to a secret name. Local secrets live only in `.env.local`;
production and preview secrets belong in the hosting provider's environment
settings. `.env.example` contains placeholders and is safe to commit.

## Shared Neon workflow

- Give each developer their own Neon branch when possible. Set both URLs to that
  branch locally.
- Only the lead edits `prisma/schema.prisma` and creates migration folders.
- Developers apply committed migrations with `npm run db:deploy`.
- The lead creates a migration with `npm run db:migrate -- --name <change>` against
  a development Neon branch, reviews the SQL, then commits it.
- Staging and production run `npm run db:deploy`; never use `db push` there.

## Agent API contracts

The four routes return the shared NDJSON envelope. They accept JSON shaped as:

```json
{
  "brandId": "a-real-brand-id",
  "traceId": "optional-shared-trace-id",
  "payload": {}
}
```

| Agent | Route | Payload |
| --- | --- | --- |
| CMO | `POST /api/cmo` | `{ "message": "...", "conversationId": "optional" }` |
| Brand Analyst | `POST /api/extract` | `{ "url": "https://...", "forceRefresh": false }` |
| Copywriter | `POST /api/generate` | `{ "channel": "linkedin", "brief": "...", "usedKernel": true }` |
| Analyst | `POST /api/digest` | `{ "from": "ISO date", "to": "ISO date" }` |

The first successful CMO response returns a `conversationId`. Send it on later
requests to continue that brand-scoped conversation. `GET /api/cmo?conversationId=...`
restores its messages from Neon. The browser drawer stores only this opaque ID; the
actual conversation content lives in `CmoConversation` and `CmoMessage`.

## Model warning

The stable model IDs and standard-tier prices in `models.ts` and `cost.ts` were
verified against Google documentation on 23 August 2026. The two 3.x text models
use promotional prices through 31 December 2026, so verify them again before launch.
