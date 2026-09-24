import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3, priority Visoko, group E (settings): SET-03, SET-04, SET-07, SET-10,
// SET-12, SET-13, SET-16, SET-18, SET-19. One synthetic gym (D-56), serial.
test.describe.configure({ mode: "serial" });

const PASSWORD = "visokoElozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<"admin" | "owner" | "ana" | "cena", TestStaff>;
const plan = { personalni: "", gt: "" };
let milena: string;
let groupMember: string;
let groupCard: string;
let batchId: string;

// A 1×1 PNG and a 1×1 JPEG, both real images.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

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
  gymId = await createTestGym(`${workerInfo.project.name}-vise-${suffix()}`);
  for (const [key, role, name] of [
    ["admin", "admin", "E2E Admin E"],
    ["owner", "owner", "E2E Vlasnik E"],
    ["ana", "receptionist", "E2E Ana E"],
    ["cena", "receptionist", "E2E Cena E"],
  ] as const)
    staff[key] = await createTestStaff(gymId, {
      role,
      fullName: name,
      password: PASSWORD,
    });
  const admin = adminClient();
  milena = (
    await must(
      admin
        .from("trainers")
        .insert({ gym_id: gymId, full_name: "E2E Milena" })
        .select("id")
        .single<{ id: string }>(),
      "Test trainer",
    )
  ).id;
  await must(
    admin
      .from("trainer_finance")
      .insert({ trainer_id: milena, gym_id: gymId })
      .select("trainer_id"),
    "Test trainer finance",
  );
  const programs = await must(
    admin
      .from("programs")
      .insert([
        { gym_id: gymId, name: "E2E Grupni trening", kind: "group" },
        { gym_id: gymId, name: "E2E Personalni trening", kind: "personal" },
      ])
      .select("id, kind")
      .returns<{ id: string; kind: string }[]>(),
    "Test programs",
  );
  await must(
    admin
      .from("trainer_programs")
      .insert({
        gym_id: gymId,
        trainer_id: milena,
        program_id: programs.find((p) => p.kind === "group")!.id,
      })
      .select("trainer_id"),
    "Test assignment",
  );
  const base = {
    gym_id: gymId,
    duration_value: 1,
    duration_unit: "month",
    covers_gym: false,
    covers_group: false,
    covers_personal: false,
    requires_trainer: true,
  };
  const plans = await must(
    admin
      .from("plans")
      .insert([
        {
          ...base,
          name: "E2E Personalni",
          kind: "personal",
          price: null,
          covers_personal: true,
          sort_order: 1,
        },
        {
          ...base,
          name: "E2E G+T",
          kind: "combo",
          price: 99,
          covers_gym: true,
          covers_group: true,
          sort_order: 2,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  plan.personalni = plans.find((p) => p.name === "E2E Personalni")!.id;
  plan.gt = plans.find((p) => p.name === "E2E G+T")!.id;
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((p) => ({ plan_id: p.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );
  const now = gymNow();
  groupMember = (
    await must(
      admin
        .from("members")
        .insert({
          gym_id: gymId,
          member_number: 1,
          first_name: "E2E Grupna",
          last_name: "Članica",
          phone: "+38267900101",
          email: "vise@e2e.invalid",
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })
        .select("id")
        .single<{ id: string }>(),
      "Test member",
    )
  ).id;
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: 1 })
      .select("gym_id"),
    "Test member counter",
  );
  await must(
    admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: groupMember,
        plan_id: plan.gt,
        trainer_id: milena,
        start_date: shiftDate(now.date, -3),
        end_date: shiftDate(now.date, 27),
        start_reason: "E2E",
        covers_gym: true,
        covers_group: true,
        covers_personal: false,
        group_session_limit: 12,
        is_backdated: true,
        created_by: staff.owner.id,
      })
      .select("id"),
    "Test membership",
  );
  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 1, created_by: staff.owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  batchId = batch.id;
  groupCard = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  await must(
    admin
      .from("cards")
      .insert({
        gym_id: gymId,
        code: groupCard,
        batch_id: batch.id,
        status: "active",
        member_id: groupMember,
        assigned_at: new Date().toISOString(),
      })
      .select("id"),
    "Test card",
  );
});

test.afterAll(async ({}, workerInfo) => {
  if (workerInfo.project.name === "desktop") await deleteTestGym(gymId);
});

async function signIn(page: Page, identifier: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
}

