# 02 — Glossary

Use these terms **exactly** in the documents, code and UI.

- The **Code** column is the identifier in the database and TypeScript.
- The **UI label** column is the exact Montenegrin text shown to users.

## People and organisation
| Term | Code | UI label | Definition |
|---|---|---|---|
| Gym | `gym` | Teretana | The tenant. Every business row has `gym_id`. |
| Staff user | `staff` | Korisnik | Anyone who logs in: owner, manager or receptionist. |
| Owner | `owner` | Vlasnik | Staff role with full access, including finances. More than one is allowed. |
| Manager | `manager` | Menadžer | Staff role: manages staff, trainers and schedule; works the desk; no overall finances. |
| Receptionist | `receptionist` | Recepcioner | Staff role that works shifts at the desk. Logs in with a username. |
| Trainer | `trainer` | Trener | A person who runs group or personal training. **Not a staff user.** |
| Member | `member` | Član | A gym client with an account and a card. |
| Member number | `member_number` | Broj člana | Sequential per gym, starting at 1, never reused. |

## Cards
| Term | Code | UI label | Definition |
|---|---|---|---|
| Member card | `card` | Članska kartica | Pre-printed paper card with a QR code. |
| Card code | `card.code` | Kod kartice | Exactly 10 digits, first digit 1–9. The QR code contains only these digits. |
| Unassigned card | `card.status = 'unassigned'` | Prazna kartica | A printed card not yet given to a member. |
| Active card | `card.status = 'active'` | Aktivna kartica | A card assigned to a member. A member has at most one. |
| Deactivated card | `card.status = 'deactivated'` | Poništena kartica | A lost or replaced card. It can never be used again. |
| Card batch | `card_batch` | Serija kartica | A set of unassigned cards generated and printed together. |
| Card replacement fee | `card_replacement_price` | Zamjenska kartica | Fee for a new card after a loss. Default €5. |

## Plans and memberships
| Term | Code | UI label | Definition |
|---|---|---|---|
| Plan | `plan` | Vrsta članarine | A sellable product type with price, duration and limits (e.g. "Mjesečna"). |
| Plan kind | `plan_kind` | — | `gym`, `group`, `combo`, `personal`, `day_pass`. |
| Visit type | `visit_type` | Vrsta dolaska: Teretana / Grupni / Personalni | `gym`, `group`, `personal`. |
| Coverage | `covers_gym`, `covers_group`, `covers_personal` | — | The visit types a plan or membership allows. |
| Membership | `membership` | Članarina | One sold instance of a plan for one member, with a start date and a last valid day. |
| Last valid day | `end_date` | Važi do | The last date the membership can be used (inclusive). |
| Session | — | Termin | One unit of a session limit. Every visit of a limited type uses one. |
| Session limit | `gym_visit_limit`, `group_session_limit`, `personal_session_limit` | Broj termina | Maximum visits of a type within a membership. `null` = unlimited ("Neograničeno"). |
| Remaining sessions | computed | Preostalo termina | Limit minus the visits already linked to that membership. |
| Membership status | computed | Status | `active` Aktivna · `upcoming` Buduća · `used_up` Iskorištena · `expired` Istekla · `voided` Poništena. |
| Personal minimum price | `personal_min_price` | Minimalna cijena personalnog | Lowest allowed amount for a Personalni sale. Default €80. |
| Program | `program` | Program | A kind of training trainers can be assigned to (e.g. "Grupni trening"). Kind `group` or `personal`. |
| Trainer assignment | `trainer_program` | Dodjela trenera | A link saying a trainer runs a program. |
| Class slot | `class_slot` | Čas (u rasporedu) | A weekly scheduled group class: program + trainer + weekday + start time. |

## Visits
| Term | Code | UI label | Definition |
|---|---|---|---|
| Visit | `visit` | Dolazak | One stay in the gym, from check-in to check-out. |
| Check-in | `checked_in_at` | Prijava | Start of a visit (first scan or manual). |
| Check-out | `checked_out_at` | Odjava | End of a visit (second scan, manual, or automatic at 23:00). |
| Open visit | `checked_out_at is null` | U teretani | A visit without a check-out. A member has at most one. |
| Unpaid visit | `is_unpaid = true` | Neplaćeni dolazak | A visit made without a covering membership. It stays flagged forever for history. |
| Unlinked unpaid visit | `is_unpaid and membership_id is null` | — | An unpaid visit not yet covered by a later sale. Used for warning levels. |
| Automatic check-out | `auto_checkout = true` | Automatska odjava | Check-out done by the 23:00 job. |
| Manual check-in | `is_manual = true` | Ručna prijava | Check-in by searching a member instead of scanning. |

