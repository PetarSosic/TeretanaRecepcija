import { describe, expect, it } from "vitest";
import { memberFieldsSchema, registerSchema } from "@/features/members/schemas";
import { pauseSchema, saleFieldsSchema } from "@/features/memberships/schemas";
import { parseDateInput, typeDateInput } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { parseCardCode } from "@/lib/scan";

describe("parseCardCode (BR-070)", () => {
  it("accepts exactly ten digits, trimmed", () => {
    expect(parseCardCode(" 1234567890 ")).toBe("1234567890");
    expect(parseCardCode("1234567890\n")).toBe("1234567890");
  });
  it("rejects everything else", () => {
    for (const input of [
      "",
      "123456789",
      "12345678901",
      "12345abcde",
      "12 34567890",
    ])
      expect(parseCardCode(input)).toBeNull();
  });
});

describe("parseDateInput (S-05, BR-002)", () => {
  it("reads dd.mm.yyyy and the picker's yyyy-mm-dd", () => {
    expect(parseDateInput("05.03.1995")).toBe("1995-03-05");
    expect(parseDateInput("5.3.1995")).toBe("1995-03-05");
    expect(parseDateInput("05.03.1995.")).toBe("1995-03-05");
    expect(parseDateInput("1995-03-05")).toBe("1995-03-05");
  });
  it("rejects dates that do not exist", () => {
    expect(parseDateInput("31.02.2027")).toBeNull();
    expect(parseDateInput("29.02.2027")).toBeNull();
    expect(parseDateInput("29.02.2028")).toBe("2028-02-29");
    expect(parseDateInput("1995/03/05")).toBeNull();
    expect(parseDateInput("")).toBeNull();
  });
});

/** Types the text one key at a time, as the field applies typeDateInput after each. */
function typed(keys: string) {
  return [...keys].reduce((value, key) => typeDateInput(value + key), "");
}

describe("typeDateInput (S-05, D-79)", () => {
  it("adds the dots while digits alone are typed", () => {
    expect(typed("15031990")).toBe("15.03.1990");
    expect(typed("1503")).toBe("15.03.");
    expect(parseDateInput(typed("05031995"))).toBe("1995-03-05");
  });
  it("keeps dots typed by hand, without doubling them", () => {
    expect(typed("1.3.1990")).toBe("1.3.1990");
    expect(typed("15.03.1990")).toBe("15.03.1990");
    expect(typed("1.03.1990")).toBe("1.03.1990");
  });
  it("splits a third digit in a row and eight pasted digits", () => {
    expect(typeDateInput("150")).toBe("15.0");
    expect(typeDateInput("15.031")).toBe("15.03.1");
    expect(typeDateInput("15031990")).toBe("15.03.1990");
  });
  it("leaves anything else as it is", () => {
    expect(typeDateInput("1")).toBe("1");
    expect(typeDateInput("1995-03-05")).toBe("1995-03-05");
    expect(typeDateInput("15.03.199")).toBe("15.03.199");
  });
});

const member = {
  firstName: " Ana ",
  lastName: "Ćosić",
  phone: "067 123 456",
  email: " ANA@Example.ME ",
  dateOfBirth: "05.03.1995",
};

describe("memberFieldsSchema (BR-040, BR-041)", () => {
  it("trims, normalizes the phone and lowercases the email", () => {
    expect(memberFieldsSchema.parse(member)).toEqual({
      firstName: "Ana",
      lastName: "Ćosić",
      phone: "+38267123456",
      email: "ana@example.me",
      dateOfBirth: "1995-03-05",
    });
  });
  it("names the field that is wrong", () => {
    const result = memberFieldsSchema.safeParse({
      ...member,
      firstName: "",
      email: "ana",
      dateOfBirth: "31.12.1899",
    });
    expect(result.success).toBe(false);
    const messages = Object.fromEntries(
      (result.error?.issues ?? []).map((issue) => [
        issue.path[0],
        issue.message,
      ]),
    );
    expect(messages.firstName).toBe(me.members.firstNameInvalid);
    expect(messages.email).toBe(me.members.emailInvalid);
    expect(messages.dateOfBirth).toBe(me.members.dateOfBirthInvalid);
  });
  it("refuses emoji in either name, and nothing else (N-16)", () => {
    for (const [firstName, lastName, field, message] of [
      ["Ana😀", "Anić", "firstName", me.members.firstNameEmoji],
      ["Marko❤️", "Marković", "firstName", me.members.firstNameEmoji],
      ["Ana", "Anić 🇲🇪", "lastName", me.members.lastNameEmoji],
      ["Ana", "👍🏽", "lastName", me.members.lastNameEmoji],
      ["Ana", "Kafa☕", "lastName", me.members.lastNameEmoji],
    ] as const) {
      const result = memberFieldsSchema.safeParse({
        ...member,
        firstName,
        lastName,
      });
      expect(result.success, `${firstName} ${lastName}`).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({ path: [field], message });
    }
    for (const [firstName, lastName] of [
      ["Ćira", "Šušnjić-Žižić"],
      ["Ђорђе", "Петровић"],
      ["Sean", "O'Brien"],
      ["<script>", "alert(1)"],
      ["Jovan ©", "Jovanović"],
    ])
      expect(
        memberFieldsSchema.safeParse({ ...member, firstName, lastName })
          .success,
        `${firstName} ${lastName}`,
      ).toBe(true);
  });
});

const sale = {
  planId: "11111111-1111-4111-8111-111111111111",
  planKind: "gym",
  requiresTrainer: "false",
  trainerId: "",
  sessions: "",
  amount: "",
  method: "cash",
  startOverride: "",
};

