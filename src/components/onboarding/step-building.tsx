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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Add your first building</h2>
        <p className="mt-1 text-sm text-gray-500">
          Enter your DC building details. You can add more buildings later.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <BuildingForm onSubmit={handleSubmit} loading={createBuilding.isPending} />

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
