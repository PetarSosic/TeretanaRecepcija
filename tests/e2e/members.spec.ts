import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-06 "done when" (doc 09): register a member with an empty card, sell Personalni
// (amount check), renew Mjesečna, replace a lost card. The receptionist's login opens
// the shift every sale needs (BR-092).
test.describe.configure({ mode: "serial" });

const PASSWORD = "clanovilozinka1";

let gymId: string;
let receptionist: TestStaff;
let owner: TestStaff;
let mjesecnaId: string;
let personalniId: string;
let trainerId: string;
let cards: string[];
let memberId: string;

/** BR-030 codes, unique across gyms; the 9 prefix keeps them clear of real batches. */
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
  gymId = await createTestGym(`${workerInfo.project.name}-members-${suffix()}`);
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcija članova",
    password: PASSWORD,
  });
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik članova",
    password: PASSWORD,
  });

  const admin = adminClient();
  // BR-010: Mjesečna and Personalni, with their owner-only finance rows.
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
          covers_group: false,
          covers_personal: true,
          requires_trainer: true,
          sort_order: 2,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  mjesecnaId = plans.find((plan) => plan.name === "E2E Mjesečna")!.id;
  personalniId = plans.find((plan) => plan.name === "E2E Personalni")!.id;
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((plan) => ({ plan_id: plan.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );

  // BR-023: a trainer assigned to a personal program, with the BR-020 fee.
  const trainer = await must(
    admin
      .from("trainers")
      .insert({ gym_id: gymId, full_name: "E2E Tamara" })
      .select("id")
      .single<{ id: string }>(),
    "Test trainer",
  );
  trainerId = trainer.id;
  await must(
    admin
      .from("trainer_finance")
      .insert({ trainer_id: trainerId, gym_id: gymId, personal_gym_fee: 80 })
      .select("trainer_id"),
    "Test trainer fee",
  );
  const program = await must(
    admin
      .from("programs")
      .insert({
        gym_id: gymId,
        name: "E2E Personalni trening",
        kind: "personal",
      })
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

  // BR-036: a small batch of empty cards.
  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 3, created_by: owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test card batch",
  );
  cards = [cardCode(), cardCode(), cardCode()];
  await must(
    admin
      .from("cards")
      .insert(
        cards.map((code) => ({ gym_id: gymId, code, batch_id: batch.id })),
      )
      .select("id"),
    "Test cards",
  );
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

async function signIn(page: Page, staff: TestStaff) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(staff.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Doc 08 §9: no page scrolls sideways, at 375 px included; tables scroll inside. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.scrollWidth;
    if (width <= window.innerWidth) return null;
    // Name the culprits so a failure says where to look.
    const culprits = Array.from(document.querySelectorAll("body *"))
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => `${el.tagName} ${String(el.className).slice(0, 50)}`)
      .slice(0, 5);
    return { width, culprits };
  });
  expect(overflow).toBeNull();
}

async function scan(page: Page, label: string, code: string) {
  const field = page.getByLabel(label);
  await field.fill(code);
  await field.press("Enter");
}

