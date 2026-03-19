"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { BuildingForm, type BuildingFormData } from "./building-form";

interface StepBuildingProps {
  onNext: (buildingId: string) => void;
  onSkip: () => void;
}

export function StepBuilding({ onNext, onSkip }: StepBuildingProps) {
  const [error, setError] = useState<string | null>(null);

  const createBuilding = trpc.building.create.useMutation({
    onSuccess: (data) => onNext(data.id),
    onError: (err) => setError(err.message),
  });

  function handleSubmit(data: BuildingFormData) {
    setError(null);
    createBuilding.mutate({
      name: data.name,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      grossSquareFeet: data.grossSquareFeet,
      propertyType: data.propertyType as "OFFICE" | "MULTIFAMILY" | "MIXED_USE" | "OTHER",
      yearBuilt: data.yearBuilt ?? undefined,
      bepsTargetScore: data.bepsTargetScore,
      espmPropertyId: data.espmPropertyId,
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Add your first building</h2>
        <p className="mt-2 text-[15px] text-zinc-500 leading-relaxed">
          Enter your DC building details. You can add more buildings later.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 border border-red-200">
          <p className="text-[13px] font-medium text-red-800">{error}</p>
        </div>
      )}

      <BuildingForm onSubmit={handleSubmit} loading={createBuilding.isPending} />

      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-[13px] font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
      >
        Skip for now
      </button>
    </div>
  );
}
