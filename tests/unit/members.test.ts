import { describe, expect, it } from "vitest";
import { memberFieldsSchema, registerSchema } from "@/features/members/schemas";
import { saleFieldsSchema } from "@/features/memberships/schemas";
import { parseDateInput } from "@/lib/format";
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
      const result = memberFieldsSchema.safeParse({ ...member, firstName, lastName });
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
        memberFieldsSchema.safeParse({ ...member, firstName, lastName }).success,
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
