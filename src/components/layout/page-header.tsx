import React from "react";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        <div className="quoin-kicker">Compliance workbench</div>
        <h1 className="font-display text-4xl font-medium tracking-tight text-zinc-900">{title}</h1>
        {subtitle ? <p className="max-w-3xl text-[15px] leading-7 text-zinc-500">{subtitle}</p> : null}
      </div>
      {children && <div className="flex items-center gap-2 lg:justify-end">{children}</div>}
    </div>
  );
}
