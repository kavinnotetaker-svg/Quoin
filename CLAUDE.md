# Quoin — CLAUDE.md

> **This is the build contract. If something here contradicts spec narrative, this file wins.**

## What This Is

Quoin is a multi-tenant SaaS platform that automates Washington DC BEPS (Building Energy Performance Standards) compliance. It ingests energy data from ENERGY STAR Portfolio Manager and utility CSVs, runs deterministic compliance pipelines, structures capital financing from DC programs (CLEER, C-PACE, AHRA, IRA), and monitors building performance drift — all against the **December 31, 2026 Cycle 1 deadline**.

**Core value hypothesis**: Building owners will pay for a single-pane view of BEPS compliance status, penalty exposure, and a ready-made action plan — because the alternative is hiring a $50K+ energy consultant or risking $7.5M in penalties.

**Revenue model**: Tiered SaaS subscriptions (Free/Pro/Enterprise) via Stripe. Per-building pricing.

**Market**: Washington DC only. No multi-city until DC is profitable.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14 (App Router) | SSR + API routes. Single codebase for app + workers. |
| Language | TypeScript (strict: true) | **No `any` types.** Use `unknown` + runtime narrowing. |
| API | tRPC v11 | Type-safe. Zod validation on every input AND output. No REST except webhooks. |
| Auth | Clerk | Magic link + Google OAuth. Organizations = tenants. Roles = RBAC. |
| Database | PostgreSQL 16 + Prisma | **RLS is the primary tenant isolation.** Prisma Client Extensions (`$extends`), NOT middleware. |
| Background Jobs | BullMQ + Redis | All pipelines run async. Return job ID for polling. Never block API routes. |
| AI | Anthropic Claude API | Haiku for structured output (alerts, summaries). Sonnet for multi-step reasoning (pathway, capital). Config-driven model selection. |
| External APIs | ESPM v26.0 (XML-only), Green Button CMD (ESPI/XML), Pepco CSV | **ESPM is XML. There is no JSON mode. Use fast-xml-parser.** |
| PDF | Playwright `.pdf()` from HTML/Jinja templates | NOT @react-pdf/renderer. Full CSS control. |
| Charts | Recharts | EUI time series, penalty gauges, funding waterfalls |
| Maps | Mapbox GL JS + react-map-gl | Building pins color-coded by compliance status |
| UI | Tailwind CSS + shadcn/ui | Clean, professional. This is enterprise B2B, not a consumer app. |
| Email | Resend | Transactional: alerts, deadline reminders, report delivery |
| Billing | Stripe | Subscriptions + usage metering. Phase C only. |
| Observability | Sentry + CloudWatch + structured JSON logging | From day one. Every pipeline run logged. |
| Infra | AWS CDK (TypeScript) | 2 Fargate services (app + worker). RDS + ElastiCache. No ClickOps. |
| Testing | Vitest (unit/integration) + MSW (API mocking) + Playwright (E2E) | ESPM responses recorded as XML fixtures. |
| Linting | ESLint + TypeScript strict | Zero warnings policy. |

## Hard Rules (Non-Negotiable)

### 1. ESPM is XML-Only
There is no JSON mode. All ESPM integration uses `fast-xml-parser` with `ignoreAttributes: false, parseAttributeValue: true`. Every XML response is typed. Store recorded XML responses in `/test/fixtures/espm/` for test replay via MSW.

### 2. Deterministic Pipelines, Thin LLM Layer
80%+ of pipeline logic is ETL, math, and boolean checks — pure TypeScript functions in `logic.ts` files. **LLM calls are ONLY for:**
- Data quality summaries (Haiku)
- Pathway optimization narrative (Sonnet)
- Capital stack recommendation narrative (Sonnet)
- Drift alert root cause analysis (Haiku)

**NEVER use Claude for:** penalty math, eligibility screening, unit conversion, CSV normalization, EUI calculation, or any deterministic operation.

