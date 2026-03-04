"use client";

import { useState, useCallback } from "react";

interface StepDataProps {
  buildingId: string | null;
  onNext: () => void;
  onSkip: () => void;
}

interface UploadResult {
  success: boolean;
  readingsCreated: number;
  readingsRejected: number;
  warnings: string[];
  errors: string[];
}

export function StepData({ buildingId, onNext, onSkip }: StepDataProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.endsWith(".csv")) {
      setFile(dropped);
      setError(null);
    } else {
      setError("Please upload a CSV file.");
    }
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      if (!buildingId) {
        setError("Please add a building first (go back to Step 2).");
        setUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("buildingId", buildingId);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error ?? `Upload failed (${res.status})`);
      }

      const data = (await res.json()) as UploadResult;
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Upload utility data</h2>
        <p className="mt-1 text-sm text-gray-500">
          {buildingId
            ? "Upload a Pepco or EUDS CSV file. You can also do this later from the building detail page."
            : "You skipped adding a building. You can upload data later from the building detail page."}
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex flex-col items-center rounded-md border-2 border-dashed border-gray-300 p-8 text-center"
      >
        {file ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-500">
              {(file.size / 1024).toFixed(1)} KB
            </p>
            <button
              type="button"
              onClick={() => { setFile(null); setResult(null); }}
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              Drag & drop a CSV file here, or
            </p>
            <label className="mt-2 cursor-pointer text-sm font-medium text-gray-900 underline">
              browse files
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setFile(f); setError(null); }
                }}
              />
            </label>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="rounded-md bg-gray-50 p-3 text-sm">
          <p className="font-medium text-gray-900">
            {result.readingsCreated} readings imported
          </p>
          {result.readingsRejected > 0 && (
            <p className="text-gray-500">{result.readingsRejected} rejected</p>
          )}
          {result.warnings.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-xs text-gray-500">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-3">
        {file && !result && (
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="flex-1 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        )}
        {result && (
          <button
            type="button"
            onClick={onNext}
            className="flex-1 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Continue
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
      >
        Skip for now
      </button>
    </div>
  );
}
