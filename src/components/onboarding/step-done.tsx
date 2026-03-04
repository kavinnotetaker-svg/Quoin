"use client";

import Link from "next/link";

export function StepDone() {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <span className="text-lg">✓</span>
      </div>

      <div>
        <h2 className="text-lg font-medium text-gray-900">You&apos;re all set</h2>
        <p className="mt-1 text-sm text-gray-500">
          Your account is ready. Head to the dashboard to view your buildings
          and track BEPS compliance.
        </p>
      </div>

      <div className="space-y-3">
        <Link
          href="/dashboard"
          className="block w-full rounded-md bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-800"
        >
          Go to dashboard
        </Link>
        <Link
          href="/dashboard"
          className="block text-sm text-gray-500 hover:text-gray-700"
        >
          You can always add more buildings from the dashboard
        </Link>
      </div>
    </div>
  );
}
