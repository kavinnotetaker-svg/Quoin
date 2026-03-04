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
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label htmlFor="bld-name" className="block text-sm font-medium text-gray-700">
          Building name
        </label>
        <input
          id="bld-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., 1600 K Street NW"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
      </div>

      {/* Address */}
      <div>
        <label htmlFor="bld-address" className="block text-sm font-medium text-gray-700">
          Street address
        </label>
        <input
          id="bld-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g., 1600 K Street NW, Washington, DC 20006"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address}</p>}
      </div>

      {/* Lat / Lng */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="bld-lat" className="block text-sm font-medium text-gray-700">
            Latitude
          </label>
          <input
            id="bld-lat"
            type="text"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="38.9072"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          {errors.lat && <p className="mt-1 text-xs text-red-600">{errors.lat}</p>}
        </div>
        <div>
          <label htmlFor="bld-lng" className="block text-sm font-medium text-gray-700">
            Longitude
          </label>
          <input
            id="bld-lng"
            type="text"
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="-77.0369"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          {errors.lng && <p className="mt-1 text-xs text-red-600">{errors.lng}</p>}
        </div>
      </div>

      {/* Property type */}
      <div>
        <label htmlFor="bld-type" className="block text-sm font-medium text-gray-700">
          Property type
        </label>
        <select
          id="bld-type"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
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
        <label htmlFor="bld-sqft" className="block text-sm font-medium text-gray-700">
          Gross square footage
        </label>
        <input
          id="bld-sqft"
          type="text"
          inputMode="numeric"
          value={sqft}
          onChange={(e) => setSqft(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="e.g., 150000"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        {errors.sqft && <p className="mt-1 text-xs text-red-600">{errors.sqft}</p>}
      </div>

      {/* Year built */}
      <div>
        <label htmlFor="bld-year" className="block text-sm font-medium text-gray-700">
          Year built <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="bld-year"
          type="text"
          inputMode="numeric"
          value={yearBuilt}
          onChange={(e) => setYearBuilt(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="e.g., 1985"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
        {errors.yearBuilt && <p className="mt-1 text-xs text-red-600">{errors.yearBuilt}</p>}
      </div>

      {/* Target score (auto-populated, read-only) */}
      <div className="rounded-md bg-gray-50 p-3">
        <p className="text-sm text-gray-700">
          <span className="font-medium">BEPS Cycle 1 target score:</span>{" "}
          <span className="font-semibold text-gray-900">{targetScore}</span>
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          Based on DC BEPS regulations for {PROPERTY_TYPE_LABELS[propertyType] ?? propertyType} properties.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Adding…" : "Add building"}
      </button>
    </form>
  );
}
