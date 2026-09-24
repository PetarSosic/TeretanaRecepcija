import { notFound } from "next/navigation";
import { FinanceNav } from "@/features/finance/components/finance-nav";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";

/**
 * S-16 to S-22 (doc 06). BR-157 and P-51: finance is the owner's, and the admin has the
 * owner's reach (D-58). Every other role gets 404 here, and the RPCs underneath refuse
 * them again, so no number leaks through a route that was linked by hand.
 */
export default async function FinanceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const staff = await requireStaff();
  if (staff.role !== "owner" && staff.role !== "admin") notFound();

  // Doc 08 §9 (N-24): a grid column sized minmax(0, 1fr), so a wide chart or the tab
  // row scrolls inside its own frame instead of stretching the page past 375 px.
  return (
    <div className="grid grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {me.finance.title}
      </h1>
      <FinanceNav />
      {children}
    </div>
  );
}
