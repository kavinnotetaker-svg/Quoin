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
    <div className="quoin-shell min-h-screen">
      <Sidebar />
      <div className="lg:pl-[220px]">
        <Topbar />
        <main className="mx-auto max-w-[88rem] px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10 animate-in fade-in duration-500">
          {children}
        </main>
      </div>
    </div>
  );
}
