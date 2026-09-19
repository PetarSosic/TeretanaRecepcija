"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";

/** S-16 sub-navigation: Pregled · Troškovi · Treneri · Smjene · Magacin · Naknadni unos · Dnevnik izmjena. */
const TABS = [
  { href: "/finance", label: me.finance.overview },
  { href: "/finance/expenses", label: me.finance.expensesTab },
  { href: "/finance/trainers", label: me.finance.trainersTab },
  { href: "/finance/shifts", label: me.finance.shiftsTab },
  { href: "/finance/storage", label: me.finance.storageTab },
  { href: "/finance/backdated", label: me.finance.backdatedTab },
  { href: "/finance/audit", label: me.finance.auditTab },
] as const;

export function FinanceNav() {
  const pathname = usePathname();

  return (
    <nav aria-label={me.finance.title} className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b">
        {TABS.map((tab) => {
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
