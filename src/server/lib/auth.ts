import {
  requireRouteTenantAccess,
  type AppRole,
  type TenantAccessContext,
} from "@/server/lib/access";

export type ServerAuth = TenantAccessContext;

export async function getServerAuth(
  minimumRole: AppRole = "VIEWER",
): Promise<ServerAuth> {
  return requireRouteTenantAccess(minimumRole);
}
