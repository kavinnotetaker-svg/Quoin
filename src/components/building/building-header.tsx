const PROPERTY_LABELS: Record<string, string> = {
  OFFICE: "Office",
  MULTIFAMILY: "Multifamily",
  MIXED_USE: "Mixed Use",
  OTHER: "Other",
};

interface BuildingHeaderProps {
  name: string;
  address: string;
  propertyType: string;
  grossSquareFeet: number;
  yearBuilt: number | null;
  onUpload: () => void;
}

export function BuildingHeader({
  name,
  address,
  propertyType,
  grossSquareFeet,
  yearBuilt,
  onUpload,
}: BuildingHeaderProps) {
  const details = [
    PROPERTY_LABELS[propertyType] ?? propertyType,
    `${grossSquareFeet.toLocaleString()} SF`,
    yearBuilt ? `Built ${yearBuilt}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-xl font-medium text-gray-900">{name}</h1>
        <p className="mt-0.5 text-sm text-gray-500">{address}</p>
        <p className="mt-0.5 text-xs text-gray-400">{details}</p>
      </div>
      <button
        onClick={onUpload}
        className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700 hover:bg-gray-50"
      >
        Upload Data
      </button>
    </div>
  );
}
