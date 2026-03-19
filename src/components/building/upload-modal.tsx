"use client";

import { useState, useRef, useCallback } from "react";
import { X } from "lucide-react";

interface UploadModalProps {
  buildingId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadResult {
  success: boolean;
  readingsCreated: number;
  readingsRejected: number;
  warnings: string[];
  errors: string[];
}

export function UploadModal({
  buildingId,
  onClose,
  onSuccess,
}: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (
      !f.name.endsWith(".csv") &&
      !f.name.endsWith(".tsv") &&
      !f.name.endsWith(".txt")
    ) {
      setError("File must be .csv, .tsv, or .txt");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File too large (max 10MB)");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("buildingId", buildingId);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResult(data);
        onSuccess();
      } else {
        setResult(data);
        if (!data.success) {
          setError(data.errors?.[0] ?? "Upload failed");
        }
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-md rounded bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-zinc-900">
            Upload utility data
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4">
          {!result ? (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded border border-dashed px-4 py-8 text-center text-sm ${
                  dragOver
                    ? "border-zinc-400 bg-zinc-50"
                    : "border-zinc-300"
                }`}
              >
                {file ? (
                  <p className="text-zinc-700">
                    {file.name}{" "}
                    <span className="text-zinc-400">
                      ({(file.size / 1024).toFixed(0)} KB)
                    </span>
                  </p>
                ) : (
                  <p className="text-zinc-500">
                    Drop CSV file here or click to browse
                  </p>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />

              {error && (
                <p className="mt-2 text-[13px] text-red-600">{error}</p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-[13px] text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-[13px] text-white disabled:opacity-40"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Result */}
              <div className="space-y-2 text-[13px]">
                {result.success ? (
                  <p className="text-zinc-900">
                    {result.readingsCreated} readings created
                    {result.readingsRejected > 0 &&
                      `, ${result.readingsRejected} rejected`}
                  </p>
                ) : (
                  <p className="text-red-600">Upload failed</p>
                )}

                {result.warnings.length > 0 && (
                  <div className="text-zinc-500">
                    {result.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div className="text-red-500">
                    {result.errors.map((e, i) => (
                      <p key={i}>{e}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-[13px] text-zinc-500 hover:text-zinc-700"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
