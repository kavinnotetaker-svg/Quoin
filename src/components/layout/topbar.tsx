"use client";

import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";

export function Topbar() {
  return (
    <header className="flex h-12 items-center justify-end gap-3 border-b border-gray-200 bg-white px-4 shadow-sm">
      <OrganizationSwitcher
        appearance={{
          elements: {
            rootBox: "text-[13px]",
            organizationSwitcherTrigger:
              "border border-gray-200 rounded px-2 py-1 text-[13px] text-gray-700 hover:bg-gray-50",
          },
        }}
      />
      <UserButton
        appearance={{
          elements: {
            avatarBox: "w-7 h-7",
          },
        }}
      />
    </header>
  );
}
