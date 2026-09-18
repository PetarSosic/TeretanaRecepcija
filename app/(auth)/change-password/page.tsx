import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";
import { getStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";

export const metadata: Metadata = {
  title: `${me.password.title} — ${me.app.name}`,
};

// S-01b at first login (AS-18); the same route serves US-01.4 from the user menu.
export default async function ChangePasswordPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  const firstLogin = staff.must_change_password;

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        {firstLogin ? me.password.firstLoginTitle : me.password.title}
      </h1>
      {firstLogin ? (
        <p className="mb-6 text-sm text-muted-foreground">
          {me.password.firstLoginDescription}
        </p>
      ) : (
        <div className="mb-6" />
      )}
      <ChangePasswordForm firstLogin={firstLogin} />
    </>
  );
}
