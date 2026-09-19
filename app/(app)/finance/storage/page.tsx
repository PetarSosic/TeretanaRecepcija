import type { Metadata } from "next";
import { PeriodPicker } from "@/features/finance/components/period-picker";
import {
  StorageReport,
  type DailyRow,
  type StockInRow,
  type StorageProductRow,
} from "@/features/finance/components/storage-report";
import { periodFromParams } from "@/features/finance/period";
import { requireStaff } from "@/lib/auth";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.finance.storageTitle} — ${me.app.name}`,
};

type Report = {
  products: StorageProductRow[];
  daily: DailyRow[];
  stock_ins: StockInRow[];
};

/** S-20 (F-15 for the owner). The layout has already refused every other role. */
export default async function StorageReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const staff = await requireStaff();
  const period = periodFromParams(
    await searchParams,
    await gymToday(staff.gym_id),
  );

  const supabase = await createClient();
  const report = await supabase.rpc("fin_storage", {
    p_from: period.from,
    p_to: period.to,
  });
  const data = (report.data as Report | null) ?? {
    products: [],
    daily: [],
    stock_ins: [],
  };

  return (
    <div className="grid gap-6">
      <PeriodPicker period={period} />
      <StorageReport
        products={data.products}
        daily={data.daily}
        stockIns={data.stock_ins}
      />
    </div>
  );
}
