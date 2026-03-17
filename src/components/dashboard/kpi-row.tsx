interface KPIItem {
  label: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: string;
}

export function KPIRow({ items }: { items: KPIItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6">
      {items.map((item) => (
        <div 
          key={item.label}
          className="card-machined overflow-hidden transition-all duration-200 hover:shadow-md hover:border-slate-300"
        >
          {/* Cyan-to-Emerald accent strip at top of each KPI */}
          <div className="h-1 w-full bg-gradient-to-r from-cyan-400 to-emerald-400" />
          <div className="p-5">
            <p className="text-[13px] font-medium text-slate-500 uppercase tracking-wider">{item.label}</p>
            <p className="mt-3 data-value-lg">
              {item.value}
            </p>
            {item.subtitle && (
              <p
                className="mt-2 text-[13px] font-medium"
                style={{ color: item.subtitleColor ?? "rgb(100, 116, 139)" }}
              >
                {item.subtitle}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
