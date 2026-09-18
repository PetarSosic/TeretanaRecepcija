import type { Metadata } from "next";
import { me } from "@/lib/i18n/me";

export const metadata: Metadata = {
  title: `${me.nav.reception} — ${me.app.name}`,
};

// Placeholder for S-03, which is built in M-05 and M-07. It exists now because doc 06
// §2 sends receptionists and managers here after login.
export default function ReceptionPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {me.nav.reception}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {me.common.comingSoon}
      </p>
    </>
  );
}
