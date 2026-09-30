"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";

/**
 * S-16 sub-navigation: Pregled · Troškovi · Treneri · Smjene · Magacin · Naknadni unos ·
 * Dnevnik izmjena. D-80: a manager has only the tabs not marked `ownerOnly`.
 */
const TABS = [
  { href: "/finance", label: me.finance.overview, ownerOnly: false },
  {
    href: "/finance/expenses",
    label: me.finance.expensesTab,
    ownerOnly: false,
  },
  { href: "/finance/trainers", label: me.finance.trainersTab, ownerOnly: true },
  { href: "/finance/shifts", label: me.finance.shiftsTab, ownerOnly: false },
  { href: "/finance/storage", label: me.finance.storageTab, ownerOnly: true },
  {
    href: "/finance/backdated",
    label: me.finance.backdatedTab,
    ownerOnly: true,
  },
  { href: "/finance/audit", label: me.finance.auditTab, ownerOnly: true },
] as const;

export function FinanceNav({ ownerTabs }: { ownerTabs: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => ownerTabs || !tab.ownerOnly);

  return (
    <nav aria-label={me.finance.title} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b">
        {tabs.map((tab) => {
          const active =
            tab.href === "/finance"
              ? pathname === "/finance"
              : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
