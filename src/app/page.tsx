import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Zap, Download, CheckCircle2, FileText } from "lucide-react";

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect("/buildings");

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 selection:bg-zinc-200 overflow-hidden relative">
      {/* Background Glow */}
      <div className="absolute top-0 inset-x-0 h-[500px] flex justify-center overflow-hidden pointer-events-none">
        <div className="w-[1000px] h-[500px] bg-gradient-to-b from-zinc-200/50 to-transparent blur-3xl opacity-50 rounded-full -tranzinc-y-1/2" />
      </div>

      {/* Header */}
      <header className="flex h-16 w-full items-center justify-between border-b border-zinc-200/80 bg-white/70 px-6 backdrop-blur-xl sticky top-0 z-50 transition-all">
        <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-900">
          <Zap size={20} className="fill-zinc-900" />
          Quoin
        </span>
        <div className="flex items-center gap-5">
          <Link
            href="/sign-in"
            className="text-[14px] font-semibold text-zinc-600 transition-colors hover:text-zinc-900"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 hover:shadow-md hover:-tranzinc-y-0.5 active:tranzinc-y-0"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center py-24 sm:py-32 z-10">
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out fill-mode-both max-w-4xl mx-auto">
          <div className="mb-8 inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm font-medium text-zinc-600 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
            BEPS Cycle 1 Ready
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-zinc-900 sm:text-7xl leading-[1.1]">
            DC BEPS compliance, <br className="hidden sm:block" />
            <span className="text-zinc-500">automated</span>.
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-[17px] text-zinc-500 leading-relaxed font-medium">
            Quoin securely ingests your energy data, calculates compliance status, and
            packages governed evidence so you hit the December 2026 deadline with a
            real operating workflow instead of spreadsheet drift.
          </p>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="w-full sm:w-auto rounded-lg bg-zinc-900 px-8 py-4 text-[15px] font-semibold text-white shadow-lg transition-all hover:bg-zinc-800 hover:shadow-xl hover:-tranzinc-y-1 active:scale-[0.98] active:tranzinc-y-0 flex items-center justify-center gap-2"
            >
              Get started
              <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
            <Link
              href="/sign-in"
              className="w-full sm:w-auto rounded-lg border border-zinc-200/80 bg-white/50 backdrop-blur-sm px-8 py-4 text-[15px] font-semibold text-zinc-900 shadow-sm transition-all hover:bg-white hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Value props */}
        <div className="mt-32 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-3 mx-auto z-10">
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 ease-out fill-mode-both rounded-2xl border border-zinc-200/80 bg-white/80 p-8 shadow-sm text-left transition-all hover:shadow-lg hover:-tranzinc-y-1 group">
            <div className="h-12 w-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-6 border border-zinc-200/80 shadow-sm group-hover:scale-105 transition-transform">
              <Download size={22} className="text-zinc-600" />
            </div>
            <h3 className="text-xl font-bold tracking-tight text-zinc-900">Ingest</h3>
            <p className="mt-3 text-[15px] text-zinc-500 leading-relaxed font-medium">
              CSV upload, ENERGY STAR Portfolio Manager sync, or Green Button integration — your building data,
              normalized automatically.
            </p>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500 ease-out fill-mode-both rounded-2xl border border-zinc-200/80 bg-white/80 p-8 shadow-sm text-left transition-all hover:shadow-lg hover:-tranzinc-y-1 group">
            <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-6 border border-emerald-100 shadow-sm group-hover:scale-105 transition-transform">
              <CheckCircle2 size={22} className="text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold tracking-tight text-zinc-900">Comply</h3>
            <p className="mt-3 text-[15px] text-zinc-500 leading-relaxed font-medium">
              Instantly view real-time BEPS scores, monitor penalty exposure, and receive deterministic compliance pathway
              recommendations.
            </p>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-700 ease-out fill-mode-both rounded-2xl border border-zinc-200/80 bg-white/80 p-8 shadow-sm text-left transition-all hover:shadow-lg hover:-tranzinc-y-1 group">
            <div className="h-12 w-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-6 border border-zinc-200/80 shadow-sm group-hover:scale-105 transition-transform">
              <FileText size={22} className="text-zinc-600" />
            </div>
            <h3 className="text-xl font-bold tracking-tight text-zinc-900">Package</h3>
            <p className="mt-3 text-[15px] text-zinc-500 leading-relaxed font-medium">
              Generate governed packets, reports, and evidence packages that stay traceable to
              the underlying compliance record.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200/80 bg-white px-6 py-10 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-zinc-900">
            <Zap size={16} className="fill-zinc-900" />
            Quoin
          </span>
          <p className="mt-4 md:mt-0 text-[13px] font-medium text-zinc-500">
            &copy; {new Date().getFullYear()} Quoin. All rights reserved. &middot; Washington, DC
          </p>
        </div>
      </footer>
    </div>
  );
}
