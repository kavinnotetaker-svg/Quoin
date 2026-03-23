"use client";

import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";

export function Topbar() {
  return (
    // Stitch: frosted-glass top nav — surface/80 + backdrop-blur + hairline bottom
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-end gap-4 px-6 lg:px-10"
      style={{
        backgroundColor: "rgba(247,249,251,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "0.5px solid rgba(169,180,185,0.3)",
      }}
    >
      <OrganizationSwitcher
        appearance={{
          elements: {
            rootBox: "text-[11px] font-sans font-medium uppercase tracking-[0.15em]",
            organizationSwitcherTrigger:
              "border-0 border-b border-[rgba(169,180,185,0.5)] px-0 py-1 text-[10px] uppercase tracking-widest font-semibold text-[#2a3439] hover:border-[#545f73] transition-colors bg-transparent rounded-none",
          },
        }}
      />
      <div
        className="hidden sm:block"
        style={{ width: "1px", height: "16px", backgroundColor: "rgba(169,180,185,0.4)" }}
      />
      <UserButton
        appearance={{
          elements: {
            avatarBox: "w-8 h-8 rounded-none border border-[rgba(169,180,185,0.4)]",
          },
        }}
      />
    </header>
  );
}
