# Northwind parallel-development rules

This repository is built by four agent developers in parallel. The external agent
contract must stay interchangeable.

## Lead-owned files (locked)

- `src/lib/agents/types.ts`
- `src/lib/agents/run.ts`
- `src/lib/agents/route.ts`
- `src/lib/agents/models.ts`
- `src/lib/agents/cost.ts`
- `src/lib/agents/output.ts`
- `src/lib/db.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**`

Changes to a locked file require a `contract-change` review by the lead and one
other developer. Do not run `prisma db push` against the shared Neon database.

## Ownership

| Developer | Agent directory | API route |
| --- | --- | --- |
| Dev A | `src/lib/agents/cmo/**` | `src/app/api/cmo/**` |
| Dev B | `src/lib/agents/brand-analyst/**` | `src/app/api/extract/**` |
| Dev C | `src/lib/agents/copywriter/**` | `src/app/api/generate/**` |
| Dev D | `src/lib/agents/analyst/**` | `src/app/api/digest/**` |

Each developer edits only their owned paths. Cross-agent work is proposed through
the shared contract, never by importing another agent's private files.

## Branches and integration

- Branch format: `agent/<agent-name>/<change>`.
- Rebase on `main` daily.
- Commit migrations separately from application changes.
- Use `npm run typecheck`, `npm test`, and `npm run build` before requesting review.
- Keep prompts in `prompt.ts`, Zod input/output contracts in `schema.ts`, and agent
  orchestration in `index.ts`.
- All agents are invoked through `runAgent()` and return the shared envelope.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