### 3. RLS is Primary Tenant Isolation
PostgreSQL Row-Level Security is the enforcement boundary. Not application code. Not Prisma middleware.
- Every tenant table has `organization_id`.
- RLS policy: `USING (organization_id = current_setting('app.organization_id')::text)`
- Prisma Client Extension calls `SET LOCAL app.organization_id` at transaction start.
- **Integration test explicitly verifies cross-tenant access fails. Runs on every CI build. A leak is company-ending.**

### 4. Append-Only Audit Trail
`EnergyReading` and `ComplianceSnapshot` are INSERT-ONLY. **Never UPDATE or DELETE.** DOEE requires proving what data existed at what time. The latest `ComplianceSnapshot` is the "current" state — `currentScore` is NOT stored on `Building`.

### 5. Structured Outputs Everywhere
- Every tRPC procedure has Zod input AND output validation.
- Every Claude API call uses structured output (tool use or JSON mode). No free-text LLM output consumed by pipeline code.
- Environment variables validated at startup via Zod in `config.ts`. App crashes immediately on invalid config, not at first use.

### 6. Pipeline Logic Separation
```
worker.ts  → Thin orchestrator: load data, call logic, persist results, handle errors
logic.ts   → Pure functions: testable without BullMQ, no side effects, no DB calls
```
All prompts live in `/server/integrations/claude/prompts/`. No inline prompt strings in pipeline code.

### 7. External API Resilience
Every external call (ESPM, Green Button, Claude, Stripe): 30s timeout, retry with exponential backoff + jitter, structured error types, request/response logging. A dependency failure must never crash the pipeline — degrade gracefully, log, continue.

### 8. No Stored Utility Credentials
Users download their own CSVs from EUDS/Utilli. The platform normalizes and ingests them. **Never store utility portal passwords.** Green Button uses OAuth tokens (stored encrypted, auto-rotated).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js 14 App                        │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │  Clerk   │  │  tRPC    │  │  Dashboard / Detail UI │ │
│  │  Auth    │  │  Routers │  │  (React + shadcn/ui)   │ │
│  └────┬─────┘  └────┬─────┘  └────────────────────────┘ │
│       │              │                                    │
│       ▼              ▼                                    │
│  ┌──────────────────────────┐                            │
│  │  Prisma + RLS Extension  │ ◄── SET LOCAL org_id       │
│  └────────────┬─────────────┘                            │
│               │                                          │
└───────────────┼──────────────────────────────────────────┘
                │
    ┌───────────▼───────────┐
    │  PostgreSQL 16 (RLS)  │
    └───────────┬───────────┘
                │
    ┌───────────▼───────────┐        ┌─────────────────┐
    │   BullMQ + Redis      │───────►│  Worker Process  │
    │   (Job Queues)        │        │  (Same codebase) │
    └───────────────────────┘        └────────┬────────┘
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                    │ Data Ingest  │ │   Pathway    │ │    Drift     │
                    │  Pipeline    │ │   Analysis   │ │  Detection   │
                    └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                           │                │                │
                           ▼                ▼                ▼
                    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                    │  ESPM (XML)  │ │ Claude API   │ │  Rules Eng   │
                    │  CSV Parse   │ │ (thin layer) │ │  (determin.) │
                    └──────────────┘ └──────────────┘ └──────────────┘