async function signedIn(browser: Browser, who: TestStaff): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  await signIn(page, who.identifier);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return page;
}

/** Waits for a dialog to close (saved) or to show a message; returns what happened. */
async function outcome(page: Page, dialog: Locator) {
  await expect
    .poll(
      async () =>
        (await dialog.count()) === 0 ||
        (await dialog.locator(".text-danger").count()) > 0,
      { timeout: 30_000 },
    )
    .toBe(true);
  const shown = (
    await dialog
      .locator(".text-danger")
      .allInnerTexts()
      .catch(() => [])
  ).join(" / ");
  const saved = (await dialog.count()) === 0;
  if (!saved) {
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  return { saved, shown };
}

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test("SET-03 and SET-04: user name and password bounds; an admin is made with an email", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const page = await signedIn(browser, staff.admin);
  await page.goto("/settings/users");
  const tag = suffix().slice(0, 4);
  async function create(values: {
    role?: string;
    name: string;
    login: string;
    password?: string;
  }) {
    await page.getByRole("button", { name: "Novi korisnik" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Uloga")
      .selectOption(values.role ?? "receptionist");
    await dialog.getByLabel("Ime i prezime").fill(values.name);
    if ((values.role ?? "receptionist") === "admin")
      await dialog.getByLabel("Email").fill(values.login);
    else await dialog.getByLabel("Korisničko ime").fill(values.login);
    await dialog
      .getByLabel("Privremena lozinka")
      .fill(values.password ?? PASSWORD);
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    return outcome(page, dialog);
  }
  const NAME = "Unesite ime i prezime (2–100 znakova).";
  expect((await create({ name: "A", login: `n1${tag}` })).shown).toContain(
    NAME,
  );
  expect(
    (await create({ name: "B".repeat(101), login: `n2${tag}` })).shown,
  ).toContain(NAME);
  expect((await create({ name: "Jo", login: `n3${tag}` })).saved).toBe(true);
  expect(
    (await create({ name: "C".repeat(100), login: `n4${tag}` })).saved,
  ).toBe(true);
  expect(
    (
      await create({
        name: "E2E Kratka lozinka",
        login: `n5${tag}`,
        password: "1234567",
      })
    ).shown,
  ).toContain("Lozinka mora imati najmanje 8 znakova.");
  expect(
    (
      await create({
        name: "E2E Osam znakova",
        login: `n6${tag}`,
        password: "12345678",
      })
    ).saved,
  ).toBe(true);

  // SET-04: the admin role asks for an email instead of a username.
  await page.getByRole("button", { name: "Novi korisnik" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Uloga").selectOption("admin");
  await expect(dialog.getByLabel("Email")).toBeVisible();
  await expect(dialog.getByLabel("Korisničko ime")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(
    (await create({ role: "admin", name: "E2E Loš email", login: "nijeemail" }))
      .shown,
  ).toContain("Unesite ispravan email.");
  expect(
    (
      await create({
        role: "admin",
        name: "E2E Zauzet email",
        login: staff.admin.identifier,
      })
    ).shown,
  ).toContain("Email je zauzet.");
  expect(
    (
      await create({
        role: "admin",
        name: "E2E Novi admin",
        login: `novi.admin.${tag}@e2e.invalid`,
      })
    ).saved,
  ).toBe(true);
  await page.context().close();
});

test("SET-07: a deactivated account cannot sign in; reactivated, it can", async ({
  browser,
  page,
}) => {
  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/settings/users");
  const row = owner.getByRole("row", { name: /E2E Cena E/ });
  await row.getByRole("button", { name: "Deaktiviraj" }).click();
  await expect(
    owner.getByText("Korisnik je deaktiviran.").first(),
  ).toBeVisible();
  await expect(
    row.getByRole("cell", { name: "Ne", exact: true }),
  ).toBeVisible();

  await signIn(page, staff.cena.identifier);
  await expect(
    page.getByText("Pogrešno korisničko ime/email ili lozinka."),
  ).toBeVisible();

  await row.getByRole("button", { name: "Aktiviraj" }).click();
  await expect(owner.getByText("Korisnik je aktiviran.").first()).toBeVisible();
  await signIn(page, staff.cena.identifier);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  note(`SET-07 reactivated login → ${new URL(page.url()).pathname}`);
  await owner.context().close();
});

test("SET-10, SET-12 and SET-13: trainers, programs, assignments and the schedule", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const page = await signedIn(browser, staff.owner);
  await page.goto("/settings/trainers");

  // SET-10: add, validate, rename.
  async function trainerDialog(
    open: () => Promise<void>,
    name: string,
    active = true,
  ) {
    await open();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Ime", { exact: true }).fill(name);
    const box = dialog.getByLabel("Aktivan");
    if ((await box.count()) && (await box.isChecked()) !== active)
      await box.click();
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    return outcome(page, dialog);
  }
  const addTrainer = () =>
    page.getByRole("button", { name: "Dodaj trenera" }).click();
  const TRAINER = "Unesite ime trenera (2–100 znakova).";
  expect((await trainerDialog(addTrainer, "A")).shown).toContain(TRAINER);
  expect((await trainerDialog(addTrainer, "T".repeat(101))).shown).toContain(
    TRAINER,
  );
  expect((await trainerDialog(addTrainer, "Novi Trener")).saved).toBe(true);
  const editTrainer = () =>
    page
      .getByRole("row", { name: /Novi Trener/ })
      .getByRole("button", { name: "Uredi" })
      .click();
  expect(
    (await trainerDialog(editTrainer, "Novi Trener Izmijenjen")).saved,
  ).toBe(true);
  await expect(
    page.getByRole("cell", { name: "Novi Trener Izmijenjen" }).first(),
  ).toBeVisible();

  // SET-12: a program, its bounds, and an assignment saved on click.
  async function programDialog(name: string) {
    await page.getByRole("button", { name: "Dodaj program" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Naziv").fill(name);
    await dialog.getByLabel("Vrsta").selectOption("group");
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    return outcome(page, dialog);
  }
  const PROGRAM = "Unesite naziv programa (2–50 znakova).";
  expect((await programDialog("P")).shown).toContain(PROGRAM);
  expect((await programDialog("P".repeat(51))).shown).toContain(PROGRAM);
  expect((await programDialog("Pilates")).saved).toBe(true);
  const toggle = page.getByRole("switch", {
    name: "Novi Trener Izmijenjen – Pilates",
  });
  await toggle.click();
  await expect(page.getByText("Sačuvano.").first()).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  // The new trainer on the personal program, for the offer check below.
  const personal = page.getByRole("switch", {
    name: "Novi Trener Izmijenjen – E2E Personalni trening",
  });
  await personal.click();
  await expect(personal).toHaveAttribute("aria-checked", "true");

  // SET-13: an empty time is refused; a Monday 18:00 class is listed; a class now is
  // offered at a group check-in.
  await page.getByRole("button", { name: "Dodaj čas" }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Program")
    .selectOption({ label: "E2E Grupni trening" });
  await dialog.getByLabel("Trener").selectOption(milena);
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  const empty = await outcome(page, dialog);
  note(`SET-13 empty time → ${empty.shown}`);
  expect(empty.shown).toContain("Unesite vrijeme u formatu HH:mm.");
  const now = gymNow();
  for (const [day, time] of [
    ["1", "18:00"],
    [String(now.weekday), now.time],
  ]) {
    await page.getByRole("button", { name: "Dodaj čas" }).click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Program")
      .selectOption({ label: "E2E Grupni trening" });
    await dialog.getByLabel("Trener").selectOption(milena);
    await dialog.getByLabel("Dan").selectOption(day);
    await dialog.getByLabel("Vrijeme").fill(time);
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    expect((await outcome(page, dialog)).saved, `${day} ${time}`).toBe(true);
  }
  await expect(page.getByText("18:00").first()).toBeVisible();

  // SET-10: a deactivated trainer is offered neither at a sale nor at a check-in.
  expect(
    (await trainerDialog(editTrainer, "Novi Trener Izmijenjen", false)).saved,
  ).toBe(true);
  const desk = await signedIn(browser, staff.ana);
  // N-23: Cena has held the shift since SET-07, so Ana takes it over at S-02 first.
  if (new URL(desk.url()).pathname === "/shift/gate") {
    await desk.getByRole("button", { name: "Preuzmi smjenu" }).click();
    await desk.waitForURL(/\/reception/);
  }
  await desk.goto(`/members/${groupMember}`);
  await desk.getByRole("button", { name: "Nova članarina" }).click();
  const sale = desk.getByRole("dialog");
  await sale.getByLabel("Vrsta članarine").selectOption(plan.personalni);
  const offered = await sale
    .getByLabel("Trener")
    .locator("option")
    .allInnerTexts();
  note(`SET-10 personal trainers offered: ${offered.join(" | ")}`);
  expect(offered.join("|")).not.toContain("Novi Trener");
  await desk.keyboard.press("Escape");

  await desk.goto("/reception");
  await desk
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  await desk.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await desk.keyboard.type(groupCard);
  await desk.keyboard.press("Enter");
  const checkIn = desk.getByRole("dialog");
  await checkIn.getByText("Grupni", { exact: true }).click();
  await expect(checkIn.getByLabel("Čas").locator("option:checked")).toHaveText(
    `Čas: ${now.time}`,
  );
  const groupTrainers = await checkIn
    .getByLabel("Trener")
    .locator("option")
    .allInnerTexts();
  expect(groupTrainers.join("|")).not.toContain("Novi Trener");
  await desk.keyboard.press("Escape");
  await desk.context().close();
  await page.context().close();
});

test("SET-16: products — add, bounds, and at once on /storage", async ({
  browser,
}) => {
  const page = await signedIn(browser, staff.owner);
  await page.goto("/settings/products");
  async function product(name: string, purchase: string, sale: string) {
    await page.getByRole("button", { name: "Dodaj proizvod" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Naziv").fill(name);
    await dialog.getByLabel("Nabavna cijena (€)").fill(purchase);
    await dialog.getByLabel("Prodajna cijena (€)").fill(sale);
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    return outcome(page, dialog);
  }
  expect((await product("E2E Nula", "0,50", "0")).shown).toContain(
    "Prodajna cijena mora biti veća od 0.",
  );
  expect((await product("E2E Minus", "-1", "2")).shown).toContain(
    "Unesite iznos, na primjer 79 ili 79,50.",
  );
  expect((await product("E2E Slova", "abc", "2")).shown).toContain(
    "Unesite iznos, na primjer 79 ili 79,50.",
  );
  for (const name of ["I", "I".repeat(51)])
    expect((await product(name, "0,60", "2,00")).shown, name).toContain(
      "Unesite naziv proizvoda (2–50 znakova).",
    );
  expect((await product("Izotonik", "0,60", "2,00")).saved).toBe(true);
  await page.goto("/storage");
  await expect(page.getByRole("row", { name: /Izotonik/ })).toContainText(
    "2,00 €",
  );
  await page.context().close();
});

test("SET-18: gym settings bounds, each answer under its field", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const page = await signedIn(browser, staff.owner);
  await page.goto("/settings/gym");
  const form = page
    .locator("form")
    .filter({ has: page.locator("#cardReplacementPrice") });
  const defaults: Record<string, string> = {};
  for (const id of [
    "cardReplacementPrice",
    "personalMinPrice",
    "expiryReminderDays",
    "autoCloseTime",
    "doubleScanSeconds",
    "shiftReportEmails",
    "backupEmails",
  ])
    defaults[id] = await page.locator(`#${id}`).inputValue();

  async function attempt(id: string, value: string) {
    await page.goto("/settings/gym");
    // Typing before hydration is overwritten by React's defaultValue.
    await page.waitForLoadState("networkidle");
    await page.locator(`#${id}`).fill(value);
    await form.getByRole("button", { name: "Sačuvaj" }).click();
    await expect
      .poll(
        async () =>
          (await page.getByText("Sačuvano.").count()) > 0 ||
          (await form.locator(".text-danger").count()) > 0,
        { timeout: 15_000 },
      )
      .toBe(true);
    const shown = (await form.locator(".text-danger").allInnerTexts()).join(
      " / ",
    );
    return shown === "" ? "saved" : shown;
  }
  const results: string[] = [];
  const cases: [string, string, "saved" | "refused" | string][] = [
    ["cardReplacementPrice", "5", "saved"],
    ["cardReplacementPrice", "0", "saved"],
    ["cardReplacementPrice", "-1", "Unesite iznos, na primjer 79 ili 79,50."],
    ["cardReplacementPrice", "abc", "Unesite iznos, na primjer 79 ili 79,50."],
    ["personalMinPrice", "80", "saved"],
    ["personalMinPrice", "0", "saved"],
    ["expiryReminderDays", "1", "saved"],
    ["expiryReminderDays", "14", "saved"],
    ["expiryReminderDays", "0", "Unesite broj dana od 1 do 14."],
    ["expiryReminderDays", "15", "Unesite broj dana od 1 do 14."],
    ["doubleScanSeconds", "0", "saved"],
    ["doubleScanSeconds", "600", "saved"],
    ["doubleScanSeconds", "-1", "Unesite broj sekundi od 0 do 600."],
    ["doubleScanSeconds", "601", "Unesite broj sekundi od 0 do 600."],
    ["shiftReportEmails", "", "Unesite bar jednu adresu."],
    [
      "shiftReportEmails",
      "a@b.com, nijeemail",
      "Jedna od adresa nije ispravna.",
    ],
    ["shiftReportEmails", "prvi@e2e.invalid\ndrugi@e2e.invalid", "saved"],
  ];
  for (const [id, value, expected] of cases) {
    const got = await attempt(id, value);
    results.push(`${id}="${value.replace("\n", "\\n")}" → ${got}`);
    if (expected === "saved") expect(got, `${id} ${value}`).toBe("saved");
    else if (expected === "refused")
      expect(got, `${id} ${value}`).not.toBe("saved");
    else expect(got, `${id} ${value}`).toContain(expected);
  }
  note(`SET-18 ${results.join(" | ")}`);
  // Time fields are type=time, so "24:00" and "9:0" cannot be typed at all.
  const english = results.filter((line) =>
    /expected|Too (small|big)/i.test(line),
  );
  note(`SET-18 English messages: ${english.join(" | ") || "none"}`);
  expect(english).toEqual([]);

  // Put the defaults back.
  await page.goto("/settings/gym");
  for (const [id, value] of Object.entries(defaults))
    await page.locator(`#${id}`).fill(value);
  await form.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Sačuvano.").first()).toBeVisible();
  await page.context().close();
});

test("SET-19: logo upload — PNG and JPG saved and on the card sheet; the rest refused", async ({
  browser,
}) => {
  const page = await signedIn(browser, staff.owner);
  await page.goto("/settings/gym");
  const logoForm = page.locator("form:has(#logo)");
  const upload = logoForm.locator('button[type="submit"]');
  const INVALID = "Dozvoljeni su PNG i JPG do 1 MB.";
  async function choose(name: string, mimeType: string, buffer: Buffer) {
    await expect(async () => {
      await page.locator("#logo").setInputFiles({ name, mimeType, buffer });
      await expect(page.locator("#logo")).toHaveJSProperty("files.length", 1);
    }).toPass();
  }
  const logoPath = async () =>
    (
      await adminClient()
        .from("gym_settings")
        .select("logo_path")
        .eq("gym_id", gymId)
        .single<{ logo_path: string | null }>()
    ).data?.logo_path ?? null;

  // Without a file.
  await upload.click();
  await page.waitForTimeout(3_000);
  const noFile = (await logoForm.locator(".text-danger").allInnerTexts()).join(
    " / ",
  );
  note(
    `SET-19 no file → "${noFile}" (button enabled=${await upload.isEnabled()})`,
  );

  for (const [name, mime, buffer] of [
    ["logo.pdf", "application/pdf", Buffer.from("%PDF-1.4 test")],
    ["tekst.png", "image/png", Buffer.from("ovo nije slika")],
  ] as const) {
    await choose(name, mime, buffer);
    if (await upload.isEnabled()) await upload.click();
    await expect(page.getByText(INVALID).first(), name).toBeVisible();
    expect(await logoPath(), name).toBeNull();
    await page.goto("/settings/gym");
  }

  for (const [name, mime, buffer] of [
    ["logo.jpg", "image/jpeg", JPG],
    ["logo.png", "image/png", PNG],
  ] as const) {
    await choose(name, mime, buffer);
    await upload.click();
    await expect(
      page.getByText("Logo je sačuvan.").first(),
      name,
    ).toBeVisible();
    expect(await logoPath(), name).not.toBeNull();
    await page.goto("/settings/gym");
  }
  await expect(page.getByText("Logo nije postavljen.")).toHaveCount(0);

  // The card sheet now carries the logo: one image more than the QR code alone.
  const pdf = (
    await (await page.request.get(`/api/pdf/cards/${batchId}`)).body()
  ).toString("latin1");
  const images = (pdf.match(/\/Subtype\s*\/Image/g) ?? []).length;
  note(`SET-19 card sheet images: ${images}`);
  expect(images).toBeGreaterThanOrEqual(2);
  await page.context().close();
  console.log(`[note] all: ${notes.join(" | ")}`);
});
