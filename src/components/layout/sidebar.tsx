"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  FileText,
  Settings,
  Menu,
  X,
  Zap
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/buildings", label: "Buildings", icon: Building2 },
  {
    href: "/reports",
    label: "Reports",
    icon: FileText,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
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
        className="fixed left-3 top-3 z-50 rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 lg:hidden transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col bg-zinc-950 text-zinc-300 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white transition-opacity hover:opacity-80"
          >
            <Zap size={16} className="fill-white" />
            Quoin
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="text-zinc-400 hover:text-white transition-colors lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 ${
                  active
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon 
                  size={16} 
                  strokeWidth={active ? 2 : 1.5} 
                  className={`transition-colors duration-200 ${active ? "text-zinc-950" : "text-zinc-400 group-hover:text-white"}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        {/* Footer Area inside Sidebar (Optional placeholder for bottom items) */}
        <div className="p-4 border-t border-white/10">
          <div className="rounded-lg bg-white/5 p-3 flex flex-col gap-1 text-xs">
            <span className="font-medium text-white">Enterprise Plan</span>
            <span className="text-zinc-500">All systems operational</span>
          </div>
        </div>
      </aside>
    </>
  );
}
