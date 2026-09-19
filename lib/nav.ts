import type { AppRole } from "@/lib/auth";
import { me } from "@/lib/i18n/me";

export type NavItem = {
  label: string;
  href: string;
  roles: readonly AppRole[];
  /** Doc 06 §2 lists Podešavanja as one entry with screens underneath it. */
  children?: readonly NavItem[];
};

const ALL: readonly AppRole[] = ["admin", "owner", "manager", "receptionist"];
const STAFF_ABOVE_DESK: readonly AppRole[] = ["admin", "owner", "manager"];
const OWNERS: readonly AppRole[] = ["admin", "owner"];

/**
 * Doc 06 §2, in order. D-58: an admin sees everything an owner sees. Entries whose
 * screens belong to a later milestone are listed here but filtered out by IMPLEMENTED,
 * so the table stays a direct copy of the specification.
 */
const ITEMS: readonly NavItem[] = [
  { label: me.nav.reception, href: "/reception", roles: ALL },
  { label: me.nav.members, href: "/members", roles: ALL },
  { label: me.nav.paymentsToday, href: "/payments/today", roles: ALL },
  { label: me.nav.storage, href: "/storage", roles: ALL },
  { label: me.nav.closeShift, href: "/shift/close", roles: ["receptionist"] },
  { label: me.nav.visitStats, href: "/stats/visits", roles: STAFF_ABOVE_DESK },
  { label: me.nav.finance, href: "/finance", roles: OWNERS },
  {
    label: me.nav.settings,
    href: "/settings",
    roles: STAFF_ABOVE_DESK,
    children: [
      { label: me.nav.users, href: "/settings/users", roles: STAFF_ABOVE_DESK },
      {
        label: me.nav.trainers,
        href: "/settings/trainers",
        roles: STAFF_ABOVE_DESK,
      },
      { label: me.nav.cards, href: "/settings/cards", roles: STAFF_ABOVE_DESK },
      { label: me.settings.plansTitle, href: "/settings/plans", roles: OWNERS },
      {
        label: me.settings.productsTitle,
        href: "/settings/products",
        roles: OWNERS,
      },
      { label: me.settings.gymTitle, href: "/settings/gym", roles: OWNERS },
    ],
  },
];

// Routes that exist today. Later milestones add their route here when the screen lands.
const IMPLEMENTED = new Set([
  "/reception",
  "/members",
  "/payments/today",
  "/storage",
  "/finance",
  "/settings/users",
  "/settings/trainers",
  "/settings/cards",
  "/settings/plans",
  "/settings/products",
  "/settings/gym",
]);

export function navigationFor(role: AppRole): NavItem[] {
  return ITEMS.flatMap((item) => {
    if (!item.roles.includes(role)) return [];
    if (!item.children) return IMPLEMENTED.has(item.href) ? [item] : [];
    const children = item.children.filter(
      (child) => child.roles.includes(role) && IMPLEMENTED.has(child.href),
    );
    return children.length ? [{ ...item, children }] : [];
  });
}
