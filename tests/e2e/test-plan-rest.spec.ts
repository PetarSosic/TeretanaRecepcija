import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3: remaining Kritično cases left DJELOMIČNO on 22.09.2026 — AUTH-04,
// SEC-03, SEC-09, UX-01, MSHIP-06, MSHIP-11, CLOSE-01, FIN-05 — against one synthetic
// gym (D-56). Serial: one receptionist's shift carries the money records.
test.describe.configure({ mode: "serial" });

const PASSWORD = "ostatakLozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<"owner" | "manager" | "ana", TestStaff>;
const plan = { mjesecna: "", grupni: "", combo: "", personalni: "" };
let memberId: string;
let freshMemberId: string;
let cardCode: string;
let kirijaId: string;

// SEC-09: figures that must never reach a receptionist's page.
const SECRET_FIGURES = {
  oldPayment: "123.45",
  oldPaymentShown: "123,45",
  fixedAmount: "17.77",
  sharePct: "63.3",
  personalFee: "88.88",
};

function gymDate(days: number): string {
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
  gymId = await createTestGym(`${workerInfo.project.name}-rest-${suffix()}`);
  for (const [key, role, name] of [
    ["owner", "owner", "E2E Vlasnik ostatka"],
    ["manager", "manager", "E2E Menadžer ostatka"],
    ["ana", "receptionist", "E2E Ana ostatak"],
  ] as const)
    staff[key] = await createTestStaff(gymId, {
      role,
      fullName: name,
      password: PASSWORD,
    });
  const admin = adminClient();

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
      .insert({
        trainer_id: trainer.id,
        gym_id: gymId,
        personal_gym_fee: Number(SECRET_FIGURES.personalFee),
      })
      .select("trainer_id"),
    "Test trainer finance",
  );
  const base = {
    gym_id: gymId,
    duration_value: 1,
    duration_unit: "month",
    covers_gym: false,
    covers_group: false,
    covers_personal: false,
    requires_trainer: false,
  };
  const plans = await must(
    admin
      .from("plans")
      .insert([
        {
          ...base,
          name: "E2E Mjesečna",
          kind: "gym",
          price: 79,
          covers_gym: true,
          sort_order: 1,
        },
        {
          ...base,
          name: "E2E Grupni (3x nedeljno)",
          kind: "group",
          price: 69,
          covers_group: true,
          requires_trainer: true,
          sort_order: 2,
        },
        {
          ...base,
          name: "E2E G+T",
          kind: "combo",
          price: 99,
          covers_gym: true,
          covers_group: true,
          requires_trainer: true,
          sort_order: 3,
        },
        {
          ...base,
          name: "E2E Personalni",
          kind: "personal",
          price: null,
          covers_personal: true,
          requires_trainer: true,
          sort_order: 4,
        },
        {
          ...base,
          duration_value: null,
          duration_unit: null,
          name: "E2E Dnevna karta",
          kind: "day_pass",
          price: 10,
          covers_gym: true,
          sort_order: 5,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  const id = (name: string) => plans.find((p) => p.name === name)!.id;
  plan.mjesecna = id("E2E Mjesečna");
  plan.grupni = id("E2E Grupni (3x nedeljno)");
  plan.combo = id("E2E G+T");
  plan.personalni = id("E2E Personalni");
  await must(
    admin
      .from("plan_finance")
      .insert(
        plans.map((p) => ({
          plan_id: p.id,
          gym_id: gymId,
          gym_fixed_amount: Number(SECRET_FIGURES.fixedAmount),
        })),
      )
      .select("plan_id"),
    "Test plan finance",
  );
  const program = await must(
    admin
      .from("programs")
      .insert([
        { gym_id: gymId, name: "E2E Grupni trening", kind: "group" },
        { gym_id: gymId, name: "E2E Personalni trening", kind: "personal" },
      ])
      .select("id"),
    "Test programs",
  );
  await must(
    admin
      .from("trainer_programs")
      .insert(
        (program as { id: string }[]).map((p) => ({
          gym_id: gymId,
          trainer_id: trainer.id,
          program_id: p.id,
        })),
      )
      .select("trainer_id"),
    "Test assignments",
  );

  memberId = (
    await must(
      admin
        .from("members")
        .insert({
          gym_id: gymId,
          member_number: 1,
          first_name: "E2E Ostatak",
          last_name: "Član",
          phone: "+38267700001",
          email: "ostatak@e2e.invalid",
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })
        .select("id")
        .single<{ id: string }>(),
      "Test member",
    )
  ).id;
  // MSHIP-11: a member with no trainer history, so nothing is proposed.
  freshMemberId = (
    await must(
      admin
        .from("members")
        .insert({
          gym_id: gymId,
          member_number: 2,
          first_name: "E2E Bez",
          last_name: "Trenera",
          phone: "+38267700002",
          email: "bez-trenera@e2e.invalid",
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })
        .select("id")
        .single<{ id: string }>(),
      "Test fresh member",
    )
  ).id;
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: 2 })
      .select("gym_id"),
    "Test member counter",
  );
  // SEC-09: an old, back-dated sale whose finance snapshot is owner-only.
  const old = await must(
    admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: memberId,
        plan_id: plan.grupni,
        trainer_id: trainer.id,
        start_date: gymDate(-40),
        end_date: gymDate(-10),
        start_reason: "E2E",
        covers_gym: false,
        covers_group: true,
        covers_personal: false,
        is_backdated: true,
        created_by: staff.owner.id,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test old membership",
  );
  await must(
    admin
      .from("membership_finance")
      .insert({
        membership_id: old.id,
        gym_id: gymId,
        gym_fixed_amount: Number(SECRET_FIGURES.fixedAmount),
        trainer_share_pct: Number(SECRET_FIGURES.sharePct),
        personal_gym_fee: Number(SECRET_FIGURES.personalFee),
      })
      .select("membership_id"),
    "Test membership finance",
  );
  await must(
    admin
      .from("payments")
      .insert({
        gym_id: gymId,
        kind: "membership",
        membership_id: old.id,
        member_id: memberId,
        plan_id: plan.grupni,
        amount: Number(SECRET_FIGURES.oldPayment),
        method: "card",
        paid_on: gymDate(-40),
        is_backdated: true,
        created_by: staff.owner.id,
      })
      .select("id"),
    "Test old payment",
  );

  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 1, created_by: staff.owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  cardCode = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  await must(
    admin
      .from("cards")
      .insert({
        gym_id: gymId,
        code: cardCode,
        batch_id: batch.id,
        status: "active",
        member_id: memberId,
        assigned_at: new Date().toISOString(),
      })
      .select("id"),
    "Test card",
  );
  const product = await must(
    admin
      .from("products")
      .insert({
        gym_id: gymId,
        name: "E2E Voda",
        current_purchase_price: 0.3,
        sale_price: 1.5,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test product",
  );
  await must(
    admin
      .from("stock_movements")
      .insert({
        gym_id: gymId,
        product_id: product.id,
        type: "in",
        quantity: 10,
        unit_cost: 0.3,
        created_by: staff.owner.id,
      })
      .select("id"),
    "Test stock",
  );
  const categories = await must(
    admin
      .from("expense_categories")
      .insert([
        { gym_id: gymId, name: "Kirija" },
        { gym_id: gymId, name: "E2E Potrošni" },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test categories",
  );
  kirijaId = categories.find((c) => c.name === "Kirija")!.id;
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

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

const FAILED = "Pogrešno korisničko ime/email ili lozinka.";

test("AUTH-04: an unknown account gets the wrong-password message, word for word", async ({
  page,
}) => {
  const timings: Record<string, number[]> = {};
  for (const [label, identifier] of [
    ["pogrešna lozinka", staff.ana.identifier],
    ["nepostojeće ime", "ne.postoji"],
    ["nepostojeći email", "nepostojeci@primjer.com"],
  ] as const) {
    timings[label] = [];
    for (let round = 0; round < 3; round++) {
      await page.goto("/login");
      await page.getByLabel("Korisničko ime ili email").fill(identifier);
      await page.getByLabel("Lozinka", { exact: true }).fill("bilosta123");
      const started = Date.now();
      await page.getByRole("button", { name: "Prijavi se" }).click();
      await expect(page.getByText(FAILED), label).toBeVisible();
      timings[label].push(Date.now() - started);
      await expect(page).toHaveURL(/\/login/);
    }
  }
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  note(
    `AUTH-04 median ms: ${Object.entries(timings)
      .map(([label, values]) => `${label} ${median(values)}`)
      .join(", ")}`,
  );
});

test("SEC-09: a receptionist's member profile carries no owner-only figures", async ({
  browser,
}) => {
  for (const who of [staff.ana, staff.owner]) {
    const page = await signedIn(browser, who);
    const bodies: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes(`/members/${memberId}`))
        bodies.push(await response.text().catch(() => ""));
    });
    for (const tab of ["", "?tab=uplate", "?tab=dolasci"]) {
      await page.goto(`/members/${memberId}${tab}`);
      await expect(
        page.getByRole("heading", { name: /E2E Ostatak Član/ }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
    }
    const payload = bodies.join("\n") + (await page.content());
    const found = Object.entries(SECRET_FIGURES)
      .filter(([, value]) => payload.includes(value))
      .map(([key]) => key);
    const fields = [
      "trainer_share_pct",
      "gym_fixed_amount",
      "personal_gym_fee",
      "membership_finance",
    ].filter((field) => payload.includes(field));
    note(`SEC-09 ${who.fullName}: figures=[${found}] fields=[${fields}]`);
    if (who === staff.ana) {
      expect(found).toEqual([]);
      expect(fields).toEqual([]);
    } else {
      // Control: the owner does see the old payment, so the fixture is really there.
      expect(found).toContain("oldPaymentShown");
    }
    await page.context().close();
  }
});

test("SEC-03: no server secret, by name or value, reaches any role's browser", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const secretNames = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "CRON_SECRET",
    "BACKUP_ZIP_PASSWORD",
  ];
  const secretValues = secretNames
    .map((name) => process.env[name])
    .filter((value): value is string => Boolean(value && value.length >= 8));
  expect(secretValues.length).toBeGreaterThan(0);

  const pages: [TestStaff, string[]][] = [
    [
      staff.ana,
      [
        "/reception",
        "/members",
        `/members/${memberId}`,
        "/payments/today",
        "/storage",
        "/shift/close",
      ],
    ],
    [staff.manager, ["/settings/users", "/settings/trainers", "/stats/visits"]],
    [
      staff.owner,
      ["/finance", "/finance/shifts", "/settings/gym", "/settings/users"],
    ],
  ];
  let scanned = 0;
  const nameHits = new Set<string>();
  for (const [who, paths] of pages) {
    const page = await signedIn(browser, who);
    const bodies: string[] = [];
    page.on("response", async (response) => {
      const type = response.headers()["content-type"] ?? "";
      if (/javascript|html|text\/x-component|json/.test(type))
        bodies.push(await response.text().catch(() => ""));
    });
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    for (const body of bodies) {
      scanned += body.length;
      for (const value of secretValues)
        expect(body.includes(value), `${who.fullName}: a secret value`).toBe(
          false,
        );
      for (const name of [...secretNames, "service_role"])
        if (body.includes(name)) nameHits.add(name);
    }
    await page.context().close();
  }
  note(
    `SEC-03 scanned ${Math.round(scanned / 1024)} KB; names seen: [${[...nameHits]}]`,
  );
  expect([...nameHits].filter((name) => name !== "service_role")).toEqual([]);
});

test("MSHIP-06: only the owner may change a membership's amount", async ({
  browser,
}) => {
  const desk = await signedIn(browser, staff.ana);
  await desk.goto(`/members/${memberId}`);
  await desk.getByRole("button", { name: "Nova članarina" }).click();
  const sell = desk.getByRole("dialog");
  await sell.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await expect(
    sell.getByRole("button", { name: /Promijeni iznos/ }),
  ).toHaveCount(0);
  await expect(sell.getByRole("textbox", { name: "Iznos (€)" })).toHaveCount(0);
  await desk.keyboard.press("Escape");
  await desk.context().close();

  const owner = await signedIn(browser, staff.owner);
  await owner.goto(`/members/${memberId}`);
  await owner.getByRole("button", { name: "Nova članarina" }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await dialog.getByRole("button", { name: /Promijeni iznos/ }).click();
  await dialog.getByRole("textbox", { name: "Iznos (€)" }).fill("70");
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(owner.getByText("Članarina sačuvana.").first()).toBeVisible();
  const { data } = await adminClient()
    .from("payments")
    .select("amount")
    .eq("member_id", memberId)
    .eq("is_backdated", false)
    .single<{ amount: number }>();
  expect(data?.amount).toBe(70);
  await owner.goto("/payments/today");
  await expect(
    owner.getByRole("cell", { name: "70,00 €" }).first(),
  ).toBeVisible();
  await owner.context().close();
});

test("MSHIP-11: Grupni, G+T and Personalni need a trainer; Mjesečna does not ask", async ({
  browser,
}) => {
  const page = await signedIn(browser, staff.ana);
  await page.goto(`/members/${freshMemberId}`);
  await page.getByRole("button", { name: "Nova članarina" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await expect(dialog.getByLabel("Trener")).toHaveCount(0);
  for (const planId of [plan.grupni, plan.combo, plan.personalni]) {
    await dialog.getByLabel("Vrsta članarine").selectOption(planId);
    await expect(dialog.getByLabel("Trener")).toBeVisible();
    // With no trainer history the placeholder stays chosen (it cannot be picked back
    // once a trainer is proposed, as it is for a member who had one before).
    await expect(dialog.getByLabel("Trener")).toHaveValue("");
    if (planId === plan.personalni) {
      await dialog.getByRole("textbox", { name: "Iznos (€)" }).fill("90");
      await dialog.getByLabel("Broj termina").fill("8");
    }
    await dialog.getByText("Gotovina", { exact: true }).click();
    await dialog.getByRole("button", { name: "Naplati i sačuvaj" }).click();
    await expect(
      dialog.getByText("Izaberite trenera.").first(),
      planId,
    ).toBeVisible();
  }
  await page.keyboard.press("Escape");
  const { count } = await adminClient()
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("member_id", freshMemberId);
  expect(count).toBe(0);
  await page.context().close();
});

test("UX-01: offline, scanning and the day pass stop; back online they work again", async ({
  page,
  context,
}) => {
  await signIn(page, staff.ana.identifier);
  await page.waitForURL(/\/reception/);
  await page.getByRole("button", { name: "Počni rad" }).click();
  const banner = page.getByText(
    "Nema internet konekcije. Podaci se ne mogu sačuvati – vodite evidenciju na papiru i predajte je vlasniku.",
  );
  await context.setOffline(true);
  await expect(banner).toBeVisible();
  const dayPass = page.locator("button", { hasText: "Dnevna karta" }).first();
  await expect(dayPass).toBeDisabled();
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(cardCode);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2_000);
  const status = (await page.getByRole("status").allInnerTexts()).join(" / ");
  note(
    `UX-01 scan while offline → dialog=${await page.getByRole("dialog").count()} status="${status}"`,
  );
  await expect(page.locator("[data-result=covered]")).toHaveCount(0);

  await context.setOffline(false);
  await expect(banner).toBeHidden({ timeout: 5_000 });
  await expect(dayPass).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(cardCode);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-result=covered]")).toBeVisible();
  const { count } = await adminClient()
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("is_backdated", false);
  expect(count).toBe(1);
});

test("CLOSE-01: S-14 totals match the shift's records, voided ones left out", async ({
  page,
}) => {
  await signIn(page, staff.ana.identifier);
  await page.waitForURL(/\/reception/);
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  // A card day pass, a cash one that is voided, a cash bar sale of 2 and a till expense.
  for (const method of ["Platna kartica", "Gotovina"]) {
    await page.getByRole("button", { name: "Dnevna karta" }).click();
    const pass = page.getByRole("dialog");
    await pass.getByText(method, { exact: true }).click();
    await pass.getByRole("button", { name: "Naplati" }).click();
    await expect(pass).toBeHidden();
  }
  await page.getByRole("button", { name: "Trošak" }).click();
  const expense = page.getByRole("dialog");
  await expense
    .getByLabel("Kategorija")
    .selectOption({ label: "E2E Potrošni" });
  await expense.getByLabel("Opis").fill("E2E deterdžent");
  await expense.getByLabel("Iznos (€)").fill("4");
  await expense.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Trošak je sačuvan.").first()).toBeVisible();

  await page.goto("/storage");
  await page.getByRole("button", { name: "Prodaja E2E Voda" }).click();
  const sale = page.getByRole("dialog");
  await sale.getByLabel("Količina").fill("2");
  await sale.getByText("Gotovina", { exact: true }).click();
  await sale.getByRole("button", { name: "Naplati" }).click();
  await expect(page.getByText("Prodaja je sačuvana.").first()).toBeVisible();

  await page.goto("/payments/today");
  await page
    .locator("tr", { hasText: "Dnevna karta × 1" })
    .filter({ hasText: "Gotovina" })
    .getByRole("button", { name: "Poništi Dnevna karta × 1" })
    .click();
  const voiding = page.getByRole("dialog");
  await voiding.getByLabel("Razlog").fill("E2E greška");
  await voiding.getByRole("button", { name: "Poništi" }).click();
  await expect(page.getByText("Stavka je poništena.").first()).toBeVisible();

  // The shift also holds the owner's 70 € cash membership (MSHIP-06).
  await page.goto("/shift/close");
  const card = async (label: string) =>
    (
      (await page
        .locator("dt", { hasText: label })
        .locator("xpath=following-sibling::dd")
        .textContent()) ?? ""
    ).trim();
  const figures = {
    cash: await card("Gotovina (prihod)"),
    card: await card("Platna kartica (prihod)"),
    till: await card("Troškovi iz kase"),
    expected: await card("Očekivana gotovina"),
  };
  const counts = (
    await page
      .getByText(
        /^Uplate: \d+ · Dnevne karte: \d+ · Prodaja: \d+ · Poništeno: \d+$/,
      )
      .textContent()
  )?.trim();
  note(`CLOSE-01 ${JSON.stringify(figures)} · ${counts}`);
  expect(figures).toEqual({
    cash: "73,00 €",
    card: "10,00 €",
    till: "4,00 €",
    expected: "69,00 €",
  });
  expect(counts).toMatch(/Poništeno: 1$/);
  await expect(page.getByText("U teretani je još 1 osoba.")).toBeVisible();
});

test("FIN-05: the owner's full expense form lands in the list and the period total", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signIn(page, staff.owner.identifier);
  await page.waitForURL(/\/finance/);
  await page.goto("/finance/expenses?period=month");
  await page.getByRole("button", { name: "Novi trošak" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Kategorija", { exact: true }).selectOption(kirijaId);
  await dialog.getByLabel("Opis").fill("Zakup septembar");
  await dialog.getByLabel("Iznos (€)").fill("500");
  await dialog.locator("#expense-date").fill(gymDate(0));
  await dialog.getByLabel("Način", { exact: true }).selectOption("cash");
  await dialog.getByLabel("PDV uračunat").selectOption("yes");
  await dialog.locator("#expense-supplier").fill("Agencija");
  await dialog.locator("#expense-invoice").fill("123/26");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Trošak je sačuvan.").first()).toBeVisible();

  const row = page.getByRole("row", { name: /Zakup septembar/ });
  for (const text of [
    "Kirija",
    "Agencija",
    "123/26",
    "Gotovina",
    "Ne",
    "500,00 €",
    "E2E Vlasnik ostatka",
  ])
    await expect(row, text).toContainText(text);
  const { data } = await adminClient()
    .from("expenses")
    .select("vat_included, supplier, invoice_number, method, paid_from_till")
    .eq("description", "Zakup septembar")
    .eq("gym_id", gymId)
    .single();
  expect(data).toEqual({
    vat_included: true,
    supplier: "Agencija",
    invoice_number: "123/26",
    method: "cash",
    paid_from_till: false,
  });
  // D-63 and S-16: the period totals include it (plus the desk's 4 € from CLOSE-01).
  await expect(page.getByText("Ukupno: 504,00 €")).toBeVisible();
  await page.goto("/finance?period=month");
  // S-16 streams in after its skeleton; the Troškovi tile then shows the same total.
  const tile = page.locator("p", { hasText: /^Troškovi$/ }).locator("xpath=..");
  await expect(tile).toContainText("504,00 €", { timeout: 30_000 });
  console.log(`[note] all: ${notes.join(" | ")}`);
});