describe("saleFieldsSchema (S-08)", () => {
  it("leaves a list-price amount to the database (BR-059)", () => {
    const value = saleFieldsSchema.parse(sale);
    expect(value.amount).toBeNull();
    expect(value.startOverride).toBeNull();
  });
  it("keeps money as a decimal string, never a float (BR-003)", () => {
    expect(saleFieldsSchema.parse({ ...sale, amount: "79,5" }).amount).toBe(
      "79.50",
    );
  });
  it("asks Personalni for its amount, sessions and trainer (BR-058, BR-059)", () => {
    const result = saleFieldsSchema.safeParse({
      ...sale,
      planKind: "personal",
      requiresTrainer: "true",
    });
    expect(result.success).toBe(false);
    const fields = (result.error?.issues ?? []).map((issue) => issue.path[0]);
    expect(fields).toEqual(
      expect.arrayContaining(["amount", "sessions", "trainerId"]),
    );
  });
  it("limits the session count to 1–50", () => {
    const base = {
      ...sale,
      planKind: "personal",
      amount: "120",
      requiresTrainer: "false",
    };
    expect(saleFieldsSchema.safeParse({ ...base, sessions: "0" }).success).toBe(
      false,
    );
    expect(
      saleFieldsSchema.safeParse({ ...base, sessions: "51" }).success,
    ).toBe(false);
    expect(saleFieldsSchema.parse({ ...base, sessions: "10" }).sessions).toBe(
      10,
    );
  });
  it("requires a payment method (BR-090)", () => {
    const result = saleFieldsSchema.safeParse({ ...sale, method: "" });
    expect(result.error?.issues[0]?.message).toBe(
      me.memberships.methodRequired,
    );
  });
  it("asks Grupni and G+T for the fixed class time (D-71)", () => {
    const group = {
      ...sale,
      planKind: "group",
      requiresTrainer: "true",
      coversGroup: "true",
      trainerId: "22222222-2222-4222-8222-222222222222",
    };
    const result = saleFieldsSchema.safeParse(group);
    expect(
      result.error?.issues.find((issue) => issue.path[0] === "classTime")
        ?.message,
    ).toBe(me.errors.E_CLASS_TIME_REQUIRED);
    expect(
      saleFieldsSchema.parse({ ...group, classTime: "08:00:00" }).classTime,
    ).toBe("08:00:00");
    expect(
      saleFieldsSchema.safeParse({ ...group, classTime: "25:00" }).success,
    ).toBe(false);
  });
  it("does not ask a gym plan or Personalni for a class time (D-71)", () => {
    expect(saleFieldsSchema.parse(sale).classTime ?? null).toBeNull();
    expect(
      saleFieldsSchema.safeParse({
        ...sale,
        planKind: "personal",
        requiresTrainer: "true",
        coversGroup: "false",
        trainerId: "22222222-2222-4222-8222-222222222222",
        amount: "120",
        sessions: "10",
      }).success,
    ).toBe(true);
  });
});

describe("registerSchema (BR-033)", () => {
  it("refuses a registration without a scanned card", () => {
    const result = registerSchema.safeParse({
      ...member,
      ...sale,
      cardCode: "",
    });
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.find((issue) => issue.path[0] === "cardCode")
        ?.message,
    ).toBe(me.members.cardRequired);
  });
  it("accepts a complete registration", () => {
    const value = registerSchema.parse({
      ...member,
      ...sale,
      cardCode: "1234567890",
    });
    expect(value.cardCode).toBe("1234567890");
    expect(value.phone).toBe("+38267123456");
  });
});

describe("saleFieldsSchema: the gym's fixed part of Personalni (D-99)", () => {
  const personal = {
    ...sale,
    planKind: "personal",
    requiresTrainer: "false",
    sessions: "10",
    amount: "100",
  };
  it("leaves an empty field to the trainer's fee", () => {
    expect(saleFieldsSchema.parse(personal).gymFee).toBeNull();
    expect(
      saleFieldsSchema.parse({ ...personal, gymFee: "" }).gymFee,
    ).toBeNull();
  });
  it("keeps a typed part as a decimal string, from 0 to the amount", () => {
    expect(saleFieldsSchema.parse({ ...personal, gymFee: "30,5" }).gymFee).toBe(
      "30.50",
    );
    expect(saleFieldsSchema.parse({ ...personal, gymFee: "0" }).gymFee).toBe(
      "0.00",
    );
    expect(saleFieldsSchema.parse({ ...personal, gymFee: "100" }).gymFee).toBe(
      "100.00",
    );
  });
  it("refuses more than the amount, or text, under its own field", () => {
    for (const gymFee of ["100,01", "abc", "-5"]) {
      const result = saleFieldsSchema.safeParse({ ...personal, gymFee });
      expect(result.error?.issues[0]?.path[0], gymFee).toBe("gymFee");
      expect(result.error?.issues[0]?.message, gymFee).toBe(
        me.memberships.gymFeeInvalid,
      );
    }
  });
});

describe("pauseSchema (BR-056, D-100)", () => {
  const pause = {
    memberId: "11111111-1111-4111-8111-111111111111",
    membershipId: "22222222-2222-4222-8222-222222222222",
    pauseFrom: "2026-10-05",
    days: "3",
  };
  it("takes a day and 1 to 7 days", () => {
    expect(pauseSchema.parse(pause).days).toBe(3);
    expect(pauseSchema.parse({ ...pause, days: "7" }).days).toBe(7);
  });
  it("refuses 0, 8 or a part of a day", () => {
    for (const days of ["0", "8", "1.5", ""])
      expect(pauseSchema.safeParse({ ...pause, days }).success, days).toBe(
        false,
      );
  });
  it("needs a date", () => {
    expect(
      pauseSchema.safeParse({ ...pause, pauseFrom: "" }).error?.issues[0]
        ?.message,
    ).toBe(me.memberships.pauseFromInvalid);
  });
});
