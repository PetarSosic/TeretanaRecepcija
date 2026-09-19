"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";

export type PickableMember = {
  id: string;
  member_number: number;
  first_name: string;
  last_name: string;
  phone: string | null;
};

/**
 * S-22: choosing the member a back-dated record belongs to. The list is the gym's
 * members, already loaded with the page, so the filtering is instant and needs no round
 * trip; BR-044's rules (number exact, name and phone partial, diacritics ignored) are
 * matched here on the same folded text the server search uses.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export function MemberPicker({
  members,
  name = "memberId",
  error,
}: {
  members: PickableMember[];
  name?: string;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<PickableMember | null>(null);

  const needle = fold(query.trim());
  const matches = needle
    ? members
        .filter(
          (member) =>
            String(member.member_number) === needle ||
            fold(`${member.first_name} ${member.last_name}`).includes(needle) ||
            (member.phone ?? "").includes(needle),
        )
        .slice(0, 8)
    : [];

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`${name}-search`}>{me.finance.findMember}</Label>
      <input type="hidden" name={name} value={chosen?.id ?? ""} />
      <Input
        id={`${name}-search`}
        value={
          chosen
            ? `#${chosen.member_number} ${chosen.first_name} ${chosen.last_name}`
            : query
        }
        placeholder={me.finance.searchPlaceholder}
        aria-describedby={`${name}-error`}
        onChange={(event) => {
          setChosen(null);
          setQuery(event.target.value);
        }}
      />
      {matches.length > 0 && !chosen ? (
        <ul className="grid gap-1 rounded-lg border bg-card p-1">
          {matches.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                )}
                onClick={() => {
                  setChosen(member);
                  setQuery("");
                }}
              >
                #{member.member_number} {member.first_name} {member.last_name}
                {member.phone ? (
                  <span className="ml-2 text-muted-foreground">
                    {member.phone}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id={`${name}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
