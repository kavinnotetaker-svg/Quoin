"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

interface StepConnectProps {
  buildingId: string | null;
  onNext: () => void;
  onSkip: () => void;
}

export function StepConnect({ buildingId, onNext, onSkip }: StepConnectProps) {
  const [espmPropertyId, setEspmPropertyId] = useState("");
  const updateBuilding = trpc.building.update.useMutation();

  const handleConnect = async () => {
    if (!buildingId || !espmPropertyId.trim()) {
      onNext();
      return;
    }

    try {
      await updateBuilding.mutateAsync({
        id: buildingId,
        data: { espmPropertyId: espmPropertyId.trim() },
      });
      onNext();
    } catch (error) {
      console.error("Failed to connect ESPM", error);
    }
  };

  const isSaving = updateBuilding.isPending;
  const hasInput = espmPropertyId.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Connect ENERGY STAR Portfolio Manager</h2>
        <p className="mt-1 text-sm text-gray-500">
          Link your ESPM account to automatically sync scores and benchmarking data.
          This step is optional — you can connect later from building settings.
        </p>
      </div>

      <div className="rounded-md border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-900">How it works</h3>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600">
          <li>Log in to your ESPM account at energystar.gov</li>
          <li>Share your property with the Quoin service account</li>
          <li>Enter your ESPM property ID below</li>
          <li>Quoin syncs your score and energy data automatically</li>
        </ol>
      </div>

      {buildingId && (
        <div className="space-y-2">
          <label htmlFor="espmPropertyId" className="block text-sm font-medium text-gray-700">
            ESPM Property ID
          </label>
          <input
            type="text"
            id="espmPropertyId"
            value={espmPropertyId}
            onChange={(e) => setEspmPropertyId(e.target.value)}
            disabled={isSaving}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-900 focus:ring-gray-900 sm:text-sm"
            placeholder="e.g. 1234567"
          />
        </div>
      )}

      <div className="rounded-md bg-gray-50 p-3">
        <p className="text-xs text-gray-500">
          You can also connect via Green Button for automated utility data from Pepco.
          Both options are available in each building&apos;s settings page.
        </p>
      </div>

      <button
        type="button"
        onClick={hasInput ? handleConnect : onNext}
        disabled={isSaving}
        className="w-full flex justify-center items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isSaving ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        {hasInput ? "Connect & Continue" : "Continue"}
      </button>

      <button
        type="button"
        onClick={onSkip}
        disabled={isSaving}
        className="w-full text-center text-sm text-gray-500 hover:text-gray-700 disabled:opacity-70"
      >
        Skip — I&apos;ll connect later
      </button>
    </div>
  );
}
