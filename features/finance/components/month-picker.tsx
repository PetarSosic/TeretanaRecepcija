"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { me } from "@/lib/i18n/me";

/** S-18: the month selector, defaulting to the gym's current month (BR-001). */
export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="month">{me.finance.month}</Label>
      <Input
        id="month"
        type="month"
        value={month}
        className="w-48"
        onChange={(event) => {
          const search = new URLSearchParams(params.toString());
          search.set("month", event.target.value);
          // A different month means a different detail row; start from the table again.
          search.delete("trainer");
          router.push(`${pathname}?${search.toString()}`);
        }}
      />
    </div>
  );
}
