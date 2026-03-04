import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env["DATABASE_URL"]!,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Base (admin) client — superuser, bypasses RLS.
// Used ONLY by: webhook handlers, seed scripts, migrations, tests.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

const CUID_REGEX = /^c[a-z0-9]{7,}$/;

/**
 * Returns a Prisma client scoped to a single tenant via RLS.
 * Every query runs inside a transaction that:
 *   1. Sets app.organization_id for RLS policy evaluation
 *   2. Downgrades from superuser to quoin_app role so RLS is enforced
 */
export function getTenantClient(organizationId: string) {
  if (!organizationId || !CUID_REGEX.test(organizationId)) {
    throw new Error(`Invalid organizationId format: ${organizationId}`);
  }

  return prisma.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ args, query }: { args: any; query: (args: any) => any }) {
          const [, , result] = await prisma.$transaction([
            prisma.$executeRawUnsafe(
              `SELECT set_config('app.organization_id', $1, true)`,
              organizationId
            ),
            prisma.$executeRawUnsafe(`SET LOCAL ROLE quoin_app`),
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}
