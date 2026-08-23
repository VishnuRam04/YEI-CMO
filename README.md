# Northwind CMO

A contract-first four-agent workspace built with Next.js 16, Gemini through the
Vercel AI SDK, Prisma 7, and Neon Postgres.

The UI shell is present and each agent has a typed Day-2 stub behind its real API
route. Start with [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for credentials,
database setup, route contracts, and the four-developer workflow. Repository
ownership rules live in [AGENTS.md](AGENTS.md).

## Commands

```bash
npm install
npm run db:generate
npm run db:deploy
npm run dev
```

Quality checks:

```bash
npm run db:validate
npm run typecheck
npm test
npm run build
```
