# Changelog — GymDesk (Sloth Submission Grappling)

## 2026-08-09 — v0.6 (22:40) — Unified checkbox/toggle aesthetic; scrollable tab bars
- All submenu tab bars (Member Directory, Membership Plans, Schedule, Notifications, Dashboard) are now horizontally scrollable at every screen size with tabs keeping full spacing (flex-shrink: 0) instead of squashing; added a thin scrollbar
- Removed the last raw native checkboxes from visible UI: plan "Allow raw HTML" now uses the switch toggle, settings "Show recorded check-ins" uses a pill — every visible checkbox across admin, kiosk, and member portals now uses one of the two canonical styles (switch for boolean, pill for multi-select)
- Day-picker pills now show a pointer cursor (drag cursor only on genuinely draggable pills)
- Added a "UI Aesthetics & Component Consistency" section to AGENTS.md documenting the two canonical checkbox styles, .tabs behavior, and shared .card rules so future UI stays consistent across all three portals

## 2026-08-09 — v0.5 (22:20) — Center check-in modals on phones instead of bottom sheets
- Check-in/public modals (Available Memberships, Available Classes, Class Details, Member Login, class selection, kiosk alert, staff check-in classes) now open centered on phones instead of pinned to the bottom of the screen
- Admin data-entry modals (member, payment, visit, export, custom color) keep the mobile bottom-sheet layout

## 2026-08-09 — v0.4 (22:05) — Show language name next to flag in kiosk/member menu
- The Language item in the kiosk and member-portal sliding menus (phone mode) now shows the flag plus the language name ("🇬🇧 English" / "🇬🇷 Ελληνικά") instead of the flag alone

## 2026-08-09 — v0.3 (21:50) — Hide dates in public class check-ins; admin toggle for check-in visibility
- Recorded check-ins in the public Class Details view no longer show the date (it's the clicked class date, so it's redundant)
- Added a "Class Details Visibility" setting in admin General Settings to choose whether recorded check-ins are shown publicly
- New setting is synced to Firestore like other settings and defaults to public

## 2026-08-09 — v0.2 (21:35) — Center table header labels across all lists
- Table header (`th`) text is now centered in every list/table in the app (Member Directory, Payments, Plans, Closed Dates, Schedule, Visit Log, Retention, member history, etc.)
- Row content (`td`) and section titles remain left-aligned

## 2026-08-09 — v0.1 (21:21) — Add unpaid check-ins counter to admin dashboard
- Dashboard stats now show an "Unpaid Check-ins" card with the count of outstanding unpaid visits (red when > 0, green when zero)

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
