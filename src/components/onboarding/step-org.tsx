"use client";

import { useState } from "react";
import { useOrganizationList, useOrganization } from "@clerk/nextjs";

interface StepOrgProps {
  onNext: () => void;
}

export function StepOrg({ onNext }: StepOrgProps) {
  const { organization } = useOrganization();
  const { createOrganization } = useOrganizationList();
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already has an org — skip ahead
  if (organization) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Organization</h2>
          <p className="mt-2 text-[15px] text-slate-500 leading-relaxed">
            You&apos;re already part of <strong className="font-semibold text-slate-900">{organization.name}</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={onNext}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-[15px] font-semibold text-white shadow-md hover:bg-slate-800 transition-all active:scale-[0.98]"
        >
          Continue Pipeline
        </button>
      </div>
    );
  }

  async function handleCreate() {
    if (!orgName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (createOrganization) {
        await createOrganization({ name: orgName.trim() });
      }
      onNext();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">Create your organization</h2>
        <p className="mt-2 text-[15px] text-slate-500 leading-relaxed">
          This is the company or entity that owns or manages the buildings.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="org-name" className="block text-[13px] font-semibold tracking-wide text-slate-700">
          Organization name
        </label>
        <input
          id="org-name"
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="e.g., Acme Property Management"
          className="block w-full rounded-lg border border-slate-300 px-4 py-3 text-[15px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-shadow"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 border border-red-200">
          <p className="text-[13px] font-medium text-red-800">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleCreate}
        disabled={loading || !orgName.trim()}
        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-[15px] font-semibold text-white shadow-md hover:bg-slate-800 transition-all disabled:opacity-50 active:scale-[0.98]"
      >
        {loading ? "Creating…" : "Create & continue"}
      </button>
    </div>
  );
}
