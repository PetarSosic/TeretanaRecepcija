# M-04 member cards (F-03) — 18.09.2026

Status: built and verified, except the one check that needs a printer and a scanner — see "What I need from you". All five checks pass, in development and against the production build.

## Built

### Migration `0009_cards.sql`

- `card_batches` and `cards` exactly as doc 07 §3 defines them, including the BR-031 rule that an unassigned card holds no member and the BR-032 index allowing a member only one active card.
- `random_card_code()` — BR-030: ten digits, first digit 1–9. It draws from `gen_random_bytes` rather than `random()`, so one code tells you nothing about the next; seven bytes are folded into the nine billion codes of the range, with a bias of roughly one part in ten million.
- `generate_card_batch(p_qty)` — BR-036: 1 to 100 cards for owners, managers and admins. Uniqueness is the database's job: a collision on the unique index simply draws again, and the loop gives up loudly after fifty attempts per card rather than spinning forever.
- RLS per doc 07 §6: every role reads `cards`, because every role scans them; `card_batches` is a printing tool and stays with owners, managers and admins.

### The card sheet (S-28, doc 08 §7)

`lib/pdf/card-sheet.tsx` renders A4 portrait, ten cards per page in two columns of five, each **85.6 × 54 mm** — the ID-1 bank-card size — with thin grey cut lines. Each card carries the gym logo (when uploaded) and gym name top left, a 30 mm QR on the right with error correction M and a two-module quiet zone, the code beneath it as `123 456 7890` in 12 pt monospace, and `Ime i prezime:` above a 50 mm writing line.

Noto Sans is embedded (SIL Open Font License, committed at `lib/pdf/fonts/`) so č ć š ž đ render; the digits use the built-in Courier, which is the monospace S-28 asks for.

`/api/pdf/cards/[batchId]` renders the sheet on request for owners, managers and admins, and answers 404 to anyone else. The logo is fetched server-side from the private bucket and embedded, since the browser cannot read that bucket directly.

### Screen S-28

`/settings/cards`: the `Broj kartica (1–100)` form with [Generiši], and the batch list showing date, quantity, how many are still empty, and [Preuzmi PDF] — US-03.1 AC3 in full.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 59 tests (6 new) |
| `npm run test:db` | Pass: 71 assertions, five files (12 new) |
| `npm run test:e2e` | Pass: 46 checks (3 new), in development and against `next start` |
| `npm run build` | Pass |

**The 100-card check, proved twice.** pgTAP: a batch of 100 produces 100 rows, 100 distinct codes, every one matching `^[1-9][0-9]{9}$`, all unassigned with no member; 101 and 0 are rejected; five hundred generated codes all match the pattern; a code starting with zero is refused by the constraint. The browser test repeats the same assertions against real rows created through the screen.

**The 85.6 × 54 mm check.** The unit test renders a real PDF and reads it back: 21 cards produce exactly three pages, the `MediaBox` is A4, and the arithmetic of two columns of 85.6 mm plus five rows of 54 mm matches the page margins the layout uses. A sample sheet I rendered measured `MediaBox [0 0 595.28 841.89]` with 20 cards on 2 pages.

**The QR payload.** A unit test asserts the QR encodes the ten digits and nothing else — no URL, no prefix — which is what makes BR-030's "digits are safe with any keyboard layout" true in practice.

After the full run the database holds one gym, two staff, no batches and no cards: the fixtures clean up after themselves.

## What I need from you

**Print and scan one sheet.** I put a sample at `Desktop/kartice-uzorak.pdf` (20 cards, 2 pages). The "done when" list has one item I cannot close from here: that a *printed* QR scans back to the same ten digits. Print it **at 100% scale, not "fit to page"**, then:

1. Measure a card — it should be 85.6 × 54 mm, the size of a bank card.
2. Scan a QR with the desk scanner and confirm it types exactly the ten digits shown underneath.

Tell me the result and I will note it in this report. If the scanner adds or drops anything, that is worth finding now rather than after a hundred cards are printed.

## Deviations, both reported rather than assumed

1. **The PDF is rendered on request, not stored.** Doc 07 §3 gives `card_batches.pdf_path` a column and doc 07 §6 lists a `card-batches` bucket. Rendering on demand means the sheet always carries the current logo and gym name and there is no stale file to manage; the column stays null and the bucket is not created. Say so if you would rather have each sheet stored once and downloaded from storage.
2. **`cards.member_id` has no foreign key yet.** Doc 07 §3 points it at `members(id)`, but that table arrives in M-06 — a card exists long before any member holds it. The column is there; M-06's migration adds the constraint. This is the table-ordering issue first noted in the M-00 report, now closed for this table.

## Note

The QR is 30 mm and the card is 85.6 mm wide, so a scanner needs to be roughly 10–20 cm away. That matches the desk scanner in the plan, but it is the kind of thing the print test will confirm.
