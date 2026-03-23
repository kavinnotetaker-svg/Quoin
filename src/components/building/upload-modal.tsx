"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, FileText } from "lucide-react";

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
    // Stitch: modal overlay
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 w-full h-full cursor-default outline-none"
        style={{ backgroundColor: "rgba(42,52,57,0.5)" }}
        onClick={onClose}
        aria-label="Close modal"
        tabIndex={-1}
      />

      {/* Panel: surface-container-lowest, no radius, ambient shadow */}
      <div
        className="relative w-full max-w-md p-6"
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 0,
          boxShadow: "0 16px 48px 0 rgba(42,52,57,0.12)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p
              className="font-sans text-[10px] font-medium uppercase tracking-[0.2em] mb-1"
              style={{ color: "#717c82" }}
            >
              Data Ingestion
            </p>
            <h2
              className="font-display font-semibold text-lg tracking-tight"
              style={{ color: "#2a3439" }}
            >
              Upload utility data
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 transition-colors"
            style={{ color: "#a9b4b9", borderRadius: 0 }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.color = "#2a3439")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.color = "#a9b4b9")
            }
          >
            <X size={18} />
          </button>
        </div>

        <div>
          {!result ? (
            <>
              {/* Drop zone */}
              <button
                type="button"
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
                className="w-full cursor-pointer px-4 py-10 text-center text-sm focus:outline-none transition-colors"
                style={{
                  border: dragOver
                    ? "1px dashed #545f73"
                    : "1px dashed rgba(169,180,185,0.6)",
                  backgroundColor: dragOver ? "#f0f4f7" : "transparent",
                  borderRadius: 0,
                }}
              >
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText size={20} style={{ color: "#545f73" }} />
                    <p className="font-sans font-medium text-sm" style={{ color: "#2a3439" }}>
                      {file.name}
                    </p>
                    <p className="font-sans text-[11px]" style={{ color: "#a9b4b9" }}>
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload size={20} style={{ color: "#a9b4b9" }} />
                    <p className="font-sans" style={{ color: "#566166" }}>
                      Drop CSV file here or click to browse
                    </p>
                    <p className="font-sans text-[11px] uppercase tracking-widest" style={{ color: "#a9b4b9" }}>
                      .csv · .tsv · .txt · max 10 MB
                    </p>
                  </div>
                )}
              </button>
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
                <p
                  className="mt-3 font-sans text-xs uppercase tracking-wider"
                  style={{ color: "#9f403d" }}
                >
                  {error}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="font-sans text-sm px-4 py-2 transition-colors"
                  style={{ color: "#566166" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#2a3439")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#566166")
                  }
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="font-sans text-[11px] font-semibold uppercase tracking-widest px-5 py-2.5 transition-colors disabled:opacity-40"
                  style={{
                    backgroundColor: "#545f73",
                    color: "#f6f7ff",
                    borderRadius: 0,
                  }}
                >
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Result */}
              <div className="space-y-3 font-sans text-sm">
                {result.success ? (
                  <div
                    className="p-4"
                    style={{
                      borderLeft: "3px solid #006b63",
                      backgroundColor: "#f0f4f7",
                    }}
                  >
                    <p className="font-semibold" style={{ color: "#2a3439" }}>
                      {result.readingsCreated} readings created
                      {result.readingsRejected > 0 &&
                        ` · ${result.readingsRejected} rejected`}
                    </p>
                  </div>
                ) : (
                  <div
                    className="p-4"
                    style={{
                      borderLeft: "3px solid #9f403d",
                      backgroundColor: "#f0f4f7",
                    }}
                  >
                    <p className="font-semibold" style={{ color: "#9f403d" }}>
                      Upload failed
                    </p>
                  </div>
                )}

                {result.warnings.length > 0 && (
                  <div style={{ color: "#566166" }}>
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-xs leading-relaxed">
                        {w}
                      </p>
                    ))}
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div style={{ color: "#9f403d" }}>
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs leading-relaxed">
                        {e}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={onClose}
                  className="font-sans text-sm px-4 py-2 transition-colors"
                  style={{ color: "#566166" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#2a3439")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#566166")
                  }
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
