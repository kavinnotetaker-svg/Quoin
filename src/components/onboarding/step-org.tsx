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
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Organization</h2>
          <p className="mt-1 text-sm text-gray-500">
            You&apos;re already part of <strong>{organization.name}</strong>.
          </p>
        </div>
        <button
          type="button"
          onClick={onNext}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Continue
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Create your organization</h2>
        <p className="mt-1 text-sm text-gray-500">
          This is the company or entity that owns or manages the buildings.
        </p>
      </div>

      <div>
        <label htmlFor="org-name" className="block text-sm font-medium text-gray-700">
          Organization name
        </label>
        <input
          id="org-name"
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="e.g., Acme Property Management"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleCreate}
        disabled={loading || !orgName.trim()}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create & continue"}
      </button>
    </div>
  );
}
