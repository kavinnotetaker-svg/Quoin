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
    const e: Record<string, string> = {};

    if (!name.trim()) e.name = "Required";
    if (!address.trim()) e.address = "Required";

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (!lat || isNaN(parsedLat) || parsedLat < 38.79 || parsedLat > 39.0) {
      e.lat = "Must be a DC latitude (38.79–39.0)";
    }
    if (!lng || isNaN(parsedLng) || parsedLng < -77.12 || parsedLng > -76.91) {
      e.lng = "Must be a DC longitude (-77.12 to -76.91)";
    }

    const parsedSqft = parseInt(sqft, 10);
    if (!sqft || isNaN(parsedSqft) || parsedSqft < 10000) {
      e.sqft = "DC BEPS applies to buildings ≥ 10,000 sq ft";
    }

    if (yearBuilt) {
      const y = parseInt(yearBuilt, 10);
      if (isNaN(y) || y < 1800 || y > 2030) {
        e.yearBuilt = "Must be between 1800 and 2030";
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
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

  const inputClass = "mt-1.5 block w-full rounded-lg border border-slate-300 px-4 py-3 text-[15px] text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-shadow";
  const labelClass = "block text-[13px] font-semibold tracking-wide text-slate-700";
  const errorClass = "mt-1.5 text-xs font-medium text-red-600";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div>
        <label htmlFor="bld-name" className={labelClass}>
          Building name
        </label>
        <input
          id="bld-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., 1600 K Street NW"
          className={inputClass}
        />
        {errors.name && <p className={errorClass}>{errors.name}</p>}
      </div>

      {/* Address */}
      <div>
        <label htmlFor="bld-address" className={labelClass}>
          Street address
        </label>
        <input
          id="bld-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g., 1600 K Street NW, Washington, DC 20006"
          className={inputClass}
        />
        {errors.address && <p className={errorClass}>{errors.address}</p>}
      </div>

      {/* Lat / Lng */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="bld-lat" className={labelClass}>
            Latitude
          </label>
          <input
            id="bld-lat"
            type="text"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="38.9072"
            className={inputClass}
          />
          {errors.lat && <p className={errorClass}>{errors.lat}</p>}
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
            onChange={(e) => setLng(e.target.value)}
            placeholder="-77.0369"
            className={inputClass}
          />
          {errors.lng && <p className={errorClass}>{errors.lng}</p>}
        </div>
      </div>

      {/* Property type */}
      <div>
        <label htmlFor="bld-type" className={labelClass}>
          Property type
        </label>
        <select
          id="bld-type"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
          className={inputClass}
        >
          {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* GSF */}
      <div>
        <label htmlFor="bld-sqft" className={labelClass}>
          Gross square footage
        </label>
        <input
          id="bld-sqft"
          type="text"
          inputMode="numeric"
          value={sqft}
          onChange={(e) => setSqft(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="e.g., 150000"
          className={inputClass}
        />
        {errors.sqft && <p className={errorClass}>{errors.sqft}</p>}
      </div>

      {/* Year built */}
      <div>
        <label htmlFor="bld-year" className={labelClass}>
          Year built <span className="text-slate-400 font-medium">(optional)</span>
        </label>
        <input
          id="bld-year"
          type="text"
          inputMode="numeric"
          value={yearBuilt}
          onChange={(e) => setYearBuilt(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="e.g., 1985"
          className={inputClass}
        />
        {errors.yearBuilt && <p className={errorClass}>{errors.yearBuilt}</p>}
      </div>

      {/* ESPM Property ID (optional) */}
      <div>
        <label htmlFor="bld-espm" className={labelClass}>
          ESPM Property ID <span className="text-slate-400 font-medium">(optional)</span>
        </label>
        <input
          id="bld-espm"
          type="text"
          inputMode="numeric"
          value={espmPropertyId}
          onChange={(e) => setEspmPropertyId(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="e.g., 88762425"
          className={inputClass}
        />
        <p className="mt-2 text-xs text-slate-500 leading-relaxed font-medium">
          Find this in your ENERGY STAR Portfolio Manager account under property details.
        </p>
      </div>

      {/* Target score (auto-populated, read-only) */}
      <div className="rounded-lg bg-slate-50/80 p-4 border border-slate-200">
        <p className="text-[13px] text-slate-600">
          <span className="font-semibold text-slate-900">BEPS Cycle 1 target score:</span>{" "}
          <span className="font-bold text-slate-900">{targetScore}</span>
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500">
          Based on DC BEPS regulations for {PROPERTY_TYPE_LABELS[propertyType] ?? propertyType} properties.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-[15px] font-semibold text-white shadow-md hover:bg-slate-800 transition-all disabled:opacity-50 active:scale-[0.98] mt-2"
      >
        {loading ? "Adding…" : "Add building"}
      </button>
    </form>
  );
}
