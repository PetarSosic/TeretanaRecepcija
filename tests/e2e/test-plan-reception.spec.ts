import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3: the remaining steps of the Kritično reception and member cases left
// DJELOMIČNO on 22.09.2026 (REC-02/03/06/07/08/11, MEM-05, MEM-14, MSHIP-03), against
// one synthetic gym (D-56). Serial: the check-ins build on each other.
test.describe.configure({ mode: "serial" });

const PASSWORD = "recepcija2lozinka";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<
  "admin" | "owner" | "manager" | "receptionist",
  TestStaff
>;
const plan = { mjesecna: "", combo: "" };
const member = { ana: "", grupni: "", bozo: "", phone: "" };
const card = { ana: "", grupni: "", bozo: "", voided: "" };
let slotId: string;
let slotTime: string;

function cardCode(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
}

function gymNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    display: `${parts.day}.${parts.month}.${parts.year}`,
    weekday:
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) +
      1,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
  gymId = await createTestGym(`${workerInfo.project.name}-rec2-${suffix()}`);
  for (const [role, name] of [
    ["admin", "E2E Admin recepcije"],
    ["owner", "E2E Vlasnik recepcije"],
    ["manager", "E2E Menadžer recepcije"],
    ["receptionist", "E2E Recepcioner"],
  ] as const)
    staff[role] = await createTestStaff(gymId, {
      role,
      fullName: name,
      password: PASSWORD,
    });

  const admin = adminClient();
  const now = gymNow();
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
          covers_group: false,
          covers_personal: false,
          group_session_limit: null,
          requires_trainer: false,
          sort_order: 1,
        },
        {
          gym_id: gymId,
          name: "E2E G+T",
          kind: "combo",
          duration_value: 1,
          duration_unit: "month",
          price: 99,
          covers_gym: true,
          covers_group: true,
          covers_personal: false,
          group_session_limit: 12,
          requires_trainer: true,
          sort_order: 2,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  plan.mjesecna = plans.find((p) => p.name === "E2E Mjesečna")!.id;
  plan.combo = plans.find((p) => p.name === "E2E G+T")!.id;
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((p) => ({ plan_id: p.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );

  const trainer = await must(
    admin
      .from("trainers")
      .insert({ gym_id: gymId, full_name: "E2E Milena" })
      .select("id")
      .single<{ id: string }>(),
    "Test trainer",
  );
  await must(
    admin
      .from("trainer_finance")
      .insert({ trainer_id: trainer.id, gym_id: gymId })
      .select("trainer_id"),
    "Test trainer finance",
  );
  const program = await must(
    admin
      .from("programs")
      .insert({ gym_id: gymId, name: "E2E Grupni trening", kind: "group" })
      .select("id")
      .single<{ id: string }>(),
    "Test program",
  );
  await must(
    admin
      .from("trainer_programs")
      .insert({ gym_id: gymId, trainer_id: trainer.id, program_id: program.id })
      .select("trainer_id"),
    "Test assignment",
  );
  slotTime = now.time;
  slotId = (
    await must(
      admin
        .from("class_slots")
        .insert({
          gym_id: gymId,
          program_id: program.id,
          trainer_id: trainer.id,
          weekday: now.weekday,
          starts_at: `${now.time}:00`,
        })
        .select("id")
        .single<{ id: string }>(),
      "Test class slot",
    )
  ).id;

  const created = await must(
    admin
      .from("members")
      .insert(
        [
          ["Ana", "Anić"],
          ["Grupni", "Klijent"],
          ["Božo", "Božović"],
          ["Telefon", "Probni"],
        ].map(([first, last], index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name: `E2E ${first}`,
          last_name: last,
          phone: `+3826740000${index}`,
          email: `rec2-${index}@e2e.invalid`,
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  const byNumber = (n: number) =>
    created.find((m) => m.member_number === n)!.id;
  member.ana = byNumber(1);
  member.grupni = byNumber(2);
  member.bozo = byNumber(3);
  member.phone = byNumber(4);
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: 4 })
      .select("gym_id"),
    "Test member counter",
  );
  const base = {
    gym_id: gymId,
    start_date: shiftDate(now.date, -5),
    end_date: shiftDate(now.date, 25),
    start_reason: "E2E",
    covers_personal: false,
    is_backdated: true,
    created_by: staff.owner.id,
  };
  await must(
    admin
      .from("memberships")
      .insert([
        {
          ...base,
          member_id: member.ana,
          plan_id: plan.mjesecna,
          trainer_id: null,
          covers_gym: true,
          covers_group: false,
          group_session_limit: null,
        },
        {
          ...base,
          member_id: member.grupni,
          plan_id: plan.combo,
          trainer_id: trainer.id,
          covers_gym: true,
          covers_group: true,
          group_session_limit: 12,
        },
      ])
      .select("id"),
    "Test memberships",
  );

  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 4, created_by: staff.owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  card.ana = cardCode();
  card.grupni = cardCode();
  card.bozo = cardCode();
  card.voided = cardCode();
  const assigned = (code: string, memberId: string, status = "active") => ({
    gym_id: gymId,
    code,
    batch_id: batch.id,
    status,
    member_id: memberId,
    assigned_at: new Date().toISOString(),
  });
  await must(
    admin
      .from("cards")
      .insert([
        assigned(card.ana, member.ana),
        assigned(card.grupni, member.grupni),
        assigned(card.bozo, member.bozo),
        assigned(card.voided, member.phone, "deactivated"),
      ])
      .select("id"),
    "Test cards",
  );
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

async function openReception(page: Page) {
  await signIn(page, staff.receptionist);
  await page.getByRole("button", { name: "Počni rad" }).click();
  await expect(
    page.getByRole("heading", { name: "Skenirajte karticu" }),
  ).toBeVisible();
}

async function scan(page: Page, code: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(code);
  await page.keyboard.press("Enter");
}

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test("REC-02: one scan checks a covered member in, green, and closes by itself", async ({
  page,
}) => {
  await openReception(page);
  await expect(
    page.getByText("Trenutno nema nikoga u teretani."),
  ).toBeVisible();
  await scan(page, card.ana);
  const result = page.locator("[data-result=covered]");
  await expect(result).toBeVisible();
  await expect(result).toContainText("E2E Ana Anić");
  await expect(result).toContainText("#1");
  for (const text of [
    "Članarina",
    "E2E Mjesečna",
    "Važi do",
    "Preostalo termina",
    "Neograničeno",
    "Status",
    "Aktivna",
  ])
    await expect(result, text).toContainText(text);
  const shownAt = Date.now();
  await page.waitForTimeout(3_000);
  await expect(result).toBeVisible();
  await expect(result).toBeHidden({ timeout: 5_000 });
  note(
    `REC-02 green dialog closed after ~${Math.round((Date.now() - shownAt) / 1000)} s`,
  );
  await expect(
    page.getByText(/^U teretani: 1 · Danas dolazaka: 1$/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Odjavi E2E Ana Anić" }),
  ).toBeVisible();
});

test("REC-03: a G+T member picks the visit type; Grupni proposes trainer and class", async ({
  page,
}) => {
  await openReception(page);
  await scan(page, card.grupni);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Prijava: E2E Grupni Klijent" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Teretana")).toBeChecked();
  await expect(dialog.getByLabel("Grupni")).not.toBeChecked();
  await expect(dialog.getByLabel("Trener")).toHaveCount(0);
  await dialog.getByText("Grupni", { exact: true }).click();
  await expect(
    dialog.getByLabel("Trener").locator("option:checked"),
  ).toHaveText("E2E Milena");
  await expect(dialog.getByLabel("Čas").locator("option:checked")).toHaveText(
    `Čas: ${slotTime}`,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // No class within 90 minutes: the choice says so.
  await adminClient().from("class_slots").delete().eq("id", slotId);
  await page.reload();
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  await scan(page, card.grupni);
  await dialog.getByText("Grupni", { exact: true }).click();
  await expect(dialog.getByLabel("Čas").locator("option:checked")).toHaveText(
    "Bez časa iz rasporeda",
  );
  await page.keyboard.press("Escape");
  const { count } = await adminClient()
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("member_id", member.grupni);
  expect(count).toBe(0);
});

test("REC-06: the first unpaid visit is yellow, stays open, and is recorded", async ({
  page,
}) => {
  await openReception(page);
  await scan(page, card.bozo);
  const result = page.locator("[data-result=yellow]");
  await expect(result).toBeVisible();
  await expect(result).toContainText("E2E Božo Božović");
  await expect(result).toContainText(
    "Članarina nije važeća – neplaćeni dolazak.",
  );
  await expect(
    result.getByRole("button", { name: "Produži članarinu" }),
  ).toBeVisible();
  await expect(
    result.getByRole("button", { name: "Zatvori" }).first(),
  ).toBeVisible();
  await page.waitForTimeout(7_000);
  await expect(result).toBeVisible();
  const { data } = await adminClient()
    .from("visits")
    .select("is_unpaid, membership_id")
    .eq("member_id", member.bozo)
    .returns<{ is_unpaid: boolean; membership_id: string | null }[]>();
  expect(data).toEqual([{ is_unpaid: true, membership_id: null }]);
  await result.getByRole("button", { name: "Zatvori" }).first().click();

  await page.goto(`/members/${member.bozo}?tab=dolasci`);
  await expect(page.getByText("Neplaćeno").first()).toBeVisible();
  await expect(page.getByText("Neplaćeni dolasci: 1")).toBeVisible();
});

test("REC-08 and REC-07: [Ne] keeps the member in; the second unpaid visit is red, full screen", async ({
  page,
}) => {
  await openReception(page);
  // REC-08 [Ne]: within the 120 s guard the scan asks first, and [Ne] keeps him in.
  await scan(page, card.bozo);
  const confirm = page.getByRole("dialog");
  await expect(
    confirm.getByText(
      /^E2E Božo Božović je prijavljen\/a prije \d+ s\. Odjaviti\?$/,
    ),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Ne" }).click();
  await expect(
    page.getByRole("button", { name: "Odjavi E2E Božo Božović" }),
  ).toBeVisible();
  // [Odjavi] in the same question checks him out (REC-07 step 1).
  await scan(page, card.bozo);
  await confirm.getByRole("button", { name: "Odjavi" }).click();
  await expect(
    page.getByText(/^Odjavljen\/a: E2E Božo Božović – 0h 0min$/),
  ).toBeVisible();

  // REC-07 step 2: the next check-in is the second unpaid visit.
  await scan(page, card.bozo);
  const red = page.locator("[data-result=red]");
  await expect(red).toBeVisible();
  await expect(red).toContainText("PAŽNJA: 2. neplaćeni dolazak!");
  await expect(
    red.getByRole("button", { name: "Produži članarinu" }),
  ).toBeVisible();
  await expect(
    red.getByRole("button", { name: "Zatvori" }).first(),
  ).toBeVisible();
  const box = await red.boundingBox();
  const viewport = page.viewportSize()!;
  note(
    `REC-07 red box ${Math.round(box!.width)}×${Math.round(box!.height)} of ${viewport.width}×${viewport.height}`,
  );
  expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 2);
  expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 2);
  await red.getByRole("button", { name: "Zatvori" }).first().click();
});

test("REC-08: a scan after the guard checks out with the real duration", async ({
  page,
}) => {
  // Ana has been in since REC-02; move her check-in back 1 h 35 min.
  await adminClient()
    .from("visits")
    .update({
      checked_in_at: new Date(Date.now() - 95 * 60_000).toISOString(),
    })
    .eq("member_id", member.ana)
    .is("checked_out_at", null);
  await openReception(page);
  await scan(page, card.ana);
  await expect(
    page.getByText(/^Odjavljen\/a: E2E Ana Anić – 1h 35min$/),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Odjavi E2E Ana Anić" }),
  ).toHaveCount(0);
});

test("REC-11: unknown, voided and malformed cards give a status line, no dialog", async ({
  page,
}) => {
  await openReception(page);
  const status = page.getByRole("status");
  const cases: [string, string][] = [
    ["1234567890", "Nepoznata kartica."],
    [card.voided, "Kartica je poništena. Pronađite člana pretragom."],
    ["12345", "Neispravan kod kartice."],
    ["12345678901", "Neispravan kod kartice."],
  ];
  for (const [code, message] of cases) {
    await scan(page, code);
    const shown = status.getByText(message);
    const appeared = await shown
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    note(
      `REC-11 "${code}" → ${appeared ? message : `nothing (${(await status.textContent())?.trim()})`}`,
    );
    expect(appeared, code).toBe(true);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(shown).toBeHidden({ timeout: 7_000 });
  }
  // REC-16 and SUSPECT-09: letters are not scanner input, so they are ignored and the
  // Enter after them starts nothing (the plan's REC-11 row for them contradicts REC-16).
  await scan(page, "abcdefghij");
  await page.waitForTimeout(1_000);
  expect((await status.textContent())?.trim() ?? "").toBe("");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

const PHONE = "Unesite ispravan broj telefona sa pozivnim brojem.";

test("MEM-05: phone numbers are normalised to +382 and bad ones are refused", async ({
  page,
}) => {
  await signIn(page, staff.owner);
  await page.goto(`/members/${member.phone}`);
  const cases: [string, string | null][] = [
    ["069123456", "+38269123456"],
    ["+38269123457", "+38269123457"],
    ["0038269123458", "+38269123458"],
    ["069 123 459", "+38269123459"],
    ["069-123/450", "+38269123450"],
    ["1234567", null],
    ["06912345a", null],
    ["", null],
    ["+3821234567890123456", null],
  ];
  for (const [input, stored] of cases) {
    await page.getByRole("button", { name: "Uredi podatke" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Telefon").fill(input);
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    if (stored) {
      const saveAnyway = dialog.getByRole("button", { name: "Ipak sačuvaj" });
      if (await saveAnyway.isVisible().catch(() => false))
        await saveAnyway.click();
      await expect(dialog, input).toBeHidden();
      const { data } = await adminClient()
        .from("members")
        .select("phone")
        .eq("id", member.phone)
        .single<{ phone: string }>();
      expect(data?.phone, input).toBe(stored);
      await expect(page.getByText(stored).first(), input).toBeVisible();
    } else {
      await expect(dialog.getByText(PHONE), input).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  }
});

test("MEM-14: only the owner and the admin see [Anonimiziraj]", async ({
  browser,
}) => {
  for (const [who, visible] of [
    [staff.receptionist, false],
    [staff.manager, false],
    [staff.owner, true],
    [staff.admin, true],
  ] as const) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    });
    const page = await context.newPage();
    await signIn(page, who);
    await page.goto(`/members/${member.ana}`);
    await expect(
      page.getByRole("button", { name: "Uredi podatke" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Anonimiziraj" }),
      who.fullName,
    ).toHaveCount(visible ? 1 : 0);
    await context.close();
  }
});

test("MSHIP-03: the renewal starts at the first unpaid visit and links both", async ({
  page,
}) => {
  await signIn(page, staff.receptionist);
  await page.goto(`/members/${member.bozo}`);
  await expect(page.getByText("Neplaćeni dolasci: 2")).toBeVisible();
  await page.getByRole("button", { name: "Nova članarina" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await expect(
    dialog.getByText(`Počinje od prvog neplaćenog dolaska ${gymNow().display}`),
  ).toBeVisible();
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.").first()).toBeVisible();

  const admin = adminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("id, start_date, start_reason")
    .eq("member_id", member.bozo)
    .single<{ id: string; start_date: string; start_reason: string }>();
  expect(membership?.start_date).toBe(gymNow().date);
  const { data: visits } = await admin
    .from("visits")
    .select("membership_id, is_unpaid")
    .eq("member_id", member.bozo)
    .returns<{ membership_id: string | null; is_unpaid: boolean }[]>();
  expect(visits).toHaveLength(2);
  for (const visit of visits ?? [])
    expect(visit).toEqual({ membership_id: membership?.id, is_unpaid: true });

  await page.goto(`/members/${member.bozo}?tab=dolasci`);
  await expect(page.getByText(/Neplaćeni dolasci:/)).toHaveCount(0);
  // Doc 02: an unpaid visit stays flagged for history, even once it is linked.
  note(
    `MSHIP-03 "Neplaćeno" labels after linking: ${await page.getByText("Neplaćeno", { exact: true }).count()}`,
  );
  console.log(`[note] all: ${notes.join(" | ")}`);
});
