import {
  auditChanges,
  type AuditLookups,
  type AuditRow,
} from "@/features/finance/audit-format";

/**
 * US-24.1: a readable `polje: staro → novo`. An insert lists what was set, an update only
 * what actually moved, and a void or an anonymization is a change like any other — both
 * are recorded as their own action, so the row already says which it was.
 */
export function AuditDiff({
  row,
  lookups,
}: {
  row: AuditRow;
  lookups: AuditLookups;
}) {
  const changes = auditChanges(row, lookups);
  if (changes.length === 0)
    return <span className="text-muted-foreground">—</span>;

  return (
    <ul className="grid gap-0.5">
      {changes.map((change) => (
        <li key={change.column} className="text-xs">
          <span className="text-muted-foreground">{change.label}: </span>
          {row.action === "insert" ? (
            <span>{change.after}</span>
          ) : (
            <>
              <span className="text-muted-foreground line-through">
                {change.before}
              </span>
              <span aria-hidden="true"> → </span>
              <span>{change.after}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
