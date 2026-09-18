"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Dumbbell, Menu } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Doc 06 §1: gym name, role-based navigation, shift badge and the user menu. */
export function AppHeader({
  gymName,
  fullName,
  roleLabel,
  navigation,
  openShift,
  confirmSignOut,
  onSignOut,
}: {
  gymName: string;
  fullName: string;
  roleLabel: string;
  navigation: NavItem[];
  /** The gym's open shift, if there is one (BR-110). */
  openShift: { staffName: string; startedAt: string } | null;
  /** BR-113: a receptionist confirms before leaving a shift open. */
  confirmSignOut: boolean;
  onSignOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [confirming, setConfirming] = useState(false);
  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Dumbbell aria-hidden="true" className="size-4" />
          </span>
          <span className="hidden sm:inline">{gymName}</span>
        </Link>

        <nav aria-label={me.nav.menu} className="hidden flex-1 md:block">
          <ul className="flex items-center gap-1">
            {navigation.map((item) =>
              item.children ? (
                <li key={item.href}>
                  <SubMenu item={item} isCurrent={isCurrent} />
                </li>
              ) : (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent(item.href) ? "page" : undefined}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm hover:bg-muted",
                      isCurrent(item.href) && "bg-muted font-medium",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>

        {/* Doc 08 §9: at 375 px the badge and the name give way (truncate) rather
            than push the page sideways; min-w-0 is what lets flex items shrink. */}
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
          <ShiftBadge openShift={openShift} />
          <MobileNav navigation={navigation} isCurrent={isCurrent} />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label={me.nav.account}
                className="min-w-0 shrink"
              >
                <span className="max-w-32 min-w-0 truncate">{fullName}</span>
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-52 rounded-lg border bg-card p-1 shadow-md"
              >
                <DropdownMenu.Label className="px-3 py-2 text-xs text-muted-foreground">
                  {roleLabel}
                </DropdownMenu.Label>
                <DropdownMenu.Item asChild>
                  <Link
                    href="/change-password"
                    className="block rounded-md px-3 py-2 text-sm outline-hidden hover:bg-muted focus:bg-muted"
                  >
                    {me.account.changePassword}
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  asChild
                  onSelect={(event) => {
                    if (confirmSignOut) {
                      event.preventDefault();
                      setConfirming(true);
                    }
                  }}
                >
                  {confirmSignOut ? (
                    <button
                      type="button"
                      className="w-full rounded-md px-3 py-2 text-left text-sm outline-hidden hover:bg-muted focus:bg-muted"
                    >
                      {me.account.signOut}
                    </button>
                  ) : (
                    <form action={onSignOut}>
                      <button
                        type="submit"
                        className="w-full rounded-md px-3 py-2 text-left text-sm outline-hidden hover:bg-muted focus:bg-muted"
                      >
                        {me.account.signOut}
                      </button>
                    </form>
                  )}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* BR-113: logging out leaves the shift open, so it is confirmed first. */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent aria-describedby="signout-description">
          <DialogHeader>
            <DialogTitle>{me.shift.logoutTitle}</DialogTitle>
            <DialogDescription id="signout-description">
              {me.shift.logoutConfirm}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {me.common.cancel}
              </Button>
            </DialogClose>
            <form action={onSignOut}>
              <Button type="submit">{me.shift.signOut}</Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}

/** Doc 06 §1: `Smjena: <ime> od <HH:mm>`, or a grey note that none is open. */
function ShiftBadge({
  openShift,
}: {
  openShift: { staffName: string; startedAt: string } | null;
}) {
  if (!openShift)
    return (
      <span className="max-w-28 min-w-0 truncate text-xs text-muted-foreground sm:max-w-none sm:text-sm">
        {me.shift.none}
      </span>
    );
  return (
    <span className="max-w-36 min-w-0 truncate rounded-lg bg-muted px-2 py-1 text-xs sm:max-w-none sm:px-3 sm:py-1.5 sm:text-sm">
      {me.shift.badge
        .replace("{name}", openShift.staffName)
        .replace("{time}", formatTime(openShift.startedAt))}
    </span>
  );
}

function MobileNav({
  navigation,
  isCurrent,
}: {
  navigation: NavItem[];
  isCurrent: (href: string) => boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild className="md:hidden">
        <Button variant="outline" size="icon" aria-label={me.nav.openMenu}>
          <Menu aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-lg border bg-card p-1 shadow-md md:hidden"
        >
          {navigation
            .flatMap((item) => item.children ?? [item])
            .map((item) => (
              <DropdownMenu.Item key={item.href} asChild>
                <Link
                  href={item.href}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  className="block rounded-md px-3 py-2 text-sm outline-hidden hover:bg-muted focus:bg-muted"
                >
                  {item.label}
                </Link>
              </DropdownMenu.Item>
            ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Doc 06 §2: Podešavanja is one navigation entry holding its screens. */
function SubMenu({
  item,
  isCurrent,
}: {
  item: NavItem;
  isCurrent: (href: string) => boolean;
}) {
  const open = (item.children ?? []).some((child) => isCurrent(child.href));
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-muted",
            open && "bg-muted font-medium",
          )}
        >
          {item.label}
          <ChevronDown aria-hidden="true" className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-52 rounded-lg border bg-card p-1 shadow-md"
        >
          {(item.children ?? []).map((child) => (
            <DropdownMenu.Item key={child.href} asChild>
              <Link
                href={child.href}
                aria-current={isCurrent(child.href) ? "page" : undefined}
                className="block rounded-md px-3 py-2 text-sm outline-hidden hover:bg-muted focus:bg-muted"
              >
                {child.label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
