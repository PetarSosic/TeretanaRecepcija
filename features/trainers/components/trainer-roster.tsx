import { Check } from "lucide-react";
import Link from "next/link";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { classTimeLabel } from "@/features/memberships/class-time";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import type { RosterGroup, RosterTrainer } from "../roster";

const t = me.trainerRoster;

/** The class time that opens a group's header row (`Uto, čet, sub · 08:00`). */
function groupTime(group: RosterGroup) {
  return group.startsAt === null
    ? t.noClassTime
    : classTimeLabel({ starts_at: group.startsAt, weekdays: group.weekdays });
}

/** The counts that follow the class time in the header row. */
function groupCounts(group: RosterGroup) {
  const parts = [t.memberCount.replace("{count}", String(group.rows.length))];
  if (group.heldToday)
    parts.push(
      t.attended
        .replace("{came}", String(group.attended))
        .replace("{total}", String(group.rows.length)),
    );
  return parts.join(" · ");
}

/**
 * S-29 (D-72, BR-027): one table per trainer, one block per fixed class time. The price
 * column and the total are rendered only when `showPrices` is set, and their values come
 * from the owner-only fin_roster_prices (BR-157).
 */
export function TrainerRoster({
  trainers,
  showPrices,
}: {
  trainers: RosterTrainer[];
  showPrices: boolean;
}) {
  const columns = showPrices ? 6 : 5;

  return (
    <div className="grid grid-cols-1 gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.intro}</p>
      </div>

      {trainers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        trainers.map((trainer) => (
          <section
            key={trainer.trainerId}
            aria-labelledby={`trainer-${trainer.trainerId}`}
          >
            <h2
              id={`trainer-${trainer.trainerId}`}
              className="mb-3 text-lg font-semibold"
            >
              {trainer.trainerName}
            </h2>
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <Th className="w-10">{t.row}</Th>
                    <Th>{t.member}</Th>
                    <Th>{t.plan}</Th>
                    <Th>{t.paidOn}</Th>
                    <Th>{t.today}</Th>
                    {showPrices ? (
                      <Th className="text-right">{t.price}</Th>
                    ) : null}
                  </tr>
                </thead>
                {trainer.groups.map((group) => (
                  <tbody key={group.key} data-testid="roster-group">
                    <tr className="bg-muted/60">
                      <Td colSpan={columns} className="font-medium">
                        {/* D-78: the class time is bold, so each class stands out. */}
                        <span className="font-bold">{groupTime(group)}</span>
                        {" · "}
                        {groupCounts(group)}
                        {group.startsAt === null ? (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {t.noClassTimeHint}
                          </span>
                        ) : null}
                      </Td>
                    </tr>
                    {group.rows.length === 0 ? (
                      <tr>
                        <Td
                          colSpan={columns}
                          className="text-sm text-muted-foreground"
                        >
                          {t.emptyTime}
                        </Td>
                      </tr>
                    ) : (
                      group.rows.map((row, index) => (
                        <tr key={row.membership_id}>
                          <Td className="tabular-nums text-muted-foreground">
                            {index + 1}
                          </Td>
                          <Td>
                            <Link
                              href={`/members/${row.member_id}`}
                              className="underline underline-offset-4"
                            >
                              #{row.member_number} {row.first_name}{" "}
                              {row.last_name}
                            </Link>
                          </Td>
                          <Td>{row.plan_name}</Td>
                          <Td className="whitespace-nowrap tabular-nums">
                            {row.paid_on ? formatDate(row.paid_on) : t.notCame}
                          </Td>
                          <Td className="whitespace-nowrap tabular-nums">
                            {!group.heldToday ? null : row.checked_in_at ? (
                              <span className="inline-flex items-center gap-1 text-success">
                                <Check aria-hidden="true" className="size-4" />
                                {formatTime(row.checked_in_at)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {t.notCame}
                              </span>
                            )}
                          </Td>
                          {showPrices ? (
                            <Td className="text-right tabular-nums">
                              {row.amount ? formatMoney(row.amount) : t.notCame}
                            </Td>
                          ) : null}
                        </tr>
                      ))
                    )}
                    {group.extras.length ? (
                      <tr>
                        <Td colSpan={columns} className="text-sm">
                          <span className="font-medium text-danger">
                            {t.notOnList}
                          </span>{" "}
                          {group.extras.map((extra, index) => (
                            <span key={extra.member_id}>
                              {index ? ", " : null}
                              <Link
                                href={`/members/${extra.member_id}`}
                                className="underline underline-offset-4"
                              >
                                #{extra.member_number} {extra.first_name}{" "}
                                {extra.last_name}
                              </Link>{" "}
                              ({formatTime(extra.checked_in_at)}
                              {extra.is_unpaid ? `, ${t.unpaid}` : null})
                            </span>
                          ))}
                        </Td>
                      </tr>
                    ) : null}
                  </tbody>
                ))}
                {showPrices && trainer.total !== null ? (
                  <tfoot>
                    <tr>
                      <Td
                        colSpan={columns - 1}
                        className="text-right font-semibold"
                      >
                        {t.total.replace("{trainer}", trainer.trainerName)}
                      </Td>
                      <Td className="text-right font-semibold tabular-nums">
                        {formatMoney(trainer.total)}
                      </Td>
                    </tr>
                  </tfoot>
                ) : null}
              </Table>
            </TableWrapper>
          </section>
        ))
      )}
    </div>
  );
}
