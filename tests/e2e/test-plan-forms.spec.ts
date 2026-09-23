import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3: the form boundaries of the Kritično cases left DJELOMIČNO on
// 22.09.2026 (MEM-04, MEM-06, MEM-15, CLOSE-03, FIN-06, SET-02, MSHIP-07), driven
// through the real forms against one synthetic gym (D-56).
test.describe.configure({ mode: "serial" });

const PASSWORD = "formelozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
let owner: TestStaff;
let receptionist: TestStaff;
const plan = { mjesecna: "", personalni: "", dnevna: "" };
let trainerId: string;
const member = { edit: "", anon: "", anonNumber: 0 };
let emptyCard: string;
let categoryId: string;

function gymDate(days: number): { iso: string; display: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const iso = date.toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-");
  return { iso, display: `${d}.${m}.${y}` };
}

async function must<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  const { data, error } = await query;
  if (error || data === null)
    throw new Error(`${what} not created: ${error?.message}`);
  return data;
}

test.beforeAll(async ({}, workerInfo) => {
  test.skip(workerInfo.project.name !== "desktop");
  gymId = await createTestGym(`${workerInfo.project.name}-forms-${suffix()}`);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik formi",
    password: PASSWORD,
  });
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcija formi",
    password: PASSWORD,
  });
  const admin = adminClient();

  trainerId = (
    await must(
      admin
        .from("trainers")
        .insert({ gym_id: gymId, full_name: "E2E Trener" })
        .select("id")
        .single<{ id: string }>(),
      "Test trainer",
    )
  ).id;
  await must(
    admin
      .from("trainer_finance")
      .insert({ trainer_id: trainerId, gym_id: gymId, personal_gym_fee: 80 })
      .select("trainer_id"),
    "Test trainer finance",
  );
  const program = await must(
    admin
      .from("programs")
      .insert({ gym_id: gymId, name: "E2E Personalni", kind: "personal" })
      .select("id")
      .single<{ id: string }>(),
    "Test program",
  );
  await must(
    admin
      .from("trainer_programs")
      .insert({ gym_id: gymId, trainer_id: trainerId, program_id: program.id })
      .select("trainer_id"),
    "Test assignment",
  );

  const plans = await must(
    admin
      .from("plans")
      .insert([
        {
          gym_id: gymId,
          name: "E2E Mjesečna",
          kind: "gym",
          duration_value: 1,
          duration_unit: "month",
          price: 79,
          covers_gym: true,
          covers_personal: false,
          requires_trainer: false,
          sort_order: 1,
        },
        {
          gym_id: gymId,
          name: "E2E Personalni",
          kind: "personal",
          duration_value: 1,
          duration_unit: "month",
          price: null,
          covers_gym: false,
          covers_personal: true,
          requires_trainer: true,
          sort_order: 2,
        },
        {
          gym_id: gymId,
          name: "E2E Dnevna karta",
          kind: "day_pass",
          duration_value: null,
          duration_unit: null,
          price: 5,
          covers_gym: true,
          covers_personal: false,
          requires_trainer: false,
          sort_order: 3,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  const id = (name: string) => plans.find((p) => p.name === name)!.id;
  plan.mjesecna = id("E2E Mjesečna");
  plan.personalni = id("E2E Personalni");
  plan.dnevna = id("E2E Dnevna karta");
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((p) => ({ plan_id: p.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );

  const members = await must(
    admin
      .from("members")
      .insert([
        {
          gym_id: gymId,
          member_number: 1,
          first_name: "E2E Uređivanje",
          last_name: "Člana",
          phone: "+38267300001",
          email: "uredi@e2e.invalid",
          date_of_birth: "1990-01-01",
          created_by: owner.id,
        },
        {
          gym_id: gymId,
          member_number: 2,
          first_name: "E2E Anonimni",
          last_name: "Kandidat",
          phone: "+38267300002",
          email: "anon@e2e.invalid",
          date_of_birth: "1985-05-05",
          created_by: owner.id,
        },
      ])
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  member.edit = members.find((m) => m.member_number === 1)!.id;
  member.anon = members.find((m) => m.member_number === 2)!.id;
  member.anonNumber = 2;
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: 2 })
      .select("gym_id"),
    "Test member counter",
  );
  // MEM-15: history that must survive the anonymization.
  const membership = await must(
    admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: member.anon,
        plan_id: plan.mjesecna,
        start_date: gymDate(-10).iso,
        end_date: gymDate(20).iso,
        start_reason: "E2E",
        covers_gym: true,
        covers_group: false,
        covers_personal: false,
        is_backdated: true,
        created_by: owner.id,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test membership",
  );
  await must(
    admin
      .from("visits")
      .insert(
        [1, 2, 3].map((daysAgo) => {
          const at = new Date(Date.now() - daysAgo * 86_400_000);
          return {
            gym_id: gymId,
            member_id: member.anon,
            membership_id: membership.id,
            visit_type: "gym",
            is_backdated: true,
            checked_in_at: at.toISOString(),
            checked_out_at: new Date(at.getTime() + 3_600_000).toISOString(),
            checked_in_by: owner.id,
          };
        }),
      )
      .select("id"),
    "Test visits",
  );

  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 1, created_by: owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  emptyCard = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  await must(
    admin
      .from("cards")
      .insert({
        gym_id: gymId,
        code: emptyCard,
        batch_id: batch.id,
        status: "unassigned",
      })
      .select("id"),
    "Test card",
  );
  categoryId = (
    await must(
      admin
        .from("expense_categories")
        .insert({ gym_id: gymId, name: "E2E Struja" })
        .select("id")
        .single<{ id: string }>(),
      "Test category",
    )
  ).id;
});

test.afterAll(async ({}, workerInfo) => {
  if (workerInfo.project.name === "desktop") await deleteTestGym(gymId);
});

async function signIn(page: Page, who: TestStaff) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(who.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

/** The message rendered right under one field, if any. */
async function fieldError(dialog: Locator, label: string): Promise<string> {
  const input = dialog.getByLabel(label, { exact: true });
  const describedBy = await input.getAttribute("aria-describedby");
  if (!describedBy) return "";
  // A field may point at a hint and its error; the error is the one that counts.
  const ids = describedBy.split(/\s+/);
  const id = ids.find((value) => value.endsWith("error")) ?? ids[0];
  const error = dialog.locator(`[id="${id}"]`);
  return (await error.count())
    ? ((await error.textContent()) ?? "").trim()
    : "";
}

const NAME_FIRST = "Unesite ime (1–50 znakova).";
const NAME_LAST = "Unesite prezime (1–50 znakova).";
const EMAIL = "Unesite ispravan email.";
const DOB = "Unesite datum rođenja (dd.mm.gggg), od 01.01.1900 do danas.";

test("MEM-04: empty, too long and blank member fields are refused under each field", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.getByRole("button", { name: "Počni rad" }).click();
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(emptyCard);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Novi član" }),
  ).toBeVisible();
  const save = dialog.getByRole("button", { name: "Sačuvaj" });
  await dialog.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByLabel("Telefon").fill("069 444 555");
  await dialog.getByLabel("Datum rođenja", { exact: true }).fill("01.02.2000");

  const cases: [string, string, string, string, string][] = [
    // first, last, email, field, expected
    ["", "Član", "", "Ime", NAME_FIRST],
    ["A".repeat(51), "Član", "", "Ime", NAME_FIRST],
    ["   ", "Član", "", "Ime", NAME_FIRST],
    ["Ana", "", "", "Prezime", NAME_LAST],
    ["Ana", "B".repeat(51), "", "Prezime", NAME_LAST],
    ["Ana", "Član", "ana@", "Email", EMAIL],
    ["Ana", "Član", `${"a".repeat(245)}@e2e.invalid`, "Email", EMAIL],
  ];
  for (const [first, last, email, field, expected] of cases) {
    await dialog.getByLabel("Ime", { exact: true }).fill(first);
    await dialog.getByLabel("Prezime").fill(last);
    await dialog.getByLabel("Email").fill(email);
    await save.click();
    await expect
      .poll(() => fieldError(dialog, field), {
        message: `${field}=${first}|${last}|${email}`,
      })
      .toBe(expected);
    // The dialog stays open and keeps what was typed.
    await expect(dialog.getByLabel("Ime", { exact: true })).toHaveValue(first);
    await expect(dialog.getByLabel("Telefon")).toHaveValue("069 444 555");
  }
  const { count } = await adminClient()
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId);
  expect(count).toBe(2);

  // Exactly 50 characters is accepted.
  const fifty = "A".repeat(50);
  await dialog.getByLabel("Ime", { exact: true }).fill(fifty);
  await dialog.getByLabel("Prezime").fill("Član");
  await dialog.getByLabel("Email").fill("pedeset@e2e.invalid");
  await save.click();
  await expect(dialog.getByText(/^Član #\d+ je kreiran\./)).toBeVisible({
    timeout: 15_000,
  });
});