```

## 4 Pipelines

### Pipeline 1: Data Ingestion
**Trigger**: CSV upload, Green Button webhook, ESPM scheduled sync, manual
**Flow**: Ingest → Normalize to kBtu → Validate → Persist EnergyReadings → Sync to ESPM → Pull updated score → Create ComplianceSnapshot
**LLM**: Optional Haiku call for data quality summary if anomalies detected. Pipeline works without it.

### Pipeline 2: Pathway Analysis
**Trigger**: ComplianceSnapshot shows AT_RISK or NON_COMPLIANT, monthly cron, manual
**Flow**: Load context → ECM identification (deterministic, from reference table) → Simulate 3 pathways (Standard/Performance/Prescriptive) → Penalty calc at 25/50/75/100% completion → Rank by ROI → Persist
**LLM**: Sonnet generates 3-paragraph executive summary. Numbers are deterministic; narrative is AI.
**Key formula**: `estimatedPenalty = maxPenalty - (progress × maxPenalty)` where `progress = (achieved - baseline) / (target - baseline)`

### Pipeline 3: Capital Structuring
**Trigger**: Pathway analysis completes with totalEcmCost > 0, manual
**Flow**: Load pathway + ECMs → Boolean eligibility screening (AHRA, CLEER, C-PACE, IRA) → Stack assembly (grants first → subsidized debt → market debt → equity) → Cash flow check → Persist
**LLM**: Sonnet generates funding recommendation narrative.

### Pipeline 4: Drift Detection
**Trigger**: Every 4 hours (Green Button), daily 8 AM (CSV buildings), on ingestion if consumption > baseline + 10%
**Rules**: EUI Spike (2σ), Score Drop (≥3 points), Consumption Anomaly (3x typical), Seasonal Deviation (±20% YoY), Sustained Drift (7+ days >15%)
**LLM**: Async Haiku root cause analysis. Alert visible immediately with deterministic description; AI fills in asynchronously.

## Build Sequence (Critical Path — DO NOT SKIP AHEAD)

### Phase A: Core Loop (Weeks 1-8) — Ship to 2 Pilot Customers
**Goal**: "I can see my buildings' compliance status in one place."

| Step | What | Success Criteria |
|------|------|-----------------|
| 1 | Prisma schema (ALL tables from spec Section 3), migrations, RLS policies (raw SQL), seed script (3 orgs, 10 buildings) | `npx prisma migrate deploy` succeeds. Seed populates. |
| 2 | Clerk integration: sign-in, org creation, webhook handler, session extraction | User can sign in, org is created locally. |
| 3 | Prisma Client Extension for RLS. **Integration test: cross-tenant access fails.** | Test proves Org A cannot read Org B data. |
| 4 | tRPC: root router, building router (list/get/create), Zod validation | Type-safe building CRUD works. |
| 5 | ESPM API client: XML with fast-xml-parser. GET /property/{id}/metrics. Record real responses as fixtures. | Pull real ESPM data from EPA sandbox. |
| 6 | Eval framework: `eval.ts` CLI, 3 golden dataset entries. Baseline run. | Eval runs, prints scorecard. |
| 7 | CSV upload: multipart handler, PapaParse, column auto-detect, normalization, EnergyReading persistence | Upload Pepco CSV → normalized readings in DB. |
| 8 | Data Ingestion Pipeline: CSV → normalize → validate → persist → ESPM sync → ComplianceSnapshot | Round-trip: CSV → ESPM → score → snapshot. |
| 9 | Dashboard shell: sidebar, KPI cards (mock, then real tRPC) | Dashboard renders with real data. |
| 10 | Building list + detail page (Overview + Energy tabs) | Real building data visible. |
| 11 | Mapbox map with building pins | Pin colors match compliance status. |
| 12 | Green Button OAuth flow + webhook Lambda | OAuth handshake completes with Pepco sandbox. |
| 13 | Penalty calculator (pure function, extensively unit tested) | All golden dataset buildings produce correct penalties. |
| 14 | Onboarding wizard, notification emails (Resend) | New user → building → data → status in <10 min. |
| 15 | AWS staging deploy. Onboard 2 pilot customers. | 2 real buildings producing accurate compliance data. |

### Phase B: Intelligence Layer (Weeks 9-14)
Pathway Analysis → Capital Structuring → Drift Detection → DOEE report generator

### Phase C: Polish + Scale (Weeks 15-18)
Stripe billing → Security hardening → Browser-assist scraper → Production deploy

## Queue Topology

| Queue | Concurrency | Retry | DLQ |
|-------|-------------|-------|-----|
| data-ingestion | 3 | 3x backoff 1m/5m/15m | Yes |
| pathway-analysis | 2 | 3x backoff 1m/5m/15m | Yes |
| capital-structuring | 2 | 3x backoff 1m/5m/15m | Yes |
| drift-detection | 5 | 2x backoff 30s | Yes |
| espm-sync | 1 (rate-limited, 3 req/s) | 5x respects rate limit | Yes |
| ai-analysis | 3 | 2x backoff 5s/30s | Yes |
| notifications | 10 | 3x backoff 1m | Yes |
| report-generator | 1 | 2x backoff 5m | Yes |

## Claude API Model Config

| Task | Model | Rationale |
|------|-------|-----------|
| Alert descriptions | claude-haiku-4-5-20251001 | Templated text from structured data. Speed + cost. |
| Anomaly interpretation | claude-haiku-4-5-20251001 | Structured in → structured out + explanation. |
| Data quality summaries | claude-haiku-4-5-20251001 | Summarizing reconciliation. Straightforward. |
| Pathway optimization | claude-sonnet-4-5-20250929 | Multi-step: compare 3 pathways, rank ECM bundles. |
| Capital stack reasoning | claude-sonnet-4-5-20250929 | Multi-constraint optimization across 4+ funding sources. |
| Compliance narrative | claude-sonnet-4-5-20250929 | DOEE report quality matters. |

Model selection stored in `/server/integrations/claude/model-config.ts`. Change models without code changes. Every PipelineRun records `llmModel`, `llmTokensUsed`, `llmCostCents` for A/B testing.

## Project Structure

```
quoin/
├── CLAUDE.md                          # This file
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── (marketing)/page.tsx
│   │   ├── (auth)/sign-in/[[...sign-in]]/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── buildings/[id]/page.tsx
│   │   │   ├── buildings/[id]/pathway/page.tsx
│   │   │   ├── buildings/[id]/capital/page.tsx
│   │   │   ├── buildings/[id]/drift/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   └── settings/page.tsx
│   │   └── api/
│   │       ├── trpc/[trpc]/route.ts
│   │       ├── webhooks/green-button/route.ts
│   │       ├── webhooks/stripe/route.ts
│   │       ├── webhooks/clerk/route.ts
│   │       └── upload/route.ts
│   ├── server/
│   │   ├── trpc/
│   │   │   ├── routers/               # building, pathway, capital, drift, report, admin
│   │   │   ├── context.ts             # Clerk session + tenant DB client
│   │   │   └── index.ts              # Root router
│   │   ├── pipelines/
│   │   │   ├── data-ingestion/
│   │   │   │   ├── worker.ts          # BullMQ worker (thin orchestrator)
│   │   │   │   ├── logic.ts           # Pure functions (testable)
│   │   │   │   ├── csv-parser.ts      # CSV normalization + column detection
│   │   │   │   └── espm-sync.ts       # Push to ESPM + pull score
│   │   │   ├── pathway-analysis/
│   │   │   │   ├── worker.ts
│   │   │   │   ├── logic.ts
│   │   │   │   ├── penalty-calculator.ts
│   │   │   │   └── ecm-scorer.ts
│   │   │   ├── capital-structuring/
│   │   │   │   ├── worker.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── eligibility/       # cleer.ts, cpace.ts, ahra.ts, ira.ts
│   │   │   └── drift-detection/
│   │   │       ├── worker.ts
│   │   │       ├── logic.ts
│   │   │       └── rules-engine.ts
│   │   ├── integrations/
│   │   │   ├── espm/                  # XML client, types, transforms
│   │   │   ├── green-button/          # ESPI client, OAuth flow
│   │   │   └── claude/                # SDK wrapper, prompts/, model-config.ts
│   │   └── lib/
│   │       ├── db.ts                  # Prisma + RLS tenant client
│   │       ├── redis.ts
│   │       ├── queue.ts               # BullMQ queue factory
│   │       └── config.ts              # Zod-validated env vars
│   └── components/
│       ├── ui/                        # shadcn/ui
│       ├── dashboard/                 # KPI cards, map, table
│       ├── building/                  # Score gauge, EUI chart
│       └── upload/                    # CSV upload + column mapper
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── infra/                             # AWS CDK
├── test/
│   ├── fixtures/espm/                 # Recorded XML responses
│   ├── fixtures/csv/                  # Sample utility CSVs
│   ├── fixtures/golden/               # Eval golden datasets
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── eval/
│       ├── runner.ts
│       ├── datasets/
│       └── scorecards/
└── .env.local                         # Local dev only (gitignored)
```

## Environment

- **OS**: Windows 11 (PowerShell — NOT cmd.exe)
- **IDE**: Claude Code CLI
- **Local dev**: Docker Compose for PostgreSQL + Redis. Next.js dev server.
- **PowerShell reminders**:
  - `Remove-Item -Recurse -Force` not `rmdir /s /q`
  - `-and` not `&&` for chaining
  - Save scripts to file first, then run

## Pitfalls to Avoid

1. **DO NOT try JSON with ESPM.** XML only. `fast-xml-parser` with `ignoreAttributes: false`.
2. **DO NOT build automated scrapers.** CSV upload is the primary non-Green-Button data path.
3. **DO NOT store utility portal credentials anywhere.** Users handle their own downloads.
4. **DO NOT run pipelines synchronously in API routes.** They take 10-60s. Use BullMQ. Return job ID.
5. **DO NOT hardcode BEPS thresholds.** Store in a config table `(property_type, target_score, cycle)`. DOEE will publish Cycle 2/3 rules.
6. **DO NOT skip the RLS integration test.** Runs on every CI build. Cross-tenant leak = game over.
7. **DO NOT call Claude for deterministic work.** Penalty math, eligibility checks, unit conversion, CSV normalization = pure TypeScript.
8. **DO NOT use Prisma middleware.** Use `$extends`. Middleware is deprecated, doesn't cover raw queries.
9. **DO NOT overwrite EnergyReadings or ComplianceSnapshots.** Append-only. INSERT only, never UPDATE/DELETE.
10. **DO NOT build Phase B before Phase A ships.** Get 2 real buildings on the platform before building intelligence.

## Code Standards

```bash
# Run after EVERY change — no exceptions
npx vitest run
npx tsc --noEmit
npx eslint src/ --max-warnings 0
```

- **Read before writing.** Never modify a file without reading it first.
- **No dead code.** That's what git is for.
- **No silent failures.** Specific error types + logging. No bare `catch {}`.
- **External API calls**: 30s timeout, retry, structured errors, req/res logging.
- **Commits**: conventional format. `feat:`, `fix:`, `refactor:`, `test:`.

## Working With Me

- I'll paste errors, terminal output, or screenshots. Diagnose and fix — don't ask clarifying questions unless truly ambiguous.
- When I say "run it", execute against real data unless I specify test.
- If something is broken, fix it. Don't explain and wait for permission.
- When a phase step is complete, tell me: what's done, test count, what's next. Keep momentum.
- **EPA ESPM registration takes 2-4 weeks.** Start this on Day 1. It's the longest external dependency.

## Self-Verification (Apply to Every Output)

Before delivering code, switch to QA:
1. Does it handle empty/null inputs?
2. Does it degrade gracefully when ESPM/Claude/Redis is down?
3. Is RLS correctly scoping all queries?
4. Are all financial/compliance calculations deterministic (no LLM)?
5. Is `EnergyReading` / `ComplianceSnapshot` append-only? No UPDATE/DELETE?
6. Do all tests pass? Is ESLint clean? Is TypeScript strict satisfied?
7. Would a DC energy compliance consultant approve this logic?

Deliver the version that survived scrutiny, not the first draft.
