import { redirect } from "next/navigation";
import { AppHeader } from "@/components/common/app-header";
import { AppStateProvider } from "@/components/common/app-state";
import { signOutAction } from "@/features/auth/actions";
import { getStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { navigationFor } from "@/lib/nav";
import { getOpenShift } from "@/lib/shift";
import { createClient } from "@/lib/supabase/server";

// Doc 04 §2 point 3: the session and role are checked on the server, not only in the
// proxy, so no page renders for a user who may not open it.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (staff.must_change_password) redirect("/change-password");

  const supabase = await createClient();
  const [gym, shift] = await Promise.all([
    supabase
      .from("gyms")
      .select("name")
      .eq("id", staff.gym_id)
      .maybeSingle<{ name: string }>(),
    // BR-110: at most one open shift per gym, named through open_shift_info because
    // doc 07 §6 hides another receptionist's staff row.
    getOpenShift(),
  ]);

  // BR-116 and BR-119: the nightly job closes the shift while the receptionist is still
  // signed in, and an owner may close it from S-19. Their next request ends the session
  // and lands on S-01 with the notice. A receptionist who reaches the S-02 gate always
  // has an open shift to take over, so the gate is not caught by this.
  if (staff.role === "receptionist" && !shift) {
    await supabase.auth.signOut();
    redirect("/login?auto=1");
  }

  const openShift = shift
    ? { staffName: shift.staff_name, startedAt: shift.started_at }
    : null;

  return (
    <AppStateProvider hasOpenShift={openShift !== null}>
      <div className="flex min-h-svh flex-col">
        <AppHeader
          gymName={gym.data?.name ?? me.app.name}
          fullName={staff.full_name}
          roleLabel={me.roles[staff.role]}
          navigation={navigationFor(staff.role)}
          openShift={openShift}
          // BR-113: only a receptionist leaves a shift behind when signing out.
          confirmSignOut={staff.role === "receptionist" && openShift !== null}
          onSignOut={signOutAction}
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </AppStateProvider>
  );
}
