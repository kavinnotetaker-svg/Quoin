"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app.error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#f9fafb] text-gray-900">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold">Application error</h1>
          <p className="mt-3 text-sm text-gray-600">
            A client or server exception interrupted rendering. The error was logged.
          </p>
          <button
            onClick={() => reset()}
            className="mt-6 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Retry
          </button>
        </main>
      </body>
    </html>
  );
}
