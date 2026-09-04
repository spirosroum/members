# Changelog — GymDesk (Sloth Submission Grappling)

Recent entries only. Older entries are in `HISTORY-ARCHIVE.md` (full history is also in git).

## 2026-09-04 — v1.36 (23:35) — Fix: payment windows no longer retroactively cover older workouts

- Corrected the server-side recompute to use each payment's actual coverage window: a plan/payment only covers visits between `applied_start_date` and `applied_expiration`, never earlier workouts
- Removed the retroactive "future expiration pays past visits" rule that caused a Sept 1 payment to cover an Aug 1 check-in and made the session ledger look inflated
- Added a one-time repair that fills missing `applied_start_date` values from the payment date and re-runs member recompute so existing data stays backward-compatible
- Preserved the valid "active without sessions" state: zero sessions left remains active when a current time window is still valid

## 2026-08-30 — v1.35 (23:35) — Payments ledger Excel export with date range

- Admin Payments pane now has Start/End date pickers and a Download Excel button
- Export writes an Excel spreadsheet (.xls) of ledger payments in the chosen range (member, amount, plan, coverage dates, note) plus a totals row
- Date inputs default to the 1st of the current month through today when the pane first loads
