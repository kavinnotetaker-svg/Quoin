"use client";

import Link from "next/link";

export function StepDone() {
  return (
    <div className="space-y-8 text-center py-6">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 shadow-sm ring-4 ring-emerald-50/50">
        <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">You&apos;re all set</h2>
        <p className="text-[15px] font-medium text-slate-500 leading-relaxed max-w-sm mx-auto">
          Your account is ready. Head to the dashboard to view your buildings
          and track BEPS compliance.
        </p>
      </div>

      <div className="space-y-4 pt-4">
        <Link
          href="/dashboard"
          className="block w-full rounded-lg bg-slate-900 px-4 py-3 text-center text-[15px] font-semibold text-white shadow-md hover:bg-slate-800 transition-all active:scale-[0.98]"
        >
          Go to dashboard
        </Link>
        <Link
          href="/dashboard"
          className="block text-[13px] font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          You can always add more buildings from the dashboard
        </Link>
      </div>
    </div>
  );
}
