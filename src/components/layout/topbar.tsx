"use client";

import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-4 border-b border-slate-200/60 bg-white/80 px-6 backdrop-blur-md">
      <OrganizationSwitcher
        appearance={{
          elements: {
            rootBox: "text-[13px] font-medium",
            organizationSwitcherTrigger:
              "border border-slate-200 rounded-md px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors bg-white shadow-sm",
          },
        }}
      />
      <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
      <UserButton
        appearance={{
          elements: {
            avatarBox: "w-8 h-8 ring-2 ring-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_1px_2px_-1px_rgba(0,0,0,0.02)]",
          },
        }}
      />
    </header>
  );
}
