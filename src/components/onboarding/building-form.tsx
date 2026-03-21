"use client";

import { useState } from "react";
import { BEPS_TARGET_SCORES, PROPERTY_TYPE_LABELS } from "./beps-targets";

export interface BuildingFormData {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  grossSquareFeet: number;
  propertyType: string;
  yearBuilt: number | null;
  bepsTargetScore: number;
  espmPropertyId?: string;
}

interface BuildingFormProps {
  onSubmit: (data: BuildingFormData) => void;
  loading?: boolean;
}

const DC_CENTER = { lat: 38.9072, lng: -77.0369 };

export function BuildingForm({ onSubmit, loading }: BuildingFormProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [sqft, setSqft] = useState("");
  const [propertyType, setPropertyType] = useState("OFFICE");
  const [yearBuilt, setYearBuilt] = useState("");
  const [espmPropertyId, setEspmPropertyId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const targetScore = BEPS_TARGET_SCORES[propertyType] ?? 50;

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) nextErrors.name = "Required";
    if (!address.trim()) nextErrors.address = "Required";

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (!lat || Number.isNaN(parsedLat) || parsedLat < 38.79 || parsedLat > 39.0) {
      nextErrors.lat = "Must be a DC latitude (38.79-39.0)";
    }
    if (!lng || Number.isNaN(parsedLng) || parsedLng < -77.12 || parsedLng > -76.91) {
      nextErrors.lng = "Must be a DC longitude (-77.12 to -76.91)";
    }

    const parsedSqft = parseInt(sqft, 10);
    if (!sqft || Number.isNaN(parsedSqft) || parsedSqft < 10000) {
      nextErrors.sqft = "DC BEPS applies to buildings >= 10,000 sq ft";
    }

    if (yearBuilt) {
      const parsedYearBuilt = parseInt(yearBuilt, 10);
      if (Number.isNaN(parsedYearBuilt) || parsedYearBuilt < 1800 || parsedYearBuilt > 2030) {
        nextErrors.yearBuilt = "Must be between 1800 and 2030";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    onSubmit({
      name: name.trim(),
      address: address.trim(),
      latitude: parseFloat(lat) || DC_CENTER.lat,
      longitude: parseFloat(lng) || DC_CENTER.lng,
      grossSquareFeet: parseInt(sqft, 10),
      propertyType,
      yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) : null,
      bepsTargetScore: targetScore,
      espmPropertyId: espmPropertyId.trim() || undefined,
    });
  }

  const inputClass =
    "mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-[15px] text-zinc-900 shadow-sm placeholder:text-zinc-400 transition-shadow focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900/10";
  const labelClass = "block text-[13px] font-semibold tracking-wide text-zinc-700";
  const errorClass = "mt-1.5 text-xs font-medium text-red-600";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-5">
        <div>
          <label htmlFor="bld-name" className={labelClass}>
            Building name
          </label>
          <input
            id="bld-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g., 1600 K Street NW"
            className={inputClass}
          />
          {errors.name ? <p className={errorClass}>{errors.name}</p> : null}
        </div>

        <div>
          <label htmlFor="bld-type" className={labelClass}>
            Property type
          </label>
          <select
            id="bld-type"
            value={propertyType}
            onChange={(event) => setPropertyType(event.target.value)}
            className={inputClass}
          >
            {Object.entries(PROPERTY_TYPE_LABELS).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="bld-address" className={labelClass}>
          Street address
        </label>
        <input
          id="bld-address"
          type="text"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="e.g., 1600 K Street NW, Washington, DC 20006"
          className={inputClass}
        />
        {errors.address ? <p className={errorClass}>{errors.address}</p> : null}
      </div>

      <div className="grid gap-5">
        <div>
          <label htmlFor="bld-lat" className={labelClass}>
            Latitude
          </label>
          <input
            id="bld-lat"
            type="text"
            inputMode="decimal"
            value={lat}
            onChange={(event) => setLat(event.target.value)}
            placeholder="38.9072"
            className={inputClass}
          />
          {errors.lat ? <p className={errorClass}>{errors.lat}</p> : null}
        </div>

        <div>
          <label htmlFor="bld-lng" className={labelClass}>
            Longitude
          </label>
          <input
            id="bld-lng"
            type="text"
            inputMode="decimal"
            value={lng}
            onChange={(event) => setLng(event.target.value)}
            placeholder="-77.0369"
            className={inputClass}
          />
          {errors.lng ? <p className={errorClass}>{errors.lng}</p> : null}
        </div>

        <div>
          <label htmlFor="bld-sqft" className={labelClass}>
            Gross square footage
          </label>
          <input
            id="bld-sqft"
            type="text"
            inputMode="numeric"
            value={sqft}
            onChange={(event) => setSqft(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder="e.g., 150000"
            className={inputClass}
          />
          {errors.sqft ? <p className={errorClass}>{errors.sqft}</p> : null}
        </div>
      </div>

      <div className="grid gap-5">
        <div>
          <label htmlFor="bld-year" className={labelClass}>
            Year built <span className="font-medium text-zinc-400">(optional)</span>
          </label>
          <input
            id="bld-year"
            type="text"
            inputMode="numeric"
            value={yearBuilt}
            onChange={(event) => setYearBuilt(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder="e.g., 1985"
            className={inputClass}
          />
          {errors.yearBuilt ? <p className={errorClass}>{errors.yearBuilt}</p> : null}
        </div>

        <div>
          <label htmlFor="bld-espm" className={labelClass}>
            ESPM Property ID <span className="font-medium text-zinc-400">(optional)</span>
          </label>
          <input
            id="bld-espm"
            type="text"
            inputMode="numeric"
            value={espmPropertyId}
            onChange={(event) => setEspmPropertyId(event.target.value.replace(/[^0-9]/g, ""))}
            placeholder="e.g., 88762425"
            className={inputClass}
          />
          <p className="mt-2 text-xs font-medium leading-relaxed text-zinc-500">
            Find this in ENERGY STAR Portfolio Manager under property details.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
        <p className="text-[13px] text-zinc-600">
          <span className="font-semibold text-zinc-900">BEPS Cycle 1 target score:</span>{" "}
          <span className="font-bold text-zinc-900">{targetScore}</span>
        </p>
        <p className="mt-1 text-xs font-medium text-zinc-500">
          Based on DC BEPS regulations for {PROPERTY_TYPE_LABELS[propertyType] ?? propertyType} properties.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-500">
          The building record is created first. Data connections and governed artifacts come next.
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full justify-center sm:w-auto"
        >
          {loading ? "Adding..." : "Add building"}
        </button>
      </div>
    </form>
  );
}
