# Changelog — GymDesk (Sloth Submission Grappling)

Recent entries only. Older entries are in `HISTORY-ARCHIVE.md` (full history is also in git).

## 2026-08-15 — v0.40 (01:15) — Fix Training Stats vertical spacing
- Tightened the vertical rhythm of the member Training Stats attendance section: reduced the overview/progress-bar margins, set the big % to line-height 1 (emoji no longer inflates the line box), and added a 1rem gap before the stat-card grid so the subsections read as one cohesive card

## 2026-08-15 — v0.39 (01:08) — Kiosk & member portal UI consistency + gamified member stats
- Kiosk: renamed "Gym Schedule" card to "Training Schedule" (EN), added a subtitle and a `📅 N` weekly-session badge to its header, and unified the max-height of the Currently Inside / Training Schedule / Training Leaderboard scroll areas (330px) so all kiosk boxes look alike
- Public modals: "Available Memberships" and "Classes" now share an identical card layout (colored name + meta badge, summary row + i18n'd expand label, expandable details) via `togglePublicPlanDetails` and the shared `.public-expand-label`/`.public-meta-badge` styles
- Member portal: removed the Week/Month stats switcher; the Training Stats attendance section is now gamified with a big overall % + progress bar and per-class progress bars with color-coded % and emoji
- Member portal: Leaderboard Rank moved inside the Training Stats stat grid (separate rank card removed); stat cards gained emoji icons and top-3 medal emoji, with a gold-accent gradient rank card
- Member portal: fixed "Current Belt" badge alignment with its label via a flex row
- i18n: new keys `scheduleSubtitle`, `classSessionsPerWeek`, `planExpandDetails`, `planCollapseDetails`, `planValidityLabel` (EN+EL); bumped cache-busters and `version.txt`

## 2026-08-12 — v0.38 (16:03) — Fix sync engine losing local modifications on hard refresh
- `markDirtyCollections` now sets `updatedAt` on modified records and tracks unconfirmed write intents (persisted to localStorage via `persistIntents`). Previously only dirty flags were set — local modifications had no protection against cloud snapshots overwriting them on reload.
- First-apply merge (`applyCollectionSnapshotData`) now uses revision-based resolution (same as the clean path): local records with fresh unconfirmed intents are always preserved, and records with a newer `updatedAt` win over cloud records with an older one.
- `reconcileAllMemberPayments` now waits for `whenReady('visits')` and `whenReady('members')` in addition to `payments`, preventing reconciliation from running with incomplete data on fresh boot.
- Delete intents can now overwrite stale write intents: the `!has(key)` guard changed to `!existing || !existing.deleted` so a create-then-delete sequence before flush commit survives hard refresh without resurrecting the deleted record.
- Size-mismatch path in `markDirtyCollections` now also tracks modified records (not just new ones) as unconfirmed intents.

## 2026-08-10 — v0.37 (18:50) — Remove Firebase Hosting; GitHub Pages is the only deployment target
- Removed the `hosting` block from `firebase.json` — the app now deploys exclusively to GitHub Pages (`https://members.ssgbjj.gr/`)
- Removed Firebase Hosting (`ssg-desk.web.app`) references from `AGENTS.md`; `firebase deploy --only firestore:rules` remains the only post-commit deploy command
- No code changes; the Firebase project is still used for Firestore and Auth

## 2026-08-10 — v0.36 (19:00) — Fix dashboard alternating between two versions on restart
- Root cause: every Firestore snapshot arrival triggered `renderAfterCloudSync()` which re-rendered ALL admin views (dashboard, visit log, calendar, payments, schedules, etc.). During boot 5+ collections fire snapshots in rapid succession, each producing a full DOM rebuild — the intermediate renders showed partial/stale data and alternated between states depending on timing
- Added an 80ms debounce (`scheduleAfterCloudSyncRender`) so multiple rapid snapshots coalesce into a single render after STATE has absorbed all arrivals
- Also removed `autoCheckoutStaleVisits()` from inside `renderAdminDashboard()` — the 60-second interval already handles stale checkouts; running it during renders caused a self-perpetuating snapshot→render→save→snapshot cycle
- Analytical calendar month now uses `localStorage['gym_analytical_month']` as authoritative source, falling back to current month if both picker and localStorage are empty
- Added `autocomplete="off"` to the month picker to prevent browser form-state restoration

## 2026-08-10 — v0.35 (16:45) — Notifications: Mark All Read, tiered colors, newest-first ordering
- Added "Mark All Read" button next to "Clear All" in the Notifications pane (`App.markAllNotificationsRead()`)
- Notifications now have visual tiers via `App.notificationTierColor()`: danger=red, warning=amber, success=green, info=blue — applied to the title in both the Inbox and Recycle Bin lists
- The sidebar notification badge is now tier-aware too: it turns red only when there's a danger-tier (unpaid/expired check-in) alert, amber for warning, green for success, blue for info — so the Front Desk shows red only when a member checked in without paying
- Notification Inbox and Recycle Bin are now explicitly sorted newest (top) → oldest (bottom) by date, instead of relying on storage order

## 2026-08-10 — v0.34 (16:00) — Fix member name edit reverting on refresh; fix "Unknown Member" in payments ledger
- Bug 1 root cause: a check-in client (kiosk/staff) with a stale copy of a member doc (old name, mirror frozen during a dirty flush) wrote back the WHOLE member record on its sessionsLeft save, overwriting the newer cloud name — the admin's edit landed locally but the cloud silently reverted, so a page refresh showed the old name
- `diffAndWrite()` now emits field-scoped member writes for records already in the mirror: only the fields whose values actually differ are written (a check-in writes just `sessionsLeft`), so stale display fields (name/belt/etc.) are never clobbered back over newer cloud docs
- Bug 2 root cause: the payments ledger resolved names from STATE.members at render time, so it flashed "Unknown Member" when members weren't applied yet, and payment records referencing renamed member ids were never translated once loaded after the rename ledger
- `renderAllPayments()` now shows a loading row and defers until members are ready (`FSEngine.whenReady('members')`), and resolves names through the rename ledger (`FSEngine.renameMap`) when the direct id lookup fails
- `applyCollectionSnapshotData()` now translates `memberId` through `resolveRenameTarget()` as payments/visits/class-check-ins/notifications load, so records loaded after a rename never point at a stale id (also fixes the same gap in the visit log/dashboard lookups)
- Bug reports tracked in `BUGS.md` (both marked fixed)

## 2026-08-10 — v0.33 (15:20) — Unpaid visits stay unpaid after a package purchase: stale manual override blocks reconciliation
- Root cause: a visit's Payment Status dropdown in the Visit Edit modal can set a manual `paidOverride: 'unpaid'`. The reconciliation engine hard-honors that override, so when the member later buys an 8-session (or any) package, the new session quota / date coverage can NOT clear the visit — it stays unpaid forever even though the account activates and the package covers it (confirmed in production data: member 8997 has an active Drop-In Bundle but visit V-1786061427991 stuck unpaid because `paidOverride='unpaid'` was set earlier)
- `savePayment()` now clears any manual `paidOverride === 'unpaid'` on the member's visits before running the reconciliation, so a freshly-recorded payment re-evaluates those visits against the new coverage (the purchased sessions are consumed by the outstanding debt, e.g. an 8-session bundle after 1 unpaid check-in leaves 7)
- The manual override is still honored everywhere else (a deliberately forced visit stays forced until the next payment is recorded, and `Auto`/`Paid` behavior is unchanged)

## 2026-08-10 — v0.32 (14:00) — Fix admin writes silently failing: Firestore rules denied notification creates
- ROOT CAUSE of the disappearing payments/notifications all along: the `notifications` collection rule only allowed `create: if isKiosk()`. Admin tokens carry an email claim, so `isKiosk()` returns false for them — admin-created notifications (Member Activated, New Member Registered, Debt Cleared) were always DENIED
- Because Firestore batches are atomic, the payment/member/notification saves in the same 600ms-debounced batch FAILED TOGETHER: the payment and member update never reached Firestore (they existed only in localStorage and vanished on refresh/wipe), and the notification was never stored
- `firestore.rules` now allows `create: if isAdmin() || isKiosk()` for notifications — admin can now create notifications, so the whole batch commits
- DEPLOY REQUIRED: `firebase deploy --only firestore:rules` (the JS app was fine; only the rules were wrong)

## 2026-08-10 — v0.31 (13:30) — Fix payments & sensitive data wiped on every page load
- Root cause: `App.lockAdmin()` was called during `App.init()` (before `initAuth()`), which immediately called `clearSensitiveData()` — wiping payments, notifications, bins, and member PII from STATE and localStorage on every page load, BEFORE the Firestore listener that reloads them had been set up. On next page load, `localStorage['gym_payments']` was `[]`, so payments appeared empty even though they existed in Firestore
- Fix: init now only sets `adminAuthed = false` and hides the admin view. `lockAdmin()` (with data wipe) is still called from the logout flow and when `onAuthStateChanged` detects a non-admin user — but never during boot
- Combined with v0.30, payments now survive hard-refreshes and multi-device admin sessions

## 2026-08-10 — v0.30 (13:00) — Fix stale snapshot overwrite when dirty is clear (non-dirty branch)
- v0.29 fixed the dirty-client path where a stale STATE diffed against a newer mirror caused mass deletes. The remaining race was in the non-dirty branch: when dirty is clear and applied is true, any snapshot blindly replaced STATE with cloudArr (`STATE[cfg.state] = cloudArr`). A stale in-flight snapshot (common with two admin devices open) could delete records that existed locally and were just written to Firestore, reverting the database minutes later
- `applyCollectionSnapshotData()` now accepts previous mirror keys and, in the non-dirty branch, preserves locally-present records that were never seen in any prior mirror snapshot — they are recently created and the snapshot may not have caught up yet. If records are preserved, dirty is re-marked and a flush re-attempts
- `handleCollectionSnapshot()` now captures the mirror key set before updating it, passing it to `applyCollectionSnapshotData` for the stale-snapshot guard
- `flush()` is now async: `resolveFlush()` fires AFTER `diffAndWrite()` completes instead of synchronously before the async write finishes — the promise was resolving too early, which let `clearSensitiveData()` wipe STATE/localStorage before the Firestore commit landed on admin logout
- IMPORTANT: hard-refresh all devices (kiosk, admin, phones) and close old tabs — any device still running old JS can still trigger the race

## 2026-08-10 — v0.29 (12:05) — Fix database reverting to previous versions (sync engine)
- Root cause: while a client had pending local edits (dirty), a Firestore snapshot could not be applied to its in-memory STATE, but the diff baseline (mirror) was still refreshed to the newer cloud state. The next flush then diffed a STALE STATE against a NEWER mirror and treated cloud records the client simply hadn't loaded as "deleted locally" — a dirty admin client erased other devices' fresh check-ins/payments from Firestore, and a stale dirty client re-wrote old copies of docs back over the newer cloud versions. Net effect: a few minutes after any change, the database silently jumped back to a previous version
- `handleCollectionSnapshot()` now freezes the mirror (diff baseline) while a collection is dirty — it only advances once the pending edits flush and the collection turns clean again
- `applyCollectionSnapshotData()` now catch-up merges cloud records that lie outside the frozen baseline into a dirty STATE, so a client with pending local edits never goes blind to newer cloud docs and a flush can never delete docs it hasn't seen
- Also breaks a stall cascade: a permanently dirty client whose spurious deletes were denied by rules had every batch fail, freezing its STATE and pushing old data indefinitely; with a sound diff it now flushes cleanly and stays in sync
- IMPORTANT after deploy: hard-refresh every device (kiosk, admin, phones) and close all old tabs — any device still running the old JS can still delete data

## 2026-08-10 — v0.28 (11:30) — Persist settings to localStorage; batch notice save
- `memberStatsVisibility` and `showClassCheckins` now persisted to/loaded from localStorage (previously only in Firestore — offline page reloads silently reverted to defaults)
- `saveCheckinNotice()` now updates both notice text AND color in a single `saveToCloud()` call instead of two separate flushes
- Member directory column configuration (`columnsConfig`) now persisted to localStorage — column visibility and order survive page reloads

## 2026-08-10 — v0.27 (11:02) — Sync notifications reliably (same fix class as payments)
- Notifications is admin-read-only / kiosk-create: the diffAndWrite and markDirtyCollections `ready` gates could drop kiosk-created alerts (e.g. Frozen/Expired check-in attempts) when no notifications snapshot had been seen — notably after an admin logout reset ready and unsubscribed the listener — leaving the alert only in localStorage until the next wipe
- `diffAndWrite()` now never gates notifications writes on their first (admin-only) read snapshot; `markDirtyCollections()` now tracks local notifications as dirty before that snapshot too, so they flush to Firestore and are never replaced by a later cloud apply
- Admin re-login already force-resubscribes notifications (v0.25); with the above, kiosk-created alerts now also survive logouts and show up on every admin device

## 2026-08-10 — v0.26 (10:59) — Fix payments never syncing to Firestore (silently dropped saves)
- Root cause: `diffAndWrite()` skipped a collection until its first snapshot arrived (`ready` flag). Payments are admin-read-only, so on a fresh kiosk boot the anonymous listener errors and `ready['payments']` stays false — payment saves were silently dropped (localState/localStorage only) while the member update in the same batch synced fine, so the membership applied but the payment never reached Firestore and vanished after admin re-login
- `diffAndWrite()` now lets the admin client write admin-only collections (payments, plans, bins) even before their first snapshot: writes are merge-sets keyed by record id (safe against a not-yet-loaded cloud state), and the delete pass is still guarded by the `applied` flag so an empty local state can never wipe the cloud
- `lockAdmin()` now defers the `clearSensitiveData()` wipe until the pending Firestore flush promise resolves, so a payment saved right before logout is committed before the local copy is destroyed
- `clearSensitiveData()` now unsubscribes the still-live payments/notifications/bins listeners created under admin auth, so they can no longer re-populate wiped payment data into STATE/localStorage after logout on a shared device (next admin unlock re-subscribes them)

## 2026-08-10 — v0.25 (03:00) — Manual Firestore resync button in settings
- Added a "Resync Data" button in General Settings → Data Management that force-reloads all Firestore listeners — useful after hitting the read quota, after a permission-denied kills a listener, or when collections appear empty after a sync hiccup

- Export/Import backup now also stores and restores the check-in notice text, the "show recorded check-ins" setting, and the member statistics visibility toggles (previously only portalName/currency/colors were backed up)

- Fixed a data-loss bug where logging out and back in as admin deleted the entire payments/notifications/bins cloud data: `clearSensitiveData()` wiped the local arrays but left the sync engine's ready/applied/snapSeen/mirror state intact, so the next admin login's flush diffed an empty local list against the cloud mirror and issued delete ops for every document
- `clearSensitiveData()` now resets the sync metadata for the wiped collections so an empty local state can never be flushed as deletions, and admin unlock now force-resubscribes payments and the bins so the history reloads after every login

- The Statistics section in the member portal is now collapsible: clicking the Statistics header collapses/expands the stat cards (with a ▾/▸ arrow), and the collapsed state is remembered per device

- Member portal Leaderboard Rank moved out of the statistics grid into its own card, labeled "(last 90 days)" (the rank is computed over the trailing 3 months); it still respects the Member Settings visibility toggle
- The admin member modal's rank card now also shows the "(last 90 days)" suffix; Greek/English label added

- Total Hours Trained now displays as hours and minutes (e.g. "12h 30m") instead of a decimal number
- Added missing Greek translations so Total Trainings, Avg Trainings / Week, and Avg Trainings / Month no longer fall back to English
- Member portal header buttons reordered: language toggle now sits to the left of Logout

- "Avg Days / Month" is now an always-visible stat card (total training days ÷ months since first training) in both the admin member modal and the member portal, instead of only showing inside the Month toggle view
- Added a matching "Avg Days / Month" visibility toggle in Member Settings (visible by default)

- New "Avg Trainings / Day" stat card (total trainings ÷ distinct training days) in member statistics, shown in both the admin member modal and the member portal alongside the Week/Month averages
- Added a matching "Avg Trainings / Day" visibility toggle in Member Settings (visible by default) and Greek/English i18n labels

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
