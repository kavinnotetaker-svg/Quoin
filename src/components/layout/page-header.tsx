import React from "react";

export function PageHeader({
  title,
  subtitle,
  kicker = "COMPLIANCE WORKBENCH",
  children,
}: {
  title: string;
  subtitle?: string;
  kicker?: string;
  children?: React.ReactNode;
}) {
  return (
    // Stitch: breadcrumb + bold display headline, hairline bottom separator
    <div
      className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-8"
      style={{ borderBottom: "0.5px solid rgba(169,180,185,0.3)" }}
    >
      <div className="space-y-2">
        {/* Kicker: coordinate label */}
        <div
          className="font-sans text-[10px] uppercase tracking-[0.2em]"
          style={{ color: "#717c82" }}
        >
          {kicker}
        </div>
        {/* Title: Space Grotesk display */}
        <h1
          className="font-display font-bold tracking-tight leading-tight"
          style={{ fontSize: "2.441rem", color: "#2a3439" }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className="font-sans text-sm leading-relaxed"
            style={{ color: "#566166", maxWidth: "56rem" }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {children && (
        <div className="flex items-center gap-4 lg:justify-end">{children}</div>
      )}
    </div>
  );
}
