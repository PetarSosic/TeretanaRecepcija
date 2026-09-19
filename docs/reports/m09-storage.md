# M-09 Magacin (F-15) — 19.09.2026

Status: complete. All five checks pass, in development and against the production build. M-10 has not started.

## Built

### Migration `0016_storage.sql`

- **Table:** `stock_movements` from doc 07 §3, with all its checks, including `unit_cost > 0` for a stock-in (D-55). It is audited on insert, update and void (BR-096).
  - The SELECT policy lets the owner see every movement and everyone else only today's (doc 07 §6, BR-144).
  - M-08's `expenses.stock_movement_id` now gets its foreign key.
- **Stock level (BR-143):** `product_stock` sums stock-ins minus sales, voided ones excluded, with no opening stock.
  - `storage_products()` is the S-13 list: product, stock level, purchase price and sale price, and nothing else.
  - The stock level counts every day's movements even for roles that may only read today's rows.
- **RPCs** from doc 07 §5:
  - `stock_in(product, qty, unit_cost, from_till)` (BR-141): D-55 is checked first, so a price below €0.01 writes nothing. In one transaction the stock rises, the entered price becomes the purchase price (AS-6), and the "Roba za prodaju" expense `Nabavka: <proizvod> × <količina>` is written: cash from the till on the open shift, or "Van kase" with `method = null` (AS-17).
  - `stock_sale(product, qty, method)` (BR-142): the product's sale price, today's purchase price as the cost, on the open shift. More than the stock raises `E_STOCK_INSUFFICIENT`, with the stock level in the error detail so the message can name it (E17). A row lock stops two desks from selling the last bottle twice.
  - `correct_sale(movement, method)` (BR-094).
  - `void_stock_movement(movement, reason)` (BR-095, AS-15): a voided sale returns its quantity to stock. A stock-in is the owner's to void (P-43); its expense is voided with it, and the void is refused with `E_STOCK_NEGATIVE` when the goods are already sold.

### Screens

- **S-13** `/storage`: Proizvod, Stanje, Nabavna cijena, Prodajna cijena, with [Prodaja] and [Nova roba] per row, and the doc 06 empty text.
  - Prodaja: quantity, `Ukupno`, method. It is a money button, disabled at zero stock.
  - Nova roba: quantity, `Nabavna cijena po komadu (sa fakture)` prefilled with the current price, `Plaćanje: Iz kase / Van kase`, and `Ukupno`. "Iz kase" is disabled while no shift is open (BR-092); "Van kase" needs no shift.
- **S-12:** the `Prodaja iz magacina` section: today's sales with [Ispravi] (method only) and [Poništi], under the same editing rule as payments. A stock-in's automatic expense is listed under the expenses with [Poništi] disabled; the tooltip says the owner voids it together with the stock-in.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 89 tests (4 new, for the S-13 schemas) |
| `npm run test:db` | Pass: 300 assertions in ten files (40 new in `0009_storage.test.sql`) |
| `npm run test:e2e` | Pass: 88 checks (6 new), in development and against `next start` |
| `npm run build` | Pass |

**The "done when" list.**

- **pgTAP, E17:** selling 5 with 3 in stock is blocked, the error carries the stock level 3, and nothing is sold.
- **pgTAP, E18:** 24 × €0.35 "Iz kase" raises the stock by 24, makes €0.35 the purchase price, and writes an €8.40 cash expense from the till on the open shift. The shift's till expenses are then €8.40, so expected cash is −€8.40.
- **pgTAP, voiding a stock-in:**
  - It is refused for a receptionist and a manager (P-43).
  - It is refused with `E_STOCK_NEGATIVE` while the goods are sold.
  - Once the sale is voided, it succeeds, its expense is voided with it, and the stock and expected cash drop accordingly.
  - The expense can never be voided on its own.
- **pgTAP, D-55:** €0 and −€1 are refused with `E_STOCK_COST_INVALID` and create neither a movement nor an expense; €0.01 is accepted.
- **No stock value or profit for staff:**
  - A receptionist and a manager see no movement from before today.
  - `storage_products()` returns exactly `id, name, stock, current_purchase_price, sale_price`.
  - No direct writes are possible.
  - The browser test also checks that S-13 shows no value or profit.
- **Browser:**
  - The Nova roba form refuses a price of 0 with `Nabavna cijena mora biti najmanje 0,01 €.` and writes nothing.
  - 24 × 0,35 from the till shows `Ukupno: 8,40 €` and stock 24.
  - A sale of 30 is refused with `Nema dovoljno na stanju (stanje: 24).`; a sale of 2 leaves 22.
  - On S-12 the sale is corrected to card and voided, the stock is back to 24, and the stock-in expense cannot be voided from S-12.
  - No sideways scrolling at 375 px.

## Interpretations — please confirm

- **A "Van kase" stock-in is attached to the open shift when there is one,** so the AS-14 rules apply to it like every other desk record. With no shift open it has none.
- **The stock-in list with [Poništi] belongs to S-20** (owner, M-12). Until then a stock-in can be voided through the RPC only; the RPC and its tests are complete.
- **New UI copy the spec doesn't give:**
  - Toasts: `Prodaja je sačuvana.`, `Roba je evidentirana.`
  - Empty text: `Danas još nema prodaje.`
  - Stock-in expense tooltip: `Trošak nabavke poništava vlasnik zajedno sa nabavkom.`
  - Out of stock: `Nema na stanju.`
  - Quantity error: `Unesite količinu od 1 do {max}.`

## Changes outside M-09, and why

- **The card field clears its old message on typing.** In one run, a slow answer left `Neispravan kod kartice.` from the first scan next to the valid code of the second while that check was still under way. A new code now starts with no message.
- **Browser assertions wait up to 10 s by default instead of 5 s** (`playwright.config.ts`). Every page talks to the hosted database (D-56). Its round trip measured a median of 228 ms and up to 345 ms during this milestone, against about 100 ms earlier the same day, and the whole suite ran twice as slowly. Registration, the heaviest single action (preview, then member, card, membership, payment and visit in one transaction), gets 15 s in its two tests.

## Notes

- **Syncing the other database:** migration `0016` must be applied to the other developer's Supabase project with `npm run db:push`.
- **The shift totals footer on S-12** still arrives with `shift_summary` in M-10. E18's effect on expected cash is already proven in pgTAP.
