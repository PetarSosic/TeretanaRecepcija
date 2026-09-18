import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";

export const metadata: Metadata = {
  title: `${me.nav.finance} — ${me.app.name}`,
};

// Placeholder for S-16, which is built in M-12. Doc 06 §2 sends owners here after
// login; P-51 makes it owner-only, and doc 04 §2 point 3 answers other roles with 404.
export default async function FinancePage() {
  const staff = await requireStaff();
  // D-58: the admin has every owner permission.
  if (staff.role !== "owner" && staff.role !== "admin") notFound();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {me.nav.finance}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {me.common.comingSoon}
      </p>
    </>
  );
}
