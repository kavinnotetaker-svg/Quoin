"use client";

import Link from "next/link";

export function StepDone() {
 return (
 <div className="space-y-8 text-center py-6">
 <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 ring-4 ring-emerald-50/50">
 <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
 </svg>
 </div>

 <div className="space-y-3">
 <h2 className="text-2xl font-bold tracking-tight text-zinc-900">You&apos;re all set</h2>
 <p className="text-base font-medium text-zinc-500 leading-relaxed max-w-sm mx-auto">
 Your account is ready. Head to the dashboard to view your buildings
 and track BEPS compliance.
 </p>
 </div>

 <div className="space-y-4 pt-4">
 <Link
 href="/dashboard"
 className="block w-full bg-zinc-900 px-4 py-3 text-center text-base font-semibold text-white hover:bg-zinc-800 transition-all active:scale-[0.98]"
 >
 Go to dashboard
 </Link>
 <Link
 href="/dashboard"
 className="block text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
 >
 You can always add more buildings from the dashboard
 </Link>
 </div>
 </div>
 );
}
