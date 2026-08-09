# Changelog — GymDesk (Sloth Submission Grappling)

## 2026-08-10 — v0.17 (01:30) — Member portal Week/Month stats toggle; Avg Days / Month
- Member portal now has a Week/Month switcher above the statistics that shows the averages per week (Avg Trainings/Week, Avg Days/Week) or per month (Avg Trainings/Month, Avg Days/Month); the choice persists per device and the admin member modal keeps showing the full set in both granularities
- New "Avg Days / Month" stat card and Greek/English labels for the switcher and section title

- New "Avg Days / Week" stat card in member statistics (admin member modal and member portal) counting distinct training days per week, so two trainings in the same day count as 1 day/week alongside Avg Trainings / Week
- Added a matching "Avg Days / Week" visibility toggle in Member Settings (visible by default) and Greek/English i18n labels

- Member Frequency Breakdown Avg / Week now divides by the member's active span rounded to the nearest whole week (min 1) instead of exact fractional weeks, so 3 trainings over ~7 days show as 3.0 rather than 2.9

- Fixed Firestore rules: AUTH-READ collections (settings, plans, schedules, closedDates, visits, classCheckins, members, meta) were gated on `isKiosk() || isAdmin()`, but `isKiosk()` excludes any token with an email claim — so Google-signed-in members were denied reading settings (including memberStatsVisibility), causing hidden Member Settings stats to reappear in fresh incognito member sessions. Reads now allow any authenticated token (`request.auth != null`); write rules unchanged

- New "Total Hours Trained" stat card in member statistics (admin member modal and member portal), summing each unique class session's duration with a 1-hour fallback and legacy visit entry→exit durations
- Added a matching "Total Hours Trained" visibility toggle in Member Settings (visible by default) and Greek/English i18n labels

- Fixed Revenue Per Member (and other retention KPIs) excluding today's payments when logged before noon: the preset analysis window now ends at end-of-day instead of the exact current instant, so payment dates (parsed at local noon) always fall inside the window
- KPI cards and the Member Frequency Breakdown now refresh immediately after saving a member or a payment while the Retention pane is open, instead of only on pane re-entry or period change

- The Member Frequency Breakdown table no longer shows the member ID badge under each name, leaving just the member's name

- Member directory: out-of-sessions members no longer get the red row/card background (that now applies only to expired members), and their status badge reads "Active (No Sessions)" instead of "No sessions"
- Check-in Log visit edit modal now has a Payment Status dropdown (Auto / Paid / Unpaid) letting admins force a visit paid or unpaid; the reconciliation engine respects the manual override and skips it when Auto is chosen

- Member Frequency Breakdown table now has clickable column headers (like Member Directory) that sort by Member, Belt, Classes, Avg / Week, or Segment, with asc/desc toggling and an arrow indicator
- Default sort stays "most at risk first" (Avg / Week ascending)
- Belt moved out of the belt-colored member-ID box under the name into its own Belt column as a textless belt-color box; the ID under the name is now a neutral gray badge

## 2026-08-10 — v0.8 (00:02) — Admin control over which member statistics members can view
- New "Member Settings" admin menu (separate sidebar entry under System) lets the admin toggle which personal statistics members see on their own dashboard: Total Trainings, Avg Trainings / Week, Avg Trainings / Month, Leaderboard Rank
- Settings sync to Firestore like other settings and default to all-visible; admins always see the full set in the member modal
- Member portal shows a muted "no statistics" message if every stat is hidden (en + el i18n)

## 2026-08-09 — v0.7 (23:52) — Keep KPI badges and titles inside their cards
- KPI card headers in Retention & Attendance now wrap instead of overflowing: the "Not tracked" / "Below target" / "On track" badge drops below the title on narrow cards and stays inside the box

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
