import "dotenv/config";
import { execSync } from "node:child_process";
import process from "node:process";
import { Client } from "pg";

function getBaseDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}

function buildDatabaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function runCommand(command, env) {
  execSync(command, {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ...env,
    },
  });
}

async function dropDatabase(client, databaseName) {
  await client.query(
    `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1
        AND pid <> pg_backend_pid()
    `,
    [databaseName],
  );
  await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
}

async function main() {
  const baseUrl = getBaseDatabaseUrl();
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(
    /[^a-z0-9_]/gi,
    "_",
  );
  const testDb = `quoin_integration_${nonce}`;
  const adminUrl = buildDatabaseUrl(baseUrl, "postgres");
  const adminClient = new Client({ connectionString: adminUrl });
  await adminClient.connect();

  try {
    await adminClient.query(`CREATE DATABASE "${testDb}"`);
    const testUrl = buildDatabaseUrl(baseUrl, testDb);

    runCommand("npx prisma migrate deploy", {
      DATABASE_URL: testUrl,
    });
    runCommand("npx prisma generate", {
      DATABASE_URL: testUrl,
    });
    runCommand("npx vitest run test/integration --maxWorkers 1 --no-file-parallelism", {
      DATABASE_URL: testUrl,
    });
  } finally {
    await dropDatabase(adminClient, testDb).catch(() => undefined);
    await adminClient.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
