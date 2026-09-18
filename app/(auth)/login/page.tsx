import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";
import { me } from "@/lib/i18n/me";

export const metadata: Metadata = {
  title: `${me.login.title} — ${me.app.name}`,
};

// S-01. The ?closed=1 and ?auto=1 notices are set when a shift ends (BR-114, BR-116).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string; auto?: string }>;
}) {
  const parameters = await searchParams;
  const notice =
    parameters.auto === "1"
      ? me.login.shiftAutoClosed
      : parameters.closed === "1"
        ? me.login.shiftClosed
        : undefined;

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {me.login.title}
      </h1>
      <LoginForm notice={notice} />
    </>
  );
}
