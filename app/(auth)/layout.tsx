import { Dumbbell } from "lucide-react";
import { me } from "@/lib/i18n/me";

// S-01 and S-01b: a single centred card, usable from 375 px up (doc 08 §9).
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <main className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Dumbbell aria-hidden="true" className="size-5" />
          </span>
          <span className="text-xl font-bold tracking-tight">
            {me.app.name}
          </span>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}
