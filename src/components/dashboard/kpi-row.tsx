interface KPIItem {
  label: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: string;
}

export function KPIRow({ items }: { items: KPIItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-xs text-gray-500">{item.label}</p>
          <p className="mt-0.5 text-2xl font-medium text-gray-900">
            {item.value}
          </p>
          {item.subtitle && (
            <p
              className="mt-0.5 text-xs"
              style={{ color: item.subtitleColor ?? "#6b7280" }}
            >
              {item.subtitle}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
