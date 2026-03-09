import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BASE_DATABASE_URL = process.env["DATABASE_URL"]!;
const MAX_TENANT_CLIENTS = 64;
const CUID_REGEX = /^c[a-z0-9]{7,}$/;

function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function buildTenantConnectionString(organizationId: string): string {
  const url = new URL(BASE_DATABASE_URL);
  const existingOptions = url.searchParams.get("options");
  const tenantOptions = [`-c app.organization_id=${organizationId}`, "-c role=quoin_app"];
  const options = [existingOptions, ...tenantOptions]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  url.searchParams.set("options", options);
  return url.toString();
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  tenantPrismaClients?: Map<string, PrismaClient>;
  tenantPrismaOrder?: string[];
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient(BASE_DATABASE_URL);

const tenantPrismaClients =
  globalForPrisma.tenantPrismaClients ?? new Map<string, PrismaClient>();
const tenantPrismaOrder = globalForPrisma.tenantPrismaOrder ?? [];

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.tenantPrismaClients = tenantPrismaClients;
  globalForPrisma.tenantPrismaOrder = tenantPrismaOrder;
}

function rememberTenantClient(organizationId: string, client: PrismaClient) {
  tenantPrismaClients.set(organizationId, client);
  tenantPrismaOrder.push(organizationId);

  while (tenantPrismaOrder.length > MAX_TENANT_CLIENTS) {
    const oldest = tenantPrismaOrder.shift();
    if (!oldest) {
      continue;
    }

    const staleClient = tenantPrismaClients.get(oldest);
    tenantPrismaClients.delete(oldest);
    void staleClient?.$disconnect().catch(() => undefined);
  }
}

export function getTenantClient(organizationId: string) {
  if (!organizationId || !CUID_REGEX.test(organizationId)) {
    throw new Error(`Invalid organizationId format: ${organizationId}`);
  }

  const existingClient = tenantPrismaClients.get(organizationId);
  if (existingClient) {
    return existingClient;
  }

  const tenantClient = createPrismaClient(
    buildTenantConnectionString(organizationId),
  );
  rememberTenantClient(organizationId, tenantClient);
  return tenantClient;
}
