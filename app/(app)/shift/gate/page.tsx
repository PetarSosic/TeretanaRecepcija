import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ShiftGateForm } from "@/features/shifts/components/shift-gate-form";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { getOpenShift } from "@/lib/shift";

export const metadata: Metadata = {
  title: `${me.shift.gateTitle} — ${me.app.name}`,
};

// S-02. BR-110: only receptionists have shifts, so nobody else has a gate to pass.
export default async function ShiftGatePage() {
  const staff = await requireStaff();
  if (staff.role !== "receptionist") notFound();

  const shift = await getOpenShift();

  // Nothing to take over: no shift is open, or the open one is already mine.
  if (!shift || shift.is_mine) redirect("/reception");

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        {me.shift.gateTitle}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {me.shift.gateText
          .replace("{name}", shift.staff_name)
          .replace("{startedAt}", formatDateTime(shift.started_at))}
      </p>
      <ShiftGateForm />
    </div>
  );
}
