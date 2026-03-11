import "dotenv/config";
import process from "node:process";
import { Client } from "pg";

const CHECKS = [
  {
    name: "meters_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM meters m
      LEFT JOIN buildings b
        ON b.id = m.building_id
       AND b.organization_id = m.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "energy_readings_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM energy_readings er
      LEFT JOIN buildings b
        ON b.id = er.building_id
       AND b.organization_id = er.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "compliance_snapshots_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM compliance_snapshots cs
      LEFT JOIN buildings b
        ON b.id = cs.building_id
       AND b.organization_id = cs.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "green_button_connections_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM green_button_connections gbc
      LEFT JOIN buildings b
        ON b.id = gbc.building_id
       AND b.organization_id = gbc.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "pipeline_runs_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM pipeline_runs pr
      LEFT JOIN buildings b
        ON b.id = pr.building_id
       AND b.organization_id = pr.organization_id
      WHERE pr.building_id IS NOT NULL
        AND b.id IS NULL
    `,
  },
  {
    name: "drift_alerts_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM drift_alerts da
      LEFT JOIN buildings b
        ON b.id = da.building_id
       AND b.organization_id = da.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "compliance_runs_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM compliance_runs cr
      LEFT JOIN buildings b
        ON b.id = cr.building_id
       AND b.organization_id = cr.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "source_artifacts_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM source_artifacts sa
      LEFT JOIN buildings b
        ON b.id = sa.building_id
       AND b.organization_id = sa.organization_id
      WHERE sa.building_id IS NOT NULL
        AND b.id IS NULL
    `,
  },
  {
    name: "evidence_artifacts_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM evidence_artifacts ea
      LEFT JOIN buildings b
        ON b.id = ea.building_id
       AND b.organization_id = ea.organization_id
      WHERE ea.building_id IS NOT NULL
        AND b.id IS NULL
    `,
  },
  {
    name: "benchmark_submissions_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM benchmark_submissions bs
      LEFT JOIN buildings b
        ON b.id = bs.building_id
       AND b.organization_id = bs.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "filing_records_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM filing_records fr
      LEFT JOIN buildings b
        ON b.id = fr.building_id
       AND b.organization_id = fr.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "filing_record_events_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM filing_record_events fre
      LEFT JOIN buildings b
        ON b.id = fre.building_id
       AND b.organization_id = fre.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "filing_packets_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM filing_packets fp
      LEFT JOIN buildings b
        ON b.id = fp.building_id
       AND b.organization_id = fp.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "beps_metric_inputs_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM beps_metric_inputs bmi
      LEFT JOIN buildings b
        ON b.id = bmi.building_id
       AND b.organization_id = bmi.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "beps_prescriptive_items_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM beps_prescriptive_items bpi
      LEFT JOIN buildings b
        ON b.id = bpi.building_id
       AND b.organization_id = bpi.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "beps_alternative_compliance_agreements_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM beps_alternative_compliance_agreements baca
      LEFT JOIN buildings b
        ON b.id = baca.building_id
       AND b.organization_id = baca.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "portfolio_manager_sync_states_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM portfolio_manager_sync_states pmss
      LEFT JOIN buildings b
        ON b.id = pmss.building_id
       AND b.organization_id = pmss.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "operational_anomalies_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM operational_anomalies oa
      LEFT JOIN buildings b
        ON b.id = oa.building_id
       AND b.organization_id = oa.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "operational_anomalies_meter_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM operational_anomalies oa
      LEFT JOIN meters m
        ON m.id = oa.meter_id
      WHERE oa.meter_id IS NOT NULL
        AND (
          m.id IS NULL
          OR m.building_id <> oa.building_id
          OR m.organization_id <> oa.organization_id
        )
    `,
  },
  {
    name: "retrofit_candidates_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM retrofit_candidates rc
      LEFT JOIN buildings b
        ON b.id = rc.building_id
       AND b.organization_id = rc.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "financing_cases_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM financing_cases fc
      LEFT JOIN buildings b
        ON b.id = fc.building_id
       AND b.organization_id = fc.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "financing_case_candidates_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM financing_case_candidates fcc
      LEFT JOIN buildings b
        ON b.id = fcc.building_id
       AND b.organization_id = fcc.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "financing_case_candidates_case_candidate_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM financing_case_candidates fcc
      LEFT JOIN financing_cases fc
        ON fc.id = fcc.financing_case_id
      LEFT JOIN retrofit_candidates rc
        ON rc.id = fcc.retrofit_candidate_id
      WHERE fc.id IS NULL
         OR rc.id IS NULL
         OR fc.organization_id <> fcc.organization_id
         OR fc.building_id <> fcc.building_id
         OR rc.organization_id <> fcc.organization_id
         OR rc.building_id <> fcc.building_id
    `,
  },
  {
    name: "financing_packets_building_org_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM financing_packets fp
      LEFT JOIN buildings b
        ON b.id = fp.building_id
       AND b.organization_id = fp.organization_id
      WHERE b.id IS NULL
    `,
  },
  {
    name: "financing_packets_case_mismatch",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM financing_packets fp
      LEFT JOIN financing_cases fc
        ON fc.id = fp.financing_case_id
      WHERE fc.id IS NULL
         OR fc.organization_id <> fp.organization_id
         OR fc.building_id <> fp.building_id
    `,
  },
  {
    name: "users_without_memberships",
    query: `
      SELECT COUNT(*)::int AS violating_rows
      FROM users u
      LEFT JOIN organization_memberships om
        ON om.user_id = u.id
      WHERE om.id IS NULL
    `,
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    let hasViolations = false;

    for (const check of CHECKS) {
      const result = await client.query(check.query);
      const violatingRows = Number(result.rows[0]?.violating_rows ?? 0);
      if (violatingRows > 0) {
        hasViolations = true;
      }

      console.log(`${check.name}: ${violatingRows}`);
    }

    if (hasViolations) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
