# 01 — Product Overview

## 1. Problem
KP Fitness is a new gym in Montenegro. The owner tracks members, payments, trainer income, expenses and bar stock on paper and in four Excel files. This causes several problems:
- Dates are typed as text.
- IDs are duplicated.
- Payments are entered twice.
- Totals are wrong.
- No one can reliably tell whether a member at the desk has paid.

## 2. Goal
One web app that **fully replaces paper and Excel**. It is used at the reception desk to:
- check members in and out with a QR card;
- sell memberships;
- record every euro taken or spent in the till.

It also gives the owner a private view of all finances.

## 3. Users
| Role | Who | Device | Main jobs |
|---|---|---|---|
| **Owner** (`owner`) | Matija (the gym owner). More owners are allowed. | Phone and desktop | See all finances, set prices, manage everything, enter back-dated data |
| **Manager** (`manager`) | Trusted staff | Desktop, sometimes phone | Manage staff accounts, trainers and schedule; work the desk; see visit statistics. **No overall finances.** |
| **Receptionist** (`receptionist`) | Desk staff, number changes over time | Reception PC | Check-in and check-out, register members, sell memberships, day passes, bar sales, small cash expenses, close shift |

**Trainers** (Milena, Julija, Tamara, Tatjana) **do not use the app.** They exist only as records, used for assignments, check-in and payout reports.

**Members never use the app.** They only carry a paper QR card.

## 4. Operating context
- **Reception desk:**
  - one PC running Chrome, screen at least 1366×768;
  - speakers;
  - a USB QR scanner that types the card digits followed by Enter.
- **Visit routine:**
  1. The member hands over the card.
  2. The receptionist scans it (**check-in**).
  3. The member gets a locker key.
  4. On leaving, the member returns the key and the card is scanned again (**check-out**).
- **Payments:** cash or payment card, recorded in the app only. The app does not process payments and does not fiscalize.
- **Data:** the app starts with an **empty database**. Every member gets a new card and a new account the first time they come in after launch.

## 5. Scope
**Every feature below is MVP** (decision D-02).

| ID | Feature |
|---|---|
| F-01 | Staff accounts and login |
| F-02 | Shifts (open, resume, take over) |
| F-03 | Member card generation and printing |
| F-04 | Card scan: check-in and check-out |
| F-05 | Manual check-in/out and "U teretani" list |
| F-06 | Member registration |
| F-07 | Member list, profile, edit, anonymization |
| F-08 | Selling and renewing memberships (incl. personal training) |
| F-09 | Membership status and session counting |
| F-10 | Unpaid visits and warnings |
| F-11 | Lost card replacement |
| F-12 | Day passes |
| F-13 | Payment correction and voiding |
| F-14 | Reception cash expenses |
| F-15 | Magacin: stock-in and sales |
| F-16 | Shift close and shift report (PDF and email) |
| F-17 | Owner finance dashboard |
| F-18 | Owner expenses and expense categories |
| F-19 | Trainer statistics and payouts |
| F-20 | Visit statistics |
| F-21 | Settings: plans, prices, gym settings, logo |
| F-22 | Settings: trainers, programs, assignments, class schedule |
| F-23 | Back-dated entries (owner) |
| F-24 | Audit log |
| F-25 | Membership expiry reminder email |
| F-26 | Nightly automatic job (23:00) |
| F-27 | Offline banner |
| F-28 | Weekly automatic backup (emailed to the developer) |

Full details are in doc 05.

## 6. Non-goals (not built, do not add)
- **Payment and billing:**
  - payment processing (card terminals, online payments);
  - fiscalization or fiscal receipts;
  - invoices to companies;
  - partial payments, debts or instalments.
- **Memberships:** freezing, pausing or extending them (other than by selling a new one).
- **Other visitor and income tracking:**
  - FitPass visits (not recorded at all);
  - names or check-in for day-pass visitors;
  - space or hall rental.
- **Apps and logins:** a trainer login, a member login, a member mobile app, online booking, class reservations.
- **Messaging:** SMS, Viber or WhatsApp messages. Email is the only channel, and only for the two messages defined in doc 03.
- **Hardware:** turnstiles, door control, RFID or NFC cards.
- **Offline:** offline mode or offline queues. The app only shows a banner (F-27).
- **Data migration:** importing data from the old Excel files.
- **Multi-gym SaaS features:**
  - gym self-signup;
  - super-admin panel;
  - subscription billing.

  The **database is multi-tenant ready** (`gym_id` everywhere), but only one gym exists, created by the seed script (D-01).
- **Other:** stock-take or stock adjustments, low-stock alerts, owner-facing data export (the weekly backup in F-28 is the only export), idle screen lock, two-factor authentication. See the suggestions in doc 10.

## 7. Success criteria (verifiable)
1. **Check-in speed.** A receptionist can check in a member with an active gym-only membership using **one scan and zero clicks**. The result is shown ≤ 1 s after the scan (p95).
2. **Shift totals.** Expected cash and card totals in every shift report equal the sum of the non-voided records attached to that shift. This is verified by automated tests.
3. **Finance privacy.** No manager or receptionist can obtain any total covering more than the current day, any profit figure, or any trainer share, whether through the UI or directly through the Supabase API. This is verified by RLS tests.
4. **Rule tests.** The worked examples in doc 03 §16 pass as automated tests.
5. **Owner reporting.** The owner can see monthly revenue, expenses, profit and per-trainer payouts for any month without Excel.
