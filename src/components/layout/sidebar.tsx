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
        className="fixed left-3 top-3 z-50 rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col bg-white border-r border-slate-200/60 text-slate-600 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="border-b border-slate-200/60 px-5">
          <div className="flex h-14 items-center justify-between">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 text-sm font-bold tracking-tight text-slate-900 transition-opacity hover:opacity-80"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-400 shadow-[0_2px_8px_-2px_rgba(6,182,212,0.5)]">
                <Zap size={14} className="text-white fill-white" />
              </div>
              Quoin
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-900 transition-colors lg:hidden"
            >
              <X size={16} />
            </button>
          </div>
          {/* Accent gradient strip */}
          <div className="h-0.5 -mx-5 bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 opacity-60" />
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
                    ? "bg-slate-50 text-emerald-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] border border-slate-100"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon 
                  size={16} 
                  strokeWidth={active ? 2 : 1.5} 
                  className={`transition-colors duration-200 ${active ? "text-emerald-500" : "text-slate-400 group-hover:text-slate-600"}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        {/* Footer Area inside Sidebar (Optional placeholder for bottom items) */}
        <div className="p-4 border-t border-slate-200/60">
          <div className="rounded-lg bg-slate-50 p-3 flex flex-col gap-1 text-xs border border-slate-100">
            <span className="font-medium text-slate-800">Enterprise Plan</span>
            <span className="text-emerald-600 font-medium">All systems operational</span>
          </div>
        </div>
      </aside>
    </>
  );
}
