import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-gray-200 px-6">
        <span className="text-sm font-semibold text-gray-900">Quoin</span>
        <div className="flex gap-3">
          <Link
            href="/sign-in"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          DC BEPS compliance,
          <br />
          automated.
        </h1>
        <p className="mt-4 max-w-lg text-base text-gray-500">
          Quoin ingests your energy data, calculates compliance status, and
          structures financing — so you hit the December 2026 deadline without
          hiring a consultant.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/sign-up"
            className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Start free
          </Link>
          <Link
            href="/sign-in"
            className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign in
          </Link>
        </div>

        {/* Value props */}
        <div className="mt-16 grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Ingest</p>
            <p className="mt-1 text-sm text-gray-500">
              CSV upload, ENERGY STAR sync, or Green Button — your energy data,
              normalized automatically.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Comply</p>
            <p className="mt-1 text-sm text-gray-500">
              Real-time BEPS score, penalty exposure, and compliance pathway
              recommendations.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Finance</p>
            <p className="mt-1 text-sm text-gray-500">
              CLEER, C-PACE, AHRA, and IRA programs — structured into a capital
              stack that works.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 px-6 py-4">
        <p className="text-center text-xs text-gray-400">
          Quoin &middot; Washington, DC
        </p>
      </footer>
    </div>
  );
}
