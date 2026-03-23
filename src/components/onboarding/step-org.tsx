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
 <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Organization</h2>
 <p className="mt-2 text-base text-zinc-500 leading-relaxed">
 You&apos;re already part of <strong className="font-semibold text-zinc-900">{organization.name}</strong>.
 </p>
 </div>
 <button
 type="button"
 onClick={onNext}
 className="w-full bg-zinc-900 px-4 py-3 text-base font-semibold text-white hover:bg-zinc-800 transition-all active:scale-[0.98]"
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
 <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Create your organization</h2>
 <p className="mt-2 text-base text-zinc-500 leading-relaxed">
 This is the company or entity that owns or manages the buildings.
 </p>
 </div>

 <div className="space-y-2">
 <label htmlFor="org-name" className="block text-sm font-semibold tracking-wide text-zinc-700">
 Organization name
 </label>
 <input
 id="org-name"
 type="text"
 value={orgName}
 onChange={(e) => setOrgName(e.target.value)}
 placeholder="e.g., Acme Property Management"
 className="block w-full border border-zinc-300 px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-shadow"
 onKeyDown={(e) => e.key === "Enter" && handleCreate()}
 />
 </div>

 {error && (
 <div className="border-l-2 border-red-500 bg-red-50/50 pl-4 py-3">
 <p className="text-sm font-medium text-red-800">{error}</p>
 </div>
 )}

 <button
 type="button"
 onClick={handleCreate}
 disabled={loading || !orgName.trim()}
 className="w-full bg-zinc-900 px-4 py-3 text-base font-semibold text-white hover:bg-zinc-800 transition-all disabled:opacity-50 active:scale-[0.98]"
 >
 {loading ? "Creating…" : "Create & continue"}
 </button>
 </div>
 );
}
