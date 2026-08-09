# Changelog — GymDesk (Sloth Submission Grappling)

## 2026-08-09 — Flag-only language button in member portal and check-in
- Language toggle button in the kiosk/member drawers now shows only the flag emoji (UK flag for English, Greek flag for Greek), no text

## 2026-08-09 — Add manual "Cancelled" member status for admins
- Added "Cancelled" option to the Account Status dropdown in the member modal so admins can cancel members manually
- Directory badges, status filter tab, and exports recognize the stored Cancelled status (filter also still includes 90d+ no-training members)
- Cancelled members are blocked from kiosk/mobile self check-in and flagged as unpaid like Frozen/Inactive
- Added cancelled status messaging in staff check-in and member portal (en + el i18n)

## 2026-08-09 — Add CSV export to Retention & Attendance
- Added "Download CSV" button to the Member Frequency Breakdown card in the Retention & Attendance pane
- Export honors the current segment filter and includes member ID, name, belt, classes, avg/week, and segment

## 2026-08-09 — Wire class capacity into schedule editor; refresh KPIs on retention pane
- Class capacity field wired into the schedule editor UI
- Retention pane now refreshes KPIs after data changes

## 2026-08-08 — Force dd/mm/yyyy date display in admin and member portals
- Admin and member portals now force dd/mm/yyyy date format throughout

## 2026-08-07 — Custom date range view for retention statistics
- Added custom date range picker to the retention statistics view
- Allows admins to narrow retention analysis to arbitrary date windows

## 2026-08-06 — Trial plans, trial conversion KPI, and cancelled (90d) status
- Added trial membership plan support
- Trial-to-paid conversion rate KPI on the admin dashboard
- New "cancelled (past 90 days)" member status filter

## 2026-08-05 — Retention & attendance analytics
- Added retention analytics and attendance statistics to the admin dashboard
- New charts and summary cards for member retention data

## 2026-08-04 — Cap Firestore flush retry loop
- Added a cap on the Firestore flush retry loop to prevent Firebase quota exhaustion

## 2026-08-03 — Friendly member directory cards on mobile; fix sync merge-guard & admin-lock flush
- Member directory now shows friendlier card layout on phone screens
- Fixed a sync merge-guard bug that could discard cloud data
- Fixed admin-lock flush that could leak sensitive data on logout

## 2026-08-02 — Update AGENTS.md with deployment instructions
- Added deployment instructions and push-reminder rule to AGENTS.md

## 2026-08-01 — Fix member private data and notification sync for fresh incognito admin login
- Fixed member private data not loading on a fresh incognito admin login
- Fixed notification sync not triggering after admin first login

## 2026-07-30 — Initial commit
- Full initial commit of the GymDesk app (Sloth Submission Grappling)
- Firebase Firestore backend, kiosk check-in, admin panel, member portal
- Anonymous kiosk auth, admin email/password auth, member Google sign-in
- Membership plans, payments, class schedules, visit logging
- Greek/English i18n, local-first offline sync
