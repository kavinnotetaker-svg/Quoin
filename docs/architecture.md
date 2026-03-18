# Architecture

## System shape

Quoin is a Next.js monolith with tRPC, Prisma/Postgres, and worker-side ingestion and sync processing.

Primary layers:

- `src/app`
  route handlers and application pages
- `src/components`
  UI surfaces for buildings, compliance, packets, and admin operations
- `src/server/trpc`
  tenant-safe API routers
- `src/server/compliance`
  deterministic compliance, provenance, packet, and workflow services
- `src/server/integrations`
  ESPM and Green Button integrations
- `src/server/pipelines`
  ingestion pipelines and worker execution

## Persistence

Core persisted records include:

- `Building`
- `EnergyReading`
- `ComplianceSnapshot`
- `ComplianceRun`
- `BenchmarkSubmission`
- `FilingRecord`
- `BenchmarkPacket`
- `FilingPacket`
- `EvidenceArtifact`
- `SourceArtifact`
- `AuditLog`
- `Job`

Rules are versioned through:

- `RulePackage`
- `RuleVersion`
- `FactorSetVersion`
- `BepsCycleRegistry`

## Ingestion flows

Primary external data paths:

- Portfolio Manager sync and push
- Green Button webhook and downstream ingestion
- CSV upload and normalization

These flows are backed by:

- canonical ingestion envelope handling
- persistent jobs
- audit logs
- typed error normalization

## Compliance engine role

The centralized compliance engine lives in `src/server/compliance/compliance-engine.ts`.

It is responsible for:

- selecting the applicable governed rule and factor versions
- assembling input snapshots
- enforcing QA gates
- invoking deterministic benchmarking or BEPS evaluation logic
- persisting `ComplianceRun`
- writing audit entries around computation

Routers should call the engine rather than recomputing compliance logic inline.

## Audit, jobs, and QA

Operational foundation pieces:

- `AuditLog`
  persistent execution and boundary trace records
- `Job`
  durable execution state for ingestion and sync workflows
- data quality verdicts
  explicit `PASS`, `WARN`, `FAIL` gates used by compliance flows

These pieces are intended to make evaluations explainable and replayable, not opaque.
