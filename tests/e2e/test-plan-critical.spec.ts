import {
  expect,
  test,
  type Browser,
  type Page,
  type Request,
} from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3: the remaining steps of Kritično cases the 22.09.2026 pass marked
// DJELOMIČNO, against one synthetic gym (D-56). Serial: the cases share one shift history.
test.describe.configure({ mode: "serial" });

const PASSWORD = "kriticnalozinka1";
const OWNER_SECRET = `tajna-vlasnika-${suffix()}`;
const MANAGER_SECRET = `tajna-menadzera-${suffix()}`;

let gymId: string;
const staff = {} as Record<
  "admin" | "owner" | "manager" | "ana" | "bojana",
  TestStaff
>;
let memberId: string;
let categoryId: string;
let closedShiftId: string;

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
  gymId = await createTestGym(`${workerInfo.project.name}-crit-${suffix()}`);
  staff.admin = await createTestStaff(gymId, {
    role: "admin",
    fullName: "E2E Admin kritični",
    password: PASSWORD,
  });
  staff.owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik kritični",
    password: PASSWORD,
    storePassword: OWNER_SECRET,
  });
  staff.manager = await createTestStaff(gymId, {
    role: "manager",
    fullName: "E2E Menadžer kritični",
    password: PASSWORD,
    storePassword: MANAGER_SECRET,
  });
  staff.ana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Ana",
    password: PASSWORD,
  });
  staff.bojana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Bojana",
    password: PASSWORD,
  });

  const admin = adminClient();
  const plan = await must(
    admin
      .from("plans")
      .insert({
        gym_id: gymId,
        name: "E2E Mjesečna",
        kind: "gym",
        duration_value: 1,
        duration_unit: "month",
        price: 79,
        covers_gym: true,
        sort_order: 1,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test plan",
  );
  await must(
    admin
      .from("plan_finance")
      .insert({ plan_id: plan.id, gym_id: gymId })
      .select("plan_id"),
    "Test plan finance",
  );
  const dayPass = await must(
    admin
      .from("plans")
      .insert({
        gym_id: gymId,
        name: "E2E Dnevna karta",
        kind: "day_pass",
        price: 5,
        covers_gym: true,
        sort_order: 2,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test day pass",
  );
  await must(
    admin
      .from("plan_finance")
      .insert({ plan_id: dayPass.id, gym_id: gymId })
      .select("plan_id"),
    "Test day pass finance",
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
  memberId = (
    await must(
      admin
        .from("members")
        .insert({
          gym_id: gymId,
          member_number: 1,
          first_name: "E2E Kritični",
          last_name: "Član",
          phone: "+38267200001",
          email: "kriticni@e2e.invalid",
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

async function signIn(page: Page, who: TestStaff, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(who.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function signedIn(browser: Browser, who: TestStaff): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  await signIn(page, who);
  return page;
}

const NO_SHIFT = "Nema otvorene smjene. Recepcioner mora biti prijavljen.";

/** A MoneyButton names itself after the reason while it is disabled (BR-092). */
function moneyButton(page: Page, text: string) {
  return page.locator("button", { hasText: text }).first();
}

test("SHIFT-07: with no open shift every money button is disabled with the reason", async ({
  page,
}) => {
  await signIn(page, staff.owner);
  expect(
    (
      await adminClient()
        .from("shifts")
        .select("id")
        .eq("gym_id", gymId)
        .is("closed_at", null)
    ).data,
  ).toEqual([]);

  await page.goto("/reception");
  await page.getByRole("button", { name: "Počni rad" }).click();
  for (const text of ["Dnevna karta", "Trošak"]) {
    const button = moneyButton(page, text);
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", NO_SHIFT);
  }

  await page.goto("/storage");
  const sale = moneyButton(page, "Prodaja");
  await expect(sale).toBeDisabled();
  await expect(sale).toHaveAttribute("title", NO_SHIFT);
  await page.getByRole("button", { name: "Nova roba" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "Iz kase" })).toBeDisabled();
  await expect(dialog.getByRole("radio", { name: "Van kase" })).toBeEnabled();
  await expect(dialog.getByText(NO_SHIFT).first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(`/members/${memberId}`);
  const sell = moneyButton(page, "Nova članarina");
  await expect(sell).toBeDisabled();
  await expect(sell).toHaveAttribute("title", NO_SHIFT);
});

test("PERM-05: a manager gets no actions on owner/admin rows and cannot create an owner", async ({
  page,
}) => {
  await signIn(page, staff.manager);
  await page.goto("/settings/users");
  for (const who of [staff.owner, staff.admin]) {
    const row = page.getByRole("row", { name: new RegExp(who.fullName) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button")).toHaveCount(0);
  }
  await expect(
    page
      .getByRole("row", { name: /E2E Ana/ })
      .getByRole("button", { name: "Uredi" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Novi korisnik" }).click();
  const roles = await page
    .getByLabel("Uloga")
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
  expect(roles).not.toContain("owner");
  expect(roles).not.toContain("admin");

  // A forged submit: the browser offers no owner, so one is added to the list by hand.
  const username = `e2e.forged${suffix()}`;
  await page.getByLabel("Uloga").evaluate((select) => {
    const option = document.createElement("option");
    option.value = "owner";
    option.textContent = "Vlasnik";
    select.appendChild(option);
  });
  await page.getByLabel("Uloga").selectOption("owner");
  await page.getByLabel("Ime i prezime").fill("E2E Lažni vlasnik");
  await page.getByLabel("Korisničko ime").fill(username);
  await page.getByLabel("Privremena lozinka").fill(PASSWORD);
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(
    page.getByText("Nemate dozvolu za ovu radnju.").first(),
  ).toBeVisible();

  const { data } = await adminClient()
    .from("staff")
    .select("id")
    .eq("username", username);
  expect(data).toEqual([]);
});

test("PERM-08: no stored password reaches an owner or a manager, not even in the payload", async ({
  browser,
}) => {
  for (const who of [staff.owner, staff.manager]) {
    const page = await signedIn(browser, who);
    const bodies: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("/settings/users"))
        bodies.push(await response.text().catch(() => ""));
    });
    await page.goto("/settings/users");
    await expect(page.getByRole("row", { name: /E2E Ana/ })).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Lozinka" }),
    ).toHaveCount(0);
    const payload = bodies.join("\n") + (await page.content());
    expect(payload, who.fullName).not.toContain(OWNER_SECRET);
    expect(payload, who.fullName).not.toContain(MANAGER_SECRET);
    expect(payload, who.fullName).not.toContain(PASSWORD);
    await page.context().close();
  }

  const admin = await signedIn(browser, staff.admin);
  await admin.goto("/settings/users");
  await expect(
    admin.getByRole("columnheader", { name: "Lozinka" }),
  ).toBeVisible();
  const row = admin.getByRole("row", { name: /E2E Vlasnik kritični/ });
  await row.getByRole("button", { name: "Prikaži" }).click();
  await expect(row.getByText(OWNER_SECRET)).toBeVisible();
});

test("SHIFT-08: closing the shift from outside signs the receptionist out", async ({
  page,
  browser,
}) => {
  await signIn(page, staff.ana);
  await expect(page).toHaveURL(/\/reception/);

  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/shifts");
  await owner.getByRole("button", { name: "Zaključi smjenu" }).click();
  await owner
    .getByRole("dialog")
    .getByRole("button", { name: "Zaključi smjenu" })
    .click();
  await expect(owner.getByText("Smjena je zaključena.")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Meni" })
    .getByRole("link", { name: "Članovi" })
    .click();
  await expect(page).toHaveURL(/\/login\?.*auto=1/);
  await expect(
    page.getByText("Smjena je automatski zaključena."),
  ).toBeVisible();

  // The owner's own session is untouched.
  await owner.reload();
  await expect(owner).toHaveURL(/\/finance\/shifts/);

  const { data } = await adminClient()
    .from("shifts")
    .select("id, close_type, counted_cash")
    .eq("gym_id", gymId)
    .eq("staff_id", staff.ana.id)
    .single<{ id: string; close_type: string; counted_cash: string | null }>();
  expect(data?.counted_cash).toBeNull();
  closedShiftId = data!.id;
  console.log(`[note] SHIFT-08 close_type=${data?.close_type}`);
});

test("PERM-09: the shift PDF opens for owner and admin, 404 for manager and receptionist", async ({
  browser,
}) => {
  await expect
    .poll(
      async () =>
        (
          await adminClient()
            .from("shifts")
            .select("report_path")
            .eq("id", closedShiftId)
            .single<{ report_path: string | null }>()
        ).data?.report_path ?? null,
      { timeout: 30_000 },
    )
    .not.toBeNull();

  for (const [who, allowed] of [
    [staff.owner, true],
    [staff.admin, true],
    [staff.manager, false],
    [staff.bojana, false],
  ] as const) {
    const page = await signedIn(browser, who);
    const response = await page.request.get(`/api/pdf/shift/${closedShiftId}`);
    const body = await response.body();
    if (allowed) {
      expect(response.status(), who.fullName).toBe(200);
      expect(response.headers()["content-type"]).toContain("application/pdf");
      expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    } else {
      expect(response.status(), who.fullName).toBe(404);
      expect(body.includes(Buffer.from("%PDF-")), who.fullName).toBe(false);
    }
    await page.context().close();
  }
});

async function jobRuns(): Promise<number> {
  const { count } = await adminClient()
    .from("job_runs")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

test("PERM-12: the jobs route refuses without the secret and runs nothing", async ({
  request,
}) => {
  const before = await jobRuns();

  const get = await request.get("/api/jobs/nightly");
  expect(get.status()).toBe(401);
  expect(await get.json()).toEqual({ error: "unauthorized" });

  const bare = await request.post("/api/jobs/nightly");
  expect(bare.status()).toBe(401);
  expect(await bare.json()).toEqual({ error: "unauthorized" });

  const wrong = await request.post("/api/jobs/nightly", {
    headers: { "x-cron-secret": "pogresno" },
  });
  expect(wrong.status()).toBe(401);
  expect(await wrong.json()).toEqual({ error: "unauthorized" });

  const unknown = await request.post("/api/jobs/nepostoji", {
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  expect(unknown.status()).toBe(404);
  expect(await unknown.json()).toEqual({ error: "unknown job" });

  expect(await jobRuns()).toBe(before);
});

async function expenseCount(): Promise<number> {
  const { count } = await adminClient()
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId);
  return count ?? 0;
}

test("PERM-13: a replayed owner-only server action is refused for a manager", async ({
  browser,
}) => {
  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/expenses");
  await owner.getByRole("button", { name: "Novi trošak" }).click();
  const dialog = owner.getByRole("dialog");
  await dialog
    .getByLabel("Kategorija", { exact: true })
    .selectOption(categoryId);
  await dialog.getByLabel("Opis").fill("E2E vlasnikov trošak");
  await dialog.getByLabel("Iznos (€)").fill("12,34");
  await dialog.getByLabel("Način", { exact: true }).selectOption("card");
  const captured = owner.waitForRequest(
    (request: Request) =>
      request.method() === "POST" && !!request.headers()["next-action"],
  );
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  const action = await captured;
  await expect(owner.getByText("Trošak je sačuvan.")).toBeVisible();
  const afterOwner = await expenseCount();
  expect(afterOwner).toBe(1);

  const manager = await signedIn(browser, staff.manager);
  const page = await manager.goto("/finance/expenses");
  await expect(
    manager.getByText("404", { exact: false }).first(),
  ).toBeVisible();
  console.log(
    `[note] PERM-13 manager GET /finance/expenses HTTP ${page?.status()}`,
  );

  const headers = Object.fromEntries(
    Object.entries(action.headers()).filter(
      ([name]) => !["cookie", "host", "content-length"].includes(name),
    ),
  );
  const replay = await manager.request.post(action.url(), {
    headers,
    data: action.postDataBuffer() ?? Buffer.alloc(0),
    maxRedirects: 0,
  });
  const text = await replay.text();
  console.log(
    `[note] PERM-13 replay status=${replay.status()} forbiddenText=${text.includes("Nemate dozvolu za ovu radnju.")} saved=${text.includes("Trošak je sačuvan.")}`,
  );
  expect(text).not.toContain("Trošak je sačuvan.");
  expect(await expenseCount()).toBe(afterOwner);
});

test("SET-09: the last active owner stays; with a second owner the first can go", async ({
  page,
}) => {
  await signIn(page, staff.admin);
  await page.goto("/settings/users");
  const first = page.getByRole("row", { name: /E2E Vlasnik kritični/ });
  await first.getByRole("button", { name: "Deaktiviraj" }).click();
  await expect(
    page.getByText(
      "Mora ostati bar jedan aktivan nalog ove uloge. Prvo dodajte zamjenu.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Novi korisnik" }).click();
  await page.getByLabel("Uloga").selectOption("owner");
  await page.getByLabel("Ime i prezime").fill("E2E Vlasnik test");
  await page.getByLabel("Korisničko ime").fill(`vlasnik.test${suffix()}`);
  await page.getByLabel("Privremena lozinka").fill(PASSWORD);
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Korisnik je kreiran.")).toBeVisible();

  await first.getByRole("button", { name: "Deaktiviraj" }).click();
  await expect(page.getByText("Korisnik je deaktiviran.")).toBeVisible();
  const { data } = await adminClient()
    .from("staff")
    .select("is_active")
    .eq("id", staff.owner.id)
    .single<{ is_active: boolean }>();
  expect(data?.is_active).toBe(false);
});