test("US-06.1: a receptionist registers a member with an empty card", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.goto("/members");
  await expect(
    page.getByText(
      "Još nema članova. Skenirajte praznu karticu na recepciji da dodate prvog.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Novi član" }).click();
  const dialog = page.getByRole("dialog");
  // AC4: nothing can be saved before a valid empty card is scanned.
  await expect(dialog.getByRole("button", { name: "Sačuvaj" })).toBeDisabled();
  await scan(page, "Skenirajte praznu karticu", "12345");
  // The first server action of a dev run is compiled on demand, so allow for it.
  await expect(dialog.getByText("Neispravan kod kartice.")).toBeVisible({
    timeout: 20_000,
  });
  await scan(page, "Skenirajte praznu karticu", cards[0]);
  await expect(dialog.getByText("Kartica je prazna i spremna.")).toBeVisible();

  await dialog.getByLabel("Ime", { exact: true }).fill("E2E Ana");
  await dialog.getByLabel("Prezime").fill("Ćosić");
  await dialog.getByLabel("Telefon").fill("067 123 456");
  await dialog.getByLabel("Email").fill("ANA@E2E.invalid");
  await dialog.getByLabel("Datum rođenja", { exact: true }).fill("05.03.1995");
  await dialog.getByLabel("Vrsta članarine").selectOption(mjesecnaId);
  await expect(dialog.getByText("Počinje danas")).toBeVisible();
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();

  // S-05 "After success" and US-06.1 AC3.
  await expect(
    dialog.getByText(
      "Član #1 je kreiran. Upišite ime olovkom na karticu: E2E Ana Ćosić.",
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Zatvori" }).first().click();
  // "Prijavi odmah" is on by default (D-31): the green check-in result follows.
  await expect(page.locator("[data-result=covered]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // AC2: member, card, membership, payment and the visit, all saved together.
  const admin = adminClient();
  const { data: member } = await admin
    .from("members")
    .select("id, member_number, phone, email")
    .eq("gym_id", gymId)
    .single<{
      id: string;
      member_number: number;
      phone: string;
      email: string;
    }>();
  expect(member).toMatchObject({
    member_number: 1,
    phone: "+38267123456",
    email: "ana@e2e.invalid",
  });
  memberId = member!.id;
  const { data: card } = await admin
    .from("cards")
    .select("status, member_id")
    .eq("code", cards[0])
    .single<{ status: string; member_id: string }>();
  expect(card).toEqual({ status: "active", member_id: memberId });
  const { data: payments } = await admin
    .from("payments")
    .select("kind, amount::text, method")
    .eq("member_id", memberId)
    .returns<{ kind: string; amount: string; method: string }[]>();
  expect(payments).toEqual([
    { kind: "membership", amount: "79.00", method: "cash" },
  ]);
  const { data: visits } = await admin
    .from("visits")
    .select("visit_type, is_unpaid, checked_out_at")
    .eq("member_id", memberId)
    .returns<
      {
        visit_type: string;
        is_unpaid: boolean;
        checked_out_at: string | null;
      }[]
    >();
  expect(visits).toEqual([
    { visit_type: "gym", is_unpaid: false, checked_out_at: null },
  ]);

  // BR-044: the list finds her without the diacritics.
  await page.getByLabel("Pretraga člana (ime, telefon, broj)").fill("cosic");
  await expect(page.getByRole("link", { name: "E2E Ana Ćosić" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("US-08.1 and E13: Personalni below the minimum is refused, then sold", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.goto(`/members/${memberId}`);
  await page.getByRole("button", { name: "Nova članarina" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vrsta članarine").selectOption(personalniId);
  await dialog.getByLabel("Trener").selectOption(trainerId);
  await dialog.getByLabel("Broj termina").fill("10");
  await expect(dialog.getByText("Minimalno 80,00 €")).toBeVisible();
  await dialog.getByLabel("Iznos (€)").fill("75");
  await dialog.getByText("Platna kartica", { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(
    dialog.getByText("Iznos ne može biti manji od 80,00 €."),
  ).toBeVisible();

  await dialog.getByLabel("Iznos (€)").fill("120");
  await dialog.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  const { data } = await adminClient()
    .from("memberships")
    .select(
      "personal_session_limit, trainer_id, payments(amount::text, method)",
    )
    .eq("member_id", memberId)
    .eq("plan_id", personalniId)
    .single<{
      personal_session_limit: number;
      trainer_id: string;
      // payments.membership_id is unique, so PostgREST embeds one object.
      payments: { amount: string; method: string };
    }>();
  expect(data).toEqual({
    personal_session_limit: 10,
    trainer_id: trainerId,
    payments: { amount: "120.00", method: "card" },
  });
});

test("US-08.2 and BR-052: [Produži] continues Mjesečna after its last day", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.goto(`/members/${memberId}`);
  await page.getByRole("button", { name: "Produži E2E Mjesečna" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Vrsta članarine")).toHaveValue(mjesecnaId);
  await expect(
    dialog.getByText(
      /^Nastavlja se na članarinu koja važi do \d{2}\.\d{2}\.\d{4}$/,
    ),
  ).toBeVisible();
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.")).toBeVisible();

  // BR-052 step 1: the renewal starts the day after the current one ends (E2).
  const { data } = await adminClient()
    .from("memberships")
    .select("start_date, end_date")
    .eq("member_id", memberId)
    .eq("plan_id", mjesecnaId)
    .order("start_date")
    .returns<{ start_date: string; end_date: string }[]>();
  expect(data).toHaveLength(2);
  const dayAfter = new Date(`${data![0].end_date}T12:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  expect(data![1].start_date).toBe(dayAfter.toISOString().slice(0, 10));
  await expect(page.getByText("Buduća")).toBeVisible();
});

test("US-11.1 and BR-034: a lost card is replaced for the fee", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.goto(`/members/${memberId}`);
  await page.getByRole("button", { name: "Izgubljena kartica" }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Naknada za novu karticu: 5,00 €"),
  ).toBeVisible();
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Nastavi" }).click();

  // AC2: a card that is not empty says so, and the dialog stays open.
  await scan(page, "Skenirajte novu praznu karticu", cards[0]);
  await expect(dialog.getByText("Ova kartica nije prazna.")).toBeVisible();
  await scan(page, "Skenirajte novu praznu karticu", cards[1]);
  await expect(
    page.getByText("Nova kartica dodijeljena. Stara kartica je poništena."),
  ).toBeVisible();
  await expect(page.getByText(`Aktivna kartica ${cards[1]}`)).toBeVisible();

  const admin = adminClient();
  const { data: codes } = await admin
    .from("cards")
    .select("code, status, deactivated_reason")
    .in("code", [cards[0], cards[1]])
    .order("code")
    .returns<
      { code: string; status: string; deactivated_reason: string | null }[]
    >();
  expect(codes).toEqual(
    expect.arrayContaining([
      {
        code: cards[0],
        status: "deactivated",
        deactivated_reason: "izgubljena",
      },
      { code: cards[1], status: "active", deactivated_reason: null },
    ]),
  );
  const { data: fee } = await admin
    .from("payments")
    .select("amount::text, method")
    .eq("member_id", memberId)
    .eq("kind", "card_replacement")
    .single<{ amount: string; method: string }>();
  expect(fee).toEqual({ amount: "5.00", method: "cash" });
});

test("P-24: a receptionist is not offered [Anonimiziraj]", async ({ page }) => {
  await signIn(page, receptionist);
  await page.goto(`/members/${memberId}`);
  await expect(
    page.getByRole("button", { name: "Nova članarina" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Anonimiziraj" })).toHaveCount(
    0,
  );
  await expectNoHorizontalScroll(page);
});

test("BR-046: the owner anonymizes, and the profile becomes read-only", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto(`/members/${memberId}`);
  await page.getByRole("button", { name: "Anonimiziraj" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Broj člana").fill("2");
  await dialog.getByRole("button", { name: "Anonimiziraj trajno" }).click();
  await expect(
    dialog.getByText("Upisani broj se ne poklapa sa brojem člana."),
  ).toBeVisible();
  await dialog.getByLabel("Broj člana").fill("1");
  await dialog.getByRole("button", { name: "Anonimiziraj trajno" }).click();

  await expect(page.getByText("Član je anonimiziran.").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Anonimizirani član #1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nova članarina" }),
  ).toHaveCount(0);
});