## Money
| Term | Code | UI label | Definition |
|---|---|---|---|
| Payment | `payment` | Uplata | Money received for a membership, day passes or a card replacement. |
| Payment kind | `payment_kind` | — | `membership`, `day_pass`, `card_replacement`. |
| Payment method | `payment_method` | Način plaćanja: **Gotovina** / **Platna kartica** | `cash`, `card`. |
| Day pass | plan kind `day_pass` | Dnevna karta | Single-day entry sold by quantity, without a name or check-in. Default €15 (D-70). |
| Sale (bar) | `stock_movement.type = 'out'` | Prodaja | A product sold at the desk. It is income. |
| Income | computed | Prihod | Non-voided payments plus non-voided sales. |
| Expense | `expense` | Trošak | Money spent. |
| Expense category | `expense_category` | Kategorija troška | Owner-managed list. |
| Salary category | `is_salary = true` | — | Category "Plate". Only the owner can use it. |
| System category | `is_system = true` | — | Category "Roba za prodaju". Used automatically by stock-in; cannot be deactivated. |
| Paid from till | `paid_from_till` | Plaćeno iz kase | An expense paid with cash from the desk. It reduces expected cash. |
| Profit | computed | Profit | Income minus expenses. Owner only. |
| Trainer share | computed | Za trenera | The part of a trainer-linked payment that belongs to the trainer. |
| Gym share | computed | Za teretanu | Payment amount minus trainer share. |
| Trainer fee | `personal_gym_fee` | Naknada teretani | Amount per personal client that goes to the gym (e.g. €80). |
| Payout | expense with `trainer_id` | Isplata treneru | Actual money paid to a trainer, recorded as a "Plate" expense. |
| Void | `voided_at`, `void_reason` | Poništi / Poništeno | Cancels a record without deleting it. A reason is required. |
| Correction | — | Ispravka | Changing the method or note (anyone), or the amount (owner only). |
| Back-dated entry | `is_backdated = true` | Naknadni unos | A record the owner enters for a past date. It has no shift. |

## Shifts
| Term | Code | UI label | Definition |
|---|---|---|---|
| Shift | `shift` | Smjena | A receptionist's working period at the till. At most one open per gym. |
| Take over shift | `close_type = 'takeover'` | Preuzmi smjenu | Closing someone else's open shift and opening your own. |
| Close shift | `close_type = 'manual'` | Zaključi smjenu | Ending your shift with a cash count, report and logout. |
| Automatic shift close | `close_type = 'auto'` | Automatski zaključeno | A shift closed by the 23:00 job. |
| Expected cash | computed | Očekivana gotovina | Cash income minus paid-from-till expenses in the shift. |
| Counted cash | `counted_cash` | Prebrojana gotovina | Cash the receptionist counts at close. |
| Cash difference | computed | Razlika (manjak / višak) | Counted cash minus expected cash. |
| Shift report | `report_path` | Izvještaj smjene | PDF generated at close and emailed. |

## Storage (bar)
| Term | Code | UI label | Definition |
|---|---|---|---|
| Magacin | `products` + `stock_movements` | Magacin | The bar storage module. |
| Product | `product` | Proizvod | An item sold at the desk (currently "Voda"). |
| Stock-in | `stock_movement.type = 'in'` | Nova roba | Recording delivered goods. |
| Purchase price | `unit_cost` / `current_purchase_price` | Nabavna cijena | Per-unit cost as written on the supplier's invoice. |
| Sale price | `sale_price` / `unit_price` | Prodajna cijena | Per-unit price charged. Set by the owner only. |
| Stock level | computed | Stanje | Total stock-in minus total sales (non-voided). |
| Stock value | computed | Vrijednost zalihe | Stock level × current purchase price. Owner only. |
| Bar profit | computed | Zarada na magacinu | Σ sales × (sale price − purchase price). Owner only. |

## Other
| Term | Code | UI label | Definition |
|---|---|---|---|
| Gym today | `gym_today(gym_id)` | — | The current date in `Europe/Podgorica`. **Never** use the server's `current_date`. |
| Audit log | `audit_log` | Dnevnik izmjena | History of corrections, voids and price changes. Owner only. |
| Anonymization | `is_anonymized` | Anonimiziraj | Irreversibly removes a member's personal data while keeping history. |

## Words to avoid
| Avoid | Use instead |
|---|---|
| "Kartica" alone | "Članska kartica" (member card) or "Platna kartica" (payment method) |
| "Termin" for a visit | "Dolazak". "Termin" means only a session unit. |
| "Paket" | "Vrsta članarine" (plan) or "Članarina" (membership) |
| "Zalihe", "Storage" in UI | "Magacin" |
| "Admin" | "Vlasnik" (owner) |
| "Check-in" in UI | "Prijava" |
| "Check-out" in UI | "Odjava" |
| "Polumjesečna" | Old Excel name; the plan is "Mjesečna 12 termina" |
