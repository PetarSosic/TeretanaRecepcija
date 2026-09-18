# Appendix — Legacy Excel Files (background only)

**Nothing from these files is imported (D-O10).** This appendix explains only what the gym tracked before and which mistakes the app must make impossible. Do not create tables, fields or features from this file. Doc 07 is the schema.

The real files contain members' personal data. Never commit them or use them as seed data.

## Files (September 2026 snapshot)
| File | Tracked | Replaced by |
|---|---|---|
| `Clanarine.xlsx` | Members, membership period, plan, amount, payment date, method, Aktivna/Istekla status, monthly totals | F-06–F-09, F-17 |
| `Treneri_prihod.xlsx` | Group and personal clients per trainer, trainer revenue overview | F-19 |
| `16_09_2026_Troskovi.xlsx` | Expenses with category, supplier, invoice, amount, VAT, entered by | F-14, F-18 |
| `16_09_2026__Zalihe.xlsx` | Products, stock in/out, stock value, gross profit (empty) | F-15 |

## Mistakes found, and the rule that prevents each one
| Mistake in Excel | Prevented by |
|---|---|
| Dates typed as text broke the month formulas; "tekući mjesec" showed €0 | Real `date` columns; BR-001 |
| Member IDs mixed with labels ("1x", "Rent-a Sale", "Julia Klijent"); one ID used for two people | System member numbers (BR-042); day passes without members (BR-100) |
| Plan names typed freely ("Grupni", "3xNedeljno", "Tatjana (klijent)") | The plans table (BR-010) |
| Durations that didn't match the plan (a Nedeljna lasting 30 days) | Calculated last valid day (BR-051) |
| Personal training entered in two files with different amounts | One payment per membership (BR-060); trainer stats derived from it (BR-156) |
| The trainer overview total left out a trainer's personal revenue | Computed statistics (BR-156) |
| Copy-paste labels ("Tatijana" on Tamara's sheet) | Trainer records (BR-020) |
| Workbooks copied per day (dated file names) | One live database |
| Trainer payouts hidden inside "Plate" descriptions | Payout expenses linked to a trainer (BR-133) |
| Personal data like "/" for missing phone or email | Required, validated fields (BR-040, BR-041) |

## Name changes
- The Excel plan "Polumjesečna" (€59) is now **"Mjesečna 12 termina"**.
- Excel payment methods "Uplata na račun" and "FitPass" no longer exist (BR-090; FitPass is not recorded).
