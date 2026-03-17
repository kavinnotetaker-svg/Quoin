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
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-zinc-300"
        >
          <p className="text-sm font-medium text-zinc-500">{item.label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            {item.value}
          </p>
          {item.subtitle && (
            <p
              className="mt-1.5 text-[13px] font-medium"
              style={{ color: item.subtitleColor ?? "var(--muted-foreground)" }}
            >
              {item.subtitle}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
