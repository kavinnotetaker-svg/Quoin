"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FileText,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Building2;
  disabled?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/buildings", label: "Work Queue", icon: Building2 },
  {
    href: "/reports",
    label: "Reports",
    icon: FileText,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-50 p-1.5 text-[#566166] hover:bg-[#e8eff3] hover:text-[#2a3439] lg:hidden transition-colors"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(42,52,57,0.4)] lg:hidden transition-opacity duration-300"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar: Stitch — surface-container-low bg, hairline right border */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: "#f0f4f7", borderRight: "0.5px solid rgba(169,180,185,0.3)" }}
      >
        {/* Brand */}
        <div
          className="px-6 py-5"
          style={{ borderBottom: "0.5px solid rgba(169,180,185,0.3)" }}
        >
          <Link
            href="/buildings"
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
          >
            {/* Square monogram */}
            <div
              className="flex h-8 w-8 items-center justify-center"
              style={{ backgroundColor: "#545f73" }}
            >
              <span className="font-display font-bold text-[10px] tracking-widest text-[#f6f7ff]">
                Q
              </span>
            </div>
            <div>
              <div className="font-display font-bold text-base tracking-tight text-[#2a3439]">
                Quoin
              </div>
              <div
                className="font-sans text-[9px] uppercase tracking-[0.2em]"
                style={{ color: "#717c82" }}
              >
                Compliance OS
              </div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 text-[#566166] hover:text-[#2a3439] transition-colors lg:hidden"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-0">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 py-3 px-6 transition-all duration-150"
                style={{
                  borderLeft: active ? "2px solid #2a3439" : "2px solid transparent",
                  color: active ? "#2a3439" : "#566166",
                  backgroundColor: active ? "rgba(255,255,255,0.5)" : "transparent",
                  fontFamily: "var(--font-sans)",
                  fontSize: "11px",
                  fontWeight: active ? 600 : 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = "#2a3439";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(232,239,243,0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.color = "#566166";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }
                }}
              >
                <Icon
                  size={16}
                  strokeWidth={active ? 2 : 1.5}
                  style={{ color: active ? "#2a3439" : "#a9b4b9", flexShrink: 0 }}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-6 py-4 font-sans text-[9px] uppercase tracking-[0.2em]"
          style={{
            borderTop: "0.5px solid rgba(169,180,185,0.3)",
            color: "#a9b4b9",
          }}
        >
          DC BEPS Compliance
        </div>
      </aside>
    </>
  );
}
