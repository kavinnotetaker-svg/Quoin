ALTER TABLE "buildings"
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archived_by_clerk_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "has_financial_distress" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "occupancy_rate" DOUBLE PRECISION;

CREATE INDEX "buildings_organization_id_archived_at_idx"
  ON "buildings"("organization_id", "archived_at");

ALTER TABLE "energy_readings"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "source_kbtu" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "source_factor_used" DOUBLE PRECISION;

ALTER TABLE "compliance_snapshots"
  ADD COLUMN IF NOT EXISTS "total_site_kbtu" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "total_source_kbtu" DOUBLE PRECISION;

CREATE UNIQUE INDEX "energy_readings_idempotency_key_key"
  ON "energy_readings"("idempotency_key");

CREATE UNIQUE INDEX "green_button_connections_subscription_id_key"
  ON "green_button_connections"("subscription_id");

ALTER TABLE "pipeline_runs"
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "pipeline_runs_idempotency_key_key"
  ON "pipeline_runs"("idempotency_key");
