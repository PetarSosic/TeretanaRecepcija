"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { me } from "@/lib/i18n/me";
import { PERIOD_PRESETS, type Period, type PeriodPreset } from "../period";

const LABELS: Record<PeriodPreset, string> = {
  today: me.finance.periodToday,
  week: me.finance.periodWeek,
  month: me.finance.periodMonth,
  last_month: me.finance.periodLastMonth,
  year: me.finance.periodYear,
  custom: me.finance.periodCustom,
};

/**
 * US-17.1 AC1: the shared period control. The choice lives in the URL, so a period
 * survives a reload and can be sent to someone else, and every screen under /finance
 * reads it the same way.
 */
export function PeriodPicker({ period }: { period: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [preset, setPreset] = useState<PeriodPreset>(period.preset);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);

  function go(next: {
    preset: PeriodPreset;
    from?: string;
    to?: string;
  }): void {
    const search = new URLSearchParams(params.toString());
    search.set("period", next.preset);
    if (next.preset === "custom") {
      search.set("from", next.from ?? from);
      search.set("to", next.to ?? to);
    } else {
      search.delete("from");
      search.delete("to");
    }
    router.push(`${pathname}?${search.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="period">{me.finance.period}</Label>
        <Select
          id="period"
          name="period"
          value={preset}
          className="w-48"
          onChange={(event) => {
            const value = event.target.value as PeriodPreset;
            setPreset(value);
            if (value !== "custom") go({ preset: value });
          }}
        >
          {PERIOD_PRESETS.map((value) => (
            <option key={value} value={value}>
              {LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      {preset === "custom" ? (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="from">{me.finance.from}</Label>
            <Input
              id="from"
              type="date"
              value={from}
              className="w-44"
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="to">{me.finance.to}</Label>
            <Input
              id="to"
              type="date"
              value={to}
              className="w-44"
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => go({ preset: "custom", from, to })}
          >
            {me.finance.apply}
          </Button>
        </>
      ) : null}
    </div>
  );
}
