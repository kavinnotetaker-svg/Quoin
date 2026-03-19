"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FileText,
  Menu,
  X,
  Zap
} from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Building2;
  disabled?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/buildings", label: "Buildings", icon: Building2 },
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
        className="fixed left-3 top-3 z-50 rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 lg:hidden transition-colors"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      {/* Overlay */}
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-zinc-900/20 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col bg-white border-r border-zinc-200/60 text-zinc-600 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="border-b border-zinc-200/60 px-5">
          <div className="flex h-14 items-center justify-between">
            <Link
              href="/buildings"
              className="flex items-center gap-2.5 text-sm font-bold tracking-tight text-zinc-900 transition-opacity hover:opacity-80"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 shadow-sm">
                <Zap size={14} className="text-white fill-white" />
              </div>
              Quoin
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-900 transition-colors lg:hidden"
              aria-label="Close navigation"
            >
              <X size={16} />
            </button>
          </div>
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
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 ${
                  active
                    ? "text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="sidebarActive"
                    className="absolute inset-0 rounded-lg bg-zinc-100 border border-zinc-200/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon 
                  size={16} 
                  strokeWidth={active ? 2 : 1.5} 
                  className={`relative z-10 transition-colors duration-200 ${active ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"}`}
                />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className="border-t border-zinc-200/60 px-4 py-3 text-xs text-zinc-400">
          Focused compliance workflow
        </div>
      </aside>
    </>
  );
}
