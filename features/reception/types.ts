// The JSON shapes the M-07 RPCs return (migration 0014), shared by the actions and the
// screens.

export type VisitType = "gym" | "group" | "personal";

export type MemberBrief = {
  id: string;
  member_number: number;
  first_name: string;
  last_name: string;
};

/** BR-079: what S-03b, S-03c or S-03d shows after a check-in. */
export type CheckInResult = {
  visit_id: string;
  member: MemberBrief;
  visit_type: VisitType;
  covered: boolean;
  plan_name: string | null;
  end_date: string | null;
  status: "active" | "upcoming" | "used_up" | "expired" | "voided" | null;
  /** null = Neograničeno */
  remaining: number | null;
  unpaid_count: number;
  trainer_defaults: { group: string | null; personal: string | null };
};

export type Candidate = {
  id: string;
  plan_name: string;
  end_date: string;
  trainer_id: string | null;
  remaining: number | null;
};

/** BR-073 to BR-076, as check_in_options decides them. */
export type CheckInOptions = {
  types: VisitType[];
  preselect: VisitType;
  candidates: Partial<Record<VisitType, Candidate[]>>;
  group_trainers: {
    id: string;
    full_name: string;
    default_slot: string | null;
  }[];
  personal_trainers: { id: string; full_name: string }[];
  slots: { id: string; trainer_id: string; starts_at: string }[];
  fallback_group_trainer: string | null;
};

/** BR-070: every answer a scan (or a manual start) can give. */
export type ScanOutcome =
  | { result: "invalid" | "unknown" | "deactivated" }
  | { result: "unassigned"; code: string }
  | {
      result: "confirm_checkout";
      visit_id: string;
      member: MemberBrief;
      seconds: number;
    }
  | {
      result: "checked_out";
      visit_id: string;
      member: MemberBrief;
      duration_seconds: number;
    }
  | { result: "checked_in"; check_in: CheckInResult }
  | {
      result: "choose";
      member: MemberBrief;
      manual: boolean;
      options: CheckInOptions;
    };

export type InGymRow = {
  visit_id: string;
  member_id: string;
  member_number: number;
  first_name: string;
  last_name: string;
  visit_type: VisitType;
  checked_in_at: string;
};

export type ReceptionPanel = { in_gym: InGymRow[]; today_count: number };

export type SearchResult = {
  id: string;
  member_number: number;
  first_name: string;
  last_name: string;
  phone: string | null;
};
