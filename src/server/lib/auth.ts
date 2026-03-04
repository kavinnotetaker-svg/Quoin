import { auth } from "@clerk/nextjs/server";

export interface ServerAuth {
  clerkUserId: string;
  clerkOrgId: string | null | undefined;
  clerkOrgRole: string | null | undefined;
}

export async function getServerAuth(): Promise<ServerAuth> {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  return {
    clerkUserId: userId,
    clerkOrgId: orgId,
    clerkOrgRole: orgRole,
  };
}
