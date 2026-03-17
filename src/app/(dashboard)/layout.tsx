import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-zinc-50/50">
      <Sidebar />
      <div className="lg:pl-[220px]">
        <Topbar />
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500">{children}</main>
      </div>
    </div>
  );
}
