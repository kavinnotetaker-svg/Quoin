# Quoin

Quoin is a compliance-focused Next.js monolith for Washington, DC building energy compliance work.

The current product scope is centered on deterministic benchmarking and BEPS evaluation, evidence-backed verification, packet generation, and the operational workflows required to prepare buildings for review and filing.

## Current product scope

Quoin currently supports:

- multi-tenant organization and building management
- ENERGY STAR Portfolio Manager sync and Green Button ingestion
- deterministic benchmarking readiness and verification
- deterministic BEPS evaluation with governed rule and factor versioning
- source reconciliation and provenance for canonical building and meter state
- governed penalty visibility and simple deterministic scenario deltas
- immutable artifact, evidence, and submission workflow operations
- anomaly-to-risk decision-support and retrofit prioritization
- portfolio worklists, operator controls, and governed reporting
- persisted compliance runs, evidence, audit logs, and jobs
- benchmarking and BEPS request/checklist workflows
- packet generation and PDF export for verification and filing workpapers
- compliance-first building and portfolio UI

Quoin is not a financing platform. Financing and capital-structuring code may remain in the repo as deprecated legacy support for historical records and cleanup safety, but they are not active product capabilities.

Quoin does not currently implement direct DOEE submission transport or a generic reporting platform.

For the current v1 checkpoint boundary and post-v1 backlog seed, see [docs/v1-release-checkpoint.md](docs/v1-release-checkpoint.md).

## Core workflows

For a given organization, the primary workflow is:

1. Ingest or sync building energy data
2. Run deterministic data quality and verification checks
3. Evaluate benchmarking readiness and BEPS compliance through governed rules
4. Persist versioned compliance runs with input, QA, and output snapshots
5. Prepare benchmarking or BEPS packets for review, export, and handoff

## High-level architecture

Quoin is a monolith with a clear split between UI, API, and deterministic compliance services:

- `src/app`
  Next.js App Router pages and route handlers
- `src/components`
  UI components for buildings, compliance, and workflow surfaces
- `src/server/trpc`
  tRPC routers and auth/tenant middleware
- `src/server/compliance`
  deterministic compliance services, packet assembly, workflow logic, and provenance
- `src/server/integrations`
  external integrations such as ESPM and Green Button
- `src/server/pipelines`
  ingestion and worker-side pipeline logic
- `prisma`
  schema, migrations, and seed
- `test`
  unit and integration tests
- `docs`
  concise technical documentation and archived project notes

## Engineering principles

Quoin is built around a small set of explicit engineering constraints:

- deterministic compliance logic over heuristic output
- governed rule and factor versioning
- data quality as a computation gate
- append-only or reviewable compliance history where practical
- tenant-safe persistence and API boundaries
- auditable operational flows with jobs and audit logs

## Local development

Prerequisites:

- Node.js 20+
- PostgreSQL
- Redis
- npm

Typical setup:

```bash
npm install
npx prisma generate
npm run db:start
npx prisma migrate deploy
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Main scripts

Core developer commands:

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run test
npm run test:unit
npm run test:integration:db
```

Prisma and DB validation commands:

```bash
npm run prisma:format
npm run prisma:validate
npm run prisma:generate
npm run db:validate:fresh
npm run db:validate:current
```

Worker commands:

```bash
npm run worker
npm run worker:build
npm run worker:prod
```

## Build and deployment notes

- Production builds use `next build`
- The local production start path uses `scripts/start-server.mjs`
- Docker and deployment assets live in the repo root and `deploy/`
- Environment validation happens in server config code at startup

## Repository structure

```text
src/
  app/                Next.js routes and API handlers
  components/         UI components
  server/
    compliance/       Compliance engine, benchmarking, BEPS, packets, provenance
    integrations/     ESPM, Green Button, external clients
    pipelines/        Ingestion pipelines and worker logic
    trpc/             API routers and context
prisma/               Schema, migrations, seed
scripts/              Validation and local runtime helpers
test/                 Unit and integration tests
docs/                 Technical documentation
```

## Additional documentation

- [Architecture](docs/architecture.md)
- [Capability Map](docs/capability-map.md)
- [V1 Release Checkpoint](docs/v1-release-checkpoint.md)
- [Development](docs/development.md)
- [Compliance Engine](docs/compliance-engine.md)
- [DB Operations](docs/foundation-db-operations.md)
- [Contributing](CONTRIBUTING.md)
