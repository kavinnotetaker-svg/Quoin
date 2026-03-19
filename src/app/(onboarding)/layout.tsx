import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-zinc-50/80 selection:bg-zinc-200">
      <header className="sticky top-0 z-50 flex h-14 items-center border-b border-zinc-200/80 bg-white/80 px-6 backdrop-blur-md">
        <span className="text-lg font-bold tracking-tight text-zinc-900">Quoin</span>
      </header>
      <main className="mx-auto max-w-xl px-4 py-16 sm:py-24">{children}</main>
    </div>
  );
}
