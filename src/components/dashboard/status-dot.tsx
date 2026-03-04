const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  COMPLIANT: { color: "#16a34a", label: "Compliant" },
  AT_RISK: { color: "#ca8a04", label: "At Risk" },
  NON_COMPLIANT: { color: "#dc2626", label: "Non-Compliant" },
  PENDING_DATA: { color: "#9ca3af", label: "Pending" },
  EXEMPT: { color: "#9ca3af", label: "Exempt" },
};

export function StatusDot({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? { color: "#9ca3af", label: status };
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-700">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: c.color }}
      />
      {c.label}
    </span>
  );
}
