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
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Upload utility data</h2>
        <p className="mt-2 text-[15px] text-slate-500 leading-relaxed">
          {buildingId
            ? "Upload a Pepco or EUDS CSV file. You can also do this later from the building detail page."
            : "You skipped adding a building. You can upload data later from the building detail page."}
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex flex-col items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-10 text-center transition-colors hover:border-slate-400 hover:bg-slate-50"
      >
        {file ? (
          <div className="space-y-2">
            <p className="text-[15px] font-semibold text-slate-900">{file.name}</p>
            <p className="text-[13px] font-medium text-slate-500">
              {(file.size / 1024).toFixed(1)} KB
            </p>
            <button
              type="button"
              onClick={() => { setFile(null); setResult(null); }}
              className="mt-1 text-[13px] font-medium text-slate-500 underline hover:text-slate-800 transition-colors"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <p className="text-[15px] text-slate-600">
              Drag & drop a CSV file here, or
            </p>
            <label className="mt-2 cursor-pointer text-[15px] font-semibold text-slate-900 underline hover:text-slate-700 transition-colors">
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

      {error && (
        <div className="rounded-lg bg-red-50 p-4 border border-red-200">
          <p className="text-[13px] font-medium text-red-800">{error}</p>
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-slate-50/80 p-4 border border-slate-200 text-[13px]">
          <p className="font-semibold text-slate-900">
            {result.readingsCreated} readings imported
          </p>
          {result.readingsRejected > 0 && (
            <p className="mt-1 font-medium text-slate-500">{result.readingsRejected} rejected</p>
          )}
          {result.warnings.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-xs font-medium text-slate-500 space-y-1">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-4">
        {file && !result && (
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="flex-1 rounded-lg bg-slate-900 px-4 py-3 text-[15px] font-semibold text-white shadow-md hover:bg-slate-800 transition-all disabled:opacity-50 active:scale-[0.98]"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        )}
        {result && (
          <button
            type="button"
            onClick={onNext}
            className="flex-1 rounded-lg bg-slate-900 px-4 py-3 text-[15px] font-semibold text-white shadow-md hover:bg-slate-800 transition-all active:scale-[0.98]"
          >
            Continue Pipeline
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-[13px] font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        Skip for now
      </button>
    </div>
  );
}