test("MEM-06: date of birth formats and bounds", async ({ page }) => {
  await signIn(page, owner);
  await page.goto(`/members/${member.edit}`);
  const tomorrow = gymDate(1).display;
  const cases: [string, boolean][] = [
    ["15.03.1995", true],
    ["1.3.1995", true],
    ["01.01.1900", true],
    ["31.12.1899", false],
    ["31.02.2000", false],
    ["29.02.2024", true],
    ["29.02.2023", false],
    [tomorrow, false],
    ["15/03/1995", false],
    ["", false],
  ];
  for (const [value, accepted] of cases) {
    await page.getByRole("button", { name: "Uredi podatke" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Datum rođenja", { exact: true }).fill(value);
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    if (accepted) {
      await expect(dialog, value).toBeHidden();
      const { data } = await adminClient()
        .from("members")
        .select("date_of_birth")
        .eq("id", member.edit)
        .single<{ date_of_birth: string }>();
      const [d, m, y] = value.split(".");
      expect(data?.date_of_birth, value).toBe(
        `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
      );
    } else {
      await expect
        .poll(() => fieldError(dialog, "Datum rođenja"), { message: value })
        .not.toBe("");
      const message = await fieldError(dialog, "Datum rođenja");
      note(`MEM-06 "${value}" → ${message}`);
      expect(message, value).toBe(DOB);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }

  // The calendar button writes the chosen date as dd.mm.gggg.
  await page.getByRole("button", { name: "Uredi podatke" }).click();
  const dialog = page.getByRole("dialog");
  const picker = dialog.locator('input[type="date"]');
  note(`MEM-06 date inputs in dialog: ${await picker.count()}`);
  if (await picker.count()) {
    await picker.first().fill("1994-07-08");
    await expect(
      dialog.getByLabel("Datum rođenja", { exact: true }),
    ).toHaveValue("08.07.1994");
  }
  await page.keyboard.press("Escape");
});

test("MEM-15: anonymization needs the exact member number and keeps the history", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto(`/members/${member.anon}`);
  await page.getByRole("button", { name: "Anonimiziraj" }).click();
  const dialog = page.getByRole("dialog");
  note(`MEM-15 text: ${(await dialog.textContent())?.slice(0, 200)}`);
  await dialog.getByLabel("Broj člana").fill("999");
  await dialog.getByRole("button", { name: "Anonimiziraj trajno" }).click();
  await expect(
    dialog.getByText("Upisani broj se ne poklapa sa brojem člana."),
  ).toBeVisible();
  const { data: still } = await adminClient()
    .from("members")
    .select("is_anonymized")
    .eq("id", member.anon)
    .single<{ is_anonymized: boolean }>();
  expect(still?.is_anonymized).toBe(false);

  await dialog.getByLabel("Broj člana").fill(String(member.anonNumber));
  await dialog.getByRole("button", { name: "Anonimiziraj trajno" }).click();
  await expect(page.getByText("Član je anonimiziran.").first()).toBeVisible();

  const admin = adminClient();
  const { data: after } = await admin
    .from("members")
    .select("first_name, last_name, phone, email, date_of_birth, is_anonymized")
    .eq("id", member.anon)
    .single();
  note(`MEM-15 stored after: ${JSON.stringify(after)}`);
  expect(after?.is_anonymized).toBe(true);
  expect(JSON.stringify(after)).not.toContain("Anonimni");
  expect(JSON.stringify(after)).not.toContain("Kandidat");
  expect(JSON.stringify(after)).not.toContain("+38267300002");
  expect(JSON.stringify(after)).not.toContain("anon@e2e.invalid");
  expect(JSON.stringify(after)).not.toContain("1985-05-05");
  const memberships = await admin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("member_id", member.anon);
  const visits = await admin
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("member_id", member.anon);
  expect(memberships.count).toBe(1);
  expect(visits.count).toBe(3);

  await page.goto("/members");
  await page.getByLabel("Pretraga člana (ime, telefon, broj)").fill("Anonimni");
  await expect(
    page.getByText("Nema članova koji odgovaraju pretrazi."),
  ).toBeVisible();
  await page
    .getByLabel("Pretraga člana (ime, telefon, broj)")
    .fill("067300002");
  await expect(
    page.getByText("Nema članova koji odgovaraju pretrazi."),
  ).toBeVisible();

  await page.goto(
    `/stats/visits?period=custom&from=${gymDate(-7).iso}&to=${gymDate(0).iso}`,
  );
  await expect(page.getByText("Najčešći članovi")).toBeVisible();
  await expect(page.getByText("Anonimni")).toHaveCount(0);
  const section = await page.locator("body").textContent();
  note(
    `MEM-15 stats mentions anonymized row: ${/anonim/i.test(section ?? "") ? "yes" : "no"}`,
  );
});

const COUNTED = "Unesite prebrojanu gotovinu, na primjer 225 ili 225,50.";

test("CLOSE-03: counted cash is required, validated, and shows Manjak/Višak", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.getByRole("button", { name: "Počni rad" }).click();
  // Five more euros of cash income on top of MEM-04's registration.
  await page.getByRole("button", { name: "Dnevna karta" }).click();
  const pass = page.getByRole("dialog");
  await pass
    .getByText("Gotovina", { exact: true })
    .click()
    .catch(() => {});
  await pass.getByRole("button", { name: "Naplati" }).click();
  await expect(
    page.getByText(/^Prodato: 1 × dnevna karta/).first(),
  ).toBeVisible();

  await page.goto("/shift/close");
  const field = page.getByLabel("Prebrojana gotovina (€)");
  const submit = page.getByRole("button", {
    name: "Zaključi smjenu i odjavi me",
  });
  // Before anything is typed the button is simply disabled.
  await expect(submit).toBeDisabled();
  await expect(page.getByText(COUNTED)).toHaveCount(0);
  // N-10: every invalid form, the emptied field included, now says why.
  for (const value of ["abc", "-10", "12,345", ""]) {
    await field.fill(value);
    await expect(page.getByText(COUNTED).first(), value).toBeVisible();
    await expect(submit, value).toBeDisabled();
    await expect(field, value).toHaveAttribute("aria-invalid", "true");
  }
  await expect(page).toHaveURL(/\/shift\/close/);
  // MEM-04 registered a member with a cash Mjesečna (79,00 €), so 84,00 € is expected.
  await field.fill("79");
  await expect(page.getByText("Razlika: -5,00 € (Manjak)")).toBeVisible();
  await field.fill("89");
  await expect(page.getByText("Razlika: 5,00 € (Višak)")).toBeVisible();
  await expect(page.getByText(COUNTED)).toHaveCount(0);
  await expect(submit).toBeEnabled();
  const { data } = await adminClient()
    .from("shifts")
    .select("closed_at")
    .eq("gym_id", gymId)
    .is("closed_at", null);
  expect(data).toHaveLength(1);
});

const AMOUNT = "Unesite iznos između 0,01 i 100.000,00 €.";

async function expenseCount(): Promise<number> {
  const { count } = await adminClient()
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId);
  return count ?? 0;
}
const DESCRIPTION = "Unesite opis (2–200 znakova).";

test("FIN-06: expense amount, description, date, supplier and invoice bounds", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page, owner);
  await page.goto("/finance/expenses?period=year");

  async function attempt(values: {
    amount?: string;
    description?: string;
    date?: string;
    supplier?: string;
    invoice?: string;
  }) {
    await page.getByRole("button", { name: "Novi trošak" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Kategorija", { exact: true })
      .selectOption(categoryId);
    await dialog.getByLabel("Opis").fill(values.description ?? "E2E trošak");
    await dialog.getByLabel("Iznos (€)").fill(values.amount ?? "10");
    if (values.date) await dialog.locator("#expense-date").fill(values.date);
    await dialog.getByLabel("Način", { exact: true }).selectOption("card");
    if (values.supplier !== undefined)
      await dialog.locator("#expense-supplier").fill(values.supplier);
    if (values.invoice !== undefined)
      await dialog.locator("#expense-invoice").fill(values.invoice);
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    return dialog;
  }

  async function refused(dialog: Locator, text: string, label: string) {
    await expect(dialog.getByText(text).first(), label).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  async function saved(label: string) {
    await expect(
      page.getByText("Trošak je sačuvan.").first(),
      label,
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  for (const amount of ["0", "0,001", "100000,01"])
    await refused(await attempt({ amount }), AMOUNT, amount);
  for (const amount of ["0,01", "100000"]) {
    await attempt({ amount, description: `E2E iznos ${amount}` });
    await saved(amount);
  }
  for (const description of ["A", "B".repeat(201)])
    await refused(
      await attempt({ description }),
      DESCRIPTION,
      `opis ${description.length}`,
    );

  const tomorrow = await attempt({ date: gymDate(1).iso });
  const dateMessage = await tomorrow
    .locator('[id="expense-date"]')
    .getAttribute("aria-describedby");
  note(
    `FIN-06 tomorrow message: ${dateMessage ? await tomorrow.locator(`[id="${dateMessage}"]`).textContent() : "(no describedby)"}`,
  );
  await refused(tomorrow, "Unesite datum koji nije u budućnosti.", "sutra");
  await attempt({ date: gymDate(-35).iso, description: "E2E prošli mjesec" });
  await saved("prošli mjesec");

  // N-11: both used to be refused without any message.
  await refused(
    await attempt({ supplier: "S".repeat(101) }),
    "Dobavljač može imati najviše 100 znakova.",
    "dobavljač 101",
  );
  await refused(
    await attempt({ invoice: "R".repeat(51) }),
    "Račun može imati najviše 50 znakova.",
    "račun 51",
  );
  await attempt({
    supplier: "S".repeat(100),
    invoice: "R".repeat(50),
    description: "E2E granice teksta",
  });
  await saved("dobavljač 100 i račun 50");
  expect(await expenseCount()).toBe(4);
});

const USERNAME =
  "Korisničko ime može imati samo mala slova, brojeve, tačku i donju crtu (3–30 znakova).";

test("SET-02: username rules on S-23", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, owner);
  await page.goto("/settings/users");
  const tag = suffix()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 4);

  async function create(username: string) {
    await page.getByRole("button", { name: "Novi korisnik" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Uloga")).toBeVisible();
    // N-12: a reopened dialog must not carry the previous attempt's message.
    const stale = await dialog.getByText(USERNAME).count();
    if (stale) note(`SET-02 stale message before typing "${username}"`);
    expect(stale, `stale message before ${username}`).toBe(0);
    await dialog.getByLabel("Uloga").selectOption("receptionist");
    await dialog.getByLabel("Ime i prezime").fill(`E2E Korisnik ${tag}`);
    await dialog.getByLabel("Korisničko ime").fill(username);
    await dialog.getByLabel("Privremena lozinka").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    return dialog;
  }
  // A created user closes the dialog; a refused one keeps it open with the message.
  async function outcome(dialog: Locator): Promise<string> {
    const refusal = dialog
      .getByText(USERNAME)
      .or(dialog.getByText("Korisničko ime je zauzeto."));
    await expect
      .poll(
        async () => (await dialog.count()) === 0 || (await refusal.count()) > 0,
        // Creating an Auth user is the slowest action here; under a busy dev server
        // it has taken longer than the default 10 s.
        { timeout: 30_000 },
      )
      .toBe(true);
    if ((await dialog.count()) === 0) return "created";
    const message = (await dialog.getByText(USERNAME).count())
      ? USERNAME
      : "Korisničko ime je zauzeto.";
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    return message;
  }

  const three = `q${tag.slice(0, 2)}`;
  const thirty = `e2e${tag}`.padEnd(30, "x");
  const cases: [string, string][] = [
    ["ab", USERNAME],
    [three, "created"],
    [thirty, "created"],
    [`${thirty}y`, USERNAME],
    [`marija-${tag}`, USERNAME],
    [`marija ${tag}`, USERNAME],
    ["марија", USERNAME],
    [`marija.${tag}`, "created"],
    [`marija.${tag}`, "Korisničko ime je zauzeto."],
  ];
  for (const [username, expected] of cases)
    expect(await outcome(await create(username)), username).toBe(expected);

  const upper = `Mx${tag}`;
  const result = await outcome(await create(upper));
  const { data } = await adminClient()
    .from("staff")
    .select("username")
    .eq("gym_id", gymId)
    .ilike("username", upper);
  note(`SET-02 "${upper}" → ${result}; stored ${JSON.stringify(data)}`);
});

test("MSHIP-07: a personal package needs an amount and sessions", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.goto(`/members/${member.edit}`);
  await page.getByRole("button", { name: "Nova članarina" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vrsta članarine").selectOption(plan.personalni);
  await dialog.getByLabel("Trener").selectOption(trainerId);
  await expect(dialog.getByText("Minimalno 80,00 €")).toBeVisible();
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect
    .poll(() => fieldError(dialog, "Iznos (€)"))
    .toBe("Unesite iznos, na primjer 79 ili 79,50.");
  await expect
    .poll(() => fieldError(dialog, "Broj termina"))
    .toBe("Unesite broj termina od 1 do 50.");
  const { count } = await adminClient()
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("member_id", member.edit);
  expect(count).toBe(0);
  console.log(`[note] all: ${notes.join(" | ")}`);
});
