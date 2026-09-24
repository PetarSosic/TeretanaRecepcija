import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";
import { pdfText } from "./pdf-text";

// TEST_PLAN.md §3, priority Visoko, group B (members): MEM-03, MEM-07, MEM-08, MEM-09,
// MEM-11, MEM-13, MEM-16, MEM-17. One synthetic gym (D-56), serial.
test.describe.configure({ mode: "serial" });

const PASSWORD = "visokoBlozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<"owner" | "ana", TestStaff>;
let mjesecnaId: string;
const member = { taken: "", bare: "" };
const card = { taken: "", empties: [] as string[], replacement: "" };

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

function cardCode(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
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
  gymId = await createTestGym(`${workerInfo.project.name}-visb-${suffix()}`);
  staff.owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik B",
    password: PASSWORD,
  });
  staff.ana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Ana B",
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
  mjesecnaId = plan.id;
  await must(
    admin
      .from("plan_finance")
      .insert({ plan_id: plan.id, gym_id: gymId })
      .select("plan_id"),
    "Test plan finance",
  );

  // MEM-09: 30 members, one of them with an active membership, so paging and the
  // status filter have something to show.
  const created = await must(
    admin
      .from("members")
      .insert(
        Array.from({ length: 30 }, (_, index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name:
            index === 0
              ? "E2E Zauzeta"
              : index === 1
                ? "E2E Prazan"
                : `E2E Član${index}`,
          last_name: index === 0 ? "Kartica" : index === 1 ? "Profil" : "Lista",
          phone:
            index === 0
              ? "+38269123456"
              : `+382671000${String(index).padStart(2, "0")}`,
          email: `visb-${index}@e2e.invalid`,
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  member.taken = created.find((m) => m.member_number === 1)!.id;
  member.bare = created.find((m) => m.member_number === 2)!.id;
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: 30 })
      .select("gym_id"),
    "Test member counter",
  );
  await must(
    admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: member.taken,
        plan_id: plan.id,
        start_date: gymDate(-3),
        end_date: gymDate(27),
        start_reason: "E2E",
        covers_gym: true,
        covers_group: false,
        covers_personal: false,
        is_backdated: true,
        created_by: staff.owner.id,
      })
      .select("id"),
    "Test membership",
  );

  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 8, created_by: staff.owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  card.taken = cardCode();
  card.replacement = cardCode();
  card.empties = Array.from({ length: 6 }, cardCode);
  await must(
    admin
      .from("cards")
      .insert([
        {
          gym_id: gymId,
          code: card.taken,
          batch_id: batch.id,
          status: "active",
          member_id: member.taken,
          assigned_at: new Date().toISOString(),
        },
        ...[card.replacement, ...card.empties].map((code) => ({
          gym_id: gymId,
          code,
          batch_id: batch.id,
          status: "unassigned",
          member_id: null,
          assigned_at: null,
        })),
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

async function signedIn(browser: Browser, who: TestStaff): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  await signIn(page, who);
  return page;
}

/** S-05 from /members: the card first, then the member and the sale. */
async function openRegistration(page: Page, code: string) {
  await page.goto("/members");
  await page.getByRole("button", { name: "Novi član" }).click();
  const dialog = page.getByRole("dialog");
  const field = dialog.getByLabel("Skenirajte praznu karticu");
  await field.fill(code);
  await field.press("Enter");
  return dialog;
}

async function register(
  page: Page,
  code: string,
  first: string,
  last: string,
  phone: string,
) {
  const dialog = await openRegistration(page, code);
  await expect(dialog.getByText("Kartica je prazna i spremna.")).toBeVisible();
  await dialog.getByLabel("Ime", { exact: true }).fill(first);
  await dialog.getByLabel("Prezime").fill(last);
  await dialog.getByLabel("Telefon").fill(phone);
  await dialog
    .getByLabel("Email")
    .fill(`${phone.replace(/\D/g, "")}@e2e.invalid`);
  await dialog.getByLabel("Datum rođenja", { exact: true }).fill("01.02.2000");
  await dialog.getByLabel("Vrsta članarine").selectOption(mjesecnaId);
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  const saveAnyway = dialog.getByRole("button", { name: "Ipak sačuvaj" });
  await expect(
    dialog.getByText(/^Član #\d+ je kreiran\./).or(saveAnyway),
  ).toBeVisible({ timeout: 15_000 });
  if (await saveAnyway.isVisible()) await saveAnyway.click();
  await expect(dialog.getByText(/^Član #\d+ je kreiran\./)).toBeVisible({
    timeout: 15_000,
  });
  const text =
    (await dialog.getByText(/^Član #\d+ je kreiran\./).textContent()) ?? "";
  await dialog.getByRole("button", { name: "Zatvori" }).first().click();
  return Number(text.match(/#(\d+)/)?.[1]);
}

/** The id of a member by "first last", as the list shows the name. */
async function memberIdOf(fullName: string): Promise<string> {
  const { data } = await adminClient()
    .from("members")
    .select("id, first_name, last_name")
    .eq("gym_id", gymId)
    .returns<{ id: string; first_name: string; last_name: string }[]>();
  return data!.find((m) => `${m.first_name} ${m.last_name}` === fullName)!.id;
}

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test("MEM-17: without an open shift [Izgubljena kartica] is disabled with the reason", async ({
  page,
}) => {
  await signIn(page, staff.owner);
  await page.goto(`/members/${member.taken}`);
  const lost = page
    .locator("button", { hasText: "Izgubljena kartica" })
    .first();
  await expect(lost).toBeDisabled();
  await expect(lost).toHaveAttribute(
    "title",
    "Nema otvorene smjene. Recepcioner mora biti prijavljen.",
  );
});

test("MEM-03: a card that is not empty is refused and saving stays disabled", async ({
  page,
}) => {
  await signIn(page, staff.ana);
  const dialog = await openRegistration(page, card.taken);
  await expect(dialog.getByText("Ova kartica nije prazna.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sačuvaj" })).toBeDisabled();
});

test("MEM-08: a duplicate phone warns on leaving the field, and [Ipak sačuvaj] saves", async ({
  page,
}) => {
  await signIn(page, staff.ana);
  const dialog = await openRegistration(page, card.empties[0]);
  await expect(dialog.getByText("Kartica je prazna i spremna.")).toBeVisible();
  await dialog.getByLabel("Ime", { exact: true }).fill("E2E Dupli");
  await dialog.getByLabel("Prezime").fill("Telefon");
  await dialog.getByLabel("Telefon").fill("069123456");
  await dialog.getByLabel("Telefon").press("Tab");
  await expect(
    dialog.getByText("Već postoji član sa istim telefonom ili emailom:"),
  ).toBeVisible();
  await expect(dialog.getByText(/#1 E2E Zauzeta Kartica/)).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Otvori postojećeg" }),
  ).toBeVisible();
  await dialog.getByLabel("Email").fill("dupli@e2e.invalid");
  await dialog.getByLabel("Datum rođenja", { exact: true }).fill("01.02.2000");
  await dialog.getByLabel("Vrsta članarine").selectOption(mjesecnaId);
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Ipak sačuvaj" }).click();
  await expect(dialog.getByText(/^Član #\d+ je kreiran\./)).toBeVisible({
    timeout: 15_000,
  });
  const { count } = await adminClient()
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("phone", "+38269123456");
  expect(count).toBe(2);
});

test("MEM-07: our letters, Cyrillic and trimmed spaces everywhere, PDF included; emoji refused (N-16)", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await signIn(page, staff.ana);
  const cases: [string, string, string][] = [
    ["Ćira", "Ćirić Šušnjić-Žižić", "069 200 001"],
    ["Ђорђе", "Петровић", "069 200 002"],
    ["  Ana  ", "Razmak", "069 200 003"],
  ];
  const numbers: number[] = [];
  for (const [index, [first, last, phone]] of cases.entries())
    numbers.push(
      await register(page, card.empties[index + 1], first, last, phone),
    );

  const { data } = await adminClient()
    .from("members")
    .select("member_number, first_name, last_name")
    .in("member_number", numbers)
    .eq("gym_id", gymId)
    .order("member_number")
    .returns<
      { member_number: number; first_name: string; last_name: string }[]
    >();
  note(
    `MEM-07 stored: ${JSON.stringify(data?.map((m) => `${m.first_name}|${m.last_name}`))}`,
  );
  expect(data?.map((m) => m.first_name)).toEqual([
    "Ćira",
    "Ђорђе",
    "Ana",
  ]);

  // N-16: the owner decided that a name may not contain emoji (the PDF cannot print
  // them); the form says so under the field and nothing is stored.
  const dialog = await openRegistration(page, card.empties[4]);
  await expect(dialog.getByText("Kartica je prazna i spremna.")).toBeVisible();
  await dialog.getByLabel("Ime", { exact: true }).fill("Ana😀");
  await dialog.getByLabel("Prezime").fill("Emoji 🇲🇪");
  await dialog.getByLabel("Telefon").fill("069 200 004");
  await dialog.getByLabel("Email").fill("069200004@e2e.invalid");
  await dialog.getByLabel("Datum rođenja", { exact: true }).fill("01.02.2000");
  await dialog.getByLabel("Vrsta članarine").selectOption(mjesecnaId);
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(dialog.getByText("Ime ne smije sadržati emoji.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Prezime ne smije sadržati emoji.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const { count: emoji } = await adminClient()
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("phone", "+38269200004");
  expect(emoji).toBe(0);

  // The list is sorted, so the new members sit on the second page of 25.
  await page.goto("/members?page=2");
  for (const text of [
    "Ćira Ćirić Šušnjić-Žižić",
    "Ђорђе Петровић",
    "Ana Razmak",
  ]) {
    const onPage = await page.getByText(text).count();
    if (!onPage) await page.goto("/members?page=1");
    await expect(page.getByText(text).first(), text).toBeVisible();
    await page.goto(`/members/${await memberIdOf(text)}`);
    await expect(page.getByRole("heading", { name: text }), text).toBeVisible();
    await page.goto("/members?page=2");
  }
  const search = page.getByLabel("Pretraga člana (ime, telefon, broj)");
  for (const [query, expected] of [
    ["ciric susnjic", "Ćira Ćirić Šušnjić-Žižić"],
    ["петров", "Ђорђе Петровић"],
  ]) {
    await search.fill(query);
    await expect(page.getByText(expected).first(), query).toBeVisible();
  }

  // The shift report, closed by the owner, lists the three sales with the names.
  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/shifts");
  await owner.getByRole("button", { name: "Zaključi smjenu" }).click();
  await owner
    .getByRole("dialog")
    .getByRole("button", { name: "Zaključi smjenu" })
    .click();
  await expect(owner.getByText("Smjena je zaključena.").first()).toBeVisible();
  const { data: shift } = await adminClient()
    .from("shifts")
    .select("id")
    .eq("gym_id", gymId)
    .single<{ id: string }>();
  const text = pdfText(
    await (await owner.request.get(`/api/pdf/shift/${shift!.id}`)).body(),
  )
    .replace(/-\n/g, "")
    .replace(/\n/g, " ");
  const found = {
    latin: text.includes("Ćirić Šušnjić") && text.includes("Žižić"),
    cyrillic: text.includes("Ђорђе") && text.includes("Петровић"),
    trimmed: text.includes("Ana Razmak"),
  };
  note(`MEM-07 PDF: ${JSON.stringify(found)}`);
  expect(found.latin).toBe(true);
  expect(found.cyrillic).toBe(true);
  expect(found.trimmed).toBe(true);
  await owner.context().close();
});

test("MEM-09: the members list — columns, search, status filter, paging and bad params", async ({
  page,
}) => {
  await signIn(page, staff.owner);
  await page.goto("/members");
  await expect(page.getByRole("columnheader").first()).toBeVisible();
  const headers = (await page.getByRole("columnheader").allInnerTexts()).map(
    (h) => h.trim(),
  );
  for (const column of [
    "Broj",
    "Ime i prezime",
    "Telefon",
    "Status",
    "Posljednji dolazak",
  ])
    expect(headers).toContain(column);
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(25);
  await expect(page.getByText(/^Strana 1 od 2$/)).toBeVisible();
  await page.getByRole("button", { name: "Sljedeća" }).click();
  await expect(page.getByText(/^Strana 2 od 2$/)).toBeVisible();
  const second = await rows.count();
  await page.getByRole("button", { name: "Prethodna" }).click();
  await expect(page.getByText(/^Strana 1 od 2$/)).toBeVisible();
  note(`MEM-09 total members listed: 25 + ${second}`);

  const search = page.getByLabel("Pretraga člana (ime, telefon, broj)");
  for (const [query, expected] of [
    ["Zauzeta", "E2E Zauzeta Kartica"],
    ["1", "E2E Zauzeta Kartica"],
    ["0691234", "E2E Zauzeta Kartica"],
  ]) {
    await search.fill(query);
    await expect(
      rows.filter({ hasText: expected }).first(),
      query,
    ).toBeVisible();
  }
  await search.fill("zzzz");
  await expect(
    page.getByText("Nema članova koji odgovaraju pretrazi."),
  ).toBeVisible();
  await search.fill("");
  // The cleared search navigates 250 ms later and would drop a filter chosen sooner.
  await expect(page).toHaveURL(/\/members$/);
  await expect(page.locator("table tbody tr")).toHaveCount(25);

  const status = page.getByLabel("Status");
  await status.selectOption("active");
  await expect(page).toHaveURL(/status=active/);
  const activeCount = await rows.count();
  await status.selectOption("inactive");
  await expect(page).toHaveURL(/status=inactive/);
  const inactiveCount = await rows.count();
  await status.selectOption("all");
  note(
    `MEM-09 active rows ${activeCount}, inactive rows (first page) ${inactiveCount}`,
  );
  expect(activeCount).toBeGreaterThan(0);
  expect(activeCount).toBeLessThan(25);

  for (const [query, check] of [
    ["page=999", "empty"],
    ["page=-1", "first"],
    ["page=abc", "first"],
    ["status=izmisljeno", "first"],
  ] as const) {
    const response = await page.goto(`/members?${query}`);
    expect(response?.status(), query).toBe(200);
    if (check === "empty") {
      note(
        `MEM-09 page=999 rows=${await rows.count()} text="${(await page.locator("main").innerText()).slice(0, 120).replace(/\s+/g, " ")}"`,
      );
    } else await expect(rows, query).toHaveCount(25);
  }
});

test("MEM-11: the profile header, three tabs in the address and their empty states", async ({
  page,
}) => {
  await signIn(page, staff.owner);
  await page.goto(`/members/${member.taken}`);
  const header = page.locator("main");
  await expect(header).toContainText("E2E Zauzeta Kartica");
  await expect(header).toContainText("#1");
  await expect(header).toContainText(`Aktivna kartica ${card.taken}`);
  for (const [tab, param] of [
    ["Uplate", "uplate"],
    ["Dolasci", "dolasci"],
    ["Članarine", "clanarine"],
  ]) {
    await page.getByRole("link", { name: tab, exact: true }).click();
    if (param !== "clanarine")
      await expect(page).toHaveURL(new RegExp(`tab=${param}`));
  }
  await page.goto(`/members/${member.taken}?tab=dolasci`);
  await page.reload();
  await expect(page).toHaveURL(/tab=dolasci/);
  await expect(page.getByText("Nema dolazaka.")).toBeVisible();

  await page.goto(`/members/${member.bare}`);
  await expect(page.getByText("Član još nema članarinu.")).toBeVisible();
  await page.goto(`/members/${member.bare}?tab=uplate`);
  await expect(page.getByText("Nema uplata za prikaz.")).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Član još nema članarinu.")).toBeVisible();
});

test("MEM-13: editing a member saves, shows at once, validates, and is audited", async ({
  page,
  browser,
}) => {
  await signIn(page, staff.ana);
  await page.goto(`/members/${member.bare}`);
  await page.getByRole("button", { name: "Uredi podatke" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ime", { exact: true }).fill("");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(dialog.getByText("Unesite ime (1–50 znakova).")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Uredi podatke" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Prezime").fill("Anić-Marković");
  await dialog.getByLabel("Telefon").fill("068999111");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Podaci su sačuvani.").first()).toBeVisible();
  await expect(page.locator("main")).toContainText("E2E Prazan Anić-Marković");
  await expect(page.locator("main")).toContainText("+38268999111");
  await page.goto("/members");
  await expect(
    page.getByText("E2E Prazan Anić-Marković").first(),
  ).toBeVisible();

  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/audit?period=today");
  await expect(owner.locator("main")).toContainText("Anić-Marković", {
    timeout: 20_000,
  });
  note(
    `MEM-13 audit: ${(await owner.locator("main").innerText()).match(/.{0,60}Anić-Marković.{0,40}/)?.[0]?.replace(/\s+/g, " ")}`,
  );
  await owner.context().close();
});

test("MEM-16: a lost card is replaced for the fee, and the old one is refused", async ({
  page,
}) => {
  await signIn(page, staff.ana);
  await page.goto(`/members/${member.taken}`);
  await page.getByRole("button", { name: "Izgubljena kartica" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Naknada za novu karticu: 5,00 €"),
  ).toBeVisible();
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Nastavi" }).click();
  const field = dialog.getByLabel("Skenirajte novu praznu karticu");
  await field.fill(card.replacement);
  await field.press("Enter");
  await expect(
    page
      .getByText("Nova kartica dodijeljena. Stara kartica je poništena.")
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("main")).toContainText(
    `Aktivna kartica ${card.replacement}`,
  );
  await page.goto("/payments/today");
  await expect(
    page.getByText("Zamjenska kartica – #1 E2E Zauzeta Kartica").first(),
  ).toBeVisible();
  await page.goto("/reception");
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(card.taken);
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("status")
      .getByText("Kartica je poništena. Pronađite člana pretragom."),
  ).toBeVisible();
  console.log(`[note] all: ${notes.join(" | ")}`);
});
