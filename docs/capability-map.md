# Capability Map

This file defines Quoin's active product boundary.

For the current v1 checkpoint and post-v1 backlog seed, see [v1-release-checkpoint.md](v1-release-checkpoint.md).

## Active product capabilities

Quoin is a compliance operating system for Washington, DC building energy compliance work.

Active capabilities:

- deterministic benchmarking compliance evaluation
- deterministic BEPS evaluation with governed rule and factor versioning
- source reconciliation and provenance for building, meter, and consumption state
- persisted readiness, issue, and governed operational summaries
- governed penalty visibility and deterministic scenario deltas
- immutable compliance artifacts, evidence packaging, and submission workflows
- portfolio worklists, operator actions, and runtime health visibility
- anomaly-to-risk decision-support
- retrofit prioritization grounded in governed compliance and operations context
- governed reports and evidence-oriented exports

## Deprecated or legacy areas

These areas are retained only where needed for historical records, cleanup, or low-risk transitional support:

- financing persistence models in the Prisma schema
- legacy financing packet service code
- legacy capital-structuring pipeline code and eligibility helpers
- retired workflow/risk heuristics that parsed benchmark or filing payload internals directly

They are not active product workflows, active routes, or active user-facing surfaces.

## Not current scope

These are explicitly out of scope for the active product:

- financing platform workflows
- capital stack assembly as a user-facing product area
- direct regulator submission transport
- generic business intelligence dashboards
- financing marketplace or lender workflow orchestration

## Operator rule

When adding new surfaces or backend paths, prefer governed compliance summaries, persisted artifacts, and auditable workflow state. Do not reintroduce financing as an active dependency or product framing.
