# Changelog — GymDesk (Sloth Submission Grappling)

Recent entries only. Older entries are in `HISTORY-ARCHIVE.md` (full history is also in git).

## 2026-08-26 — v1.31 (12:55) — Crown Bounty chart: label spacing + column-first mobile legend

- PC right-side labels: tied members' name spread widened 14px → 18px per row so stacked names at the same count no longer overlap
- Mobile tap legend: grid now fills column-first (`grid-auto-flow: column` + explicit row count), so rankings read top-left → bottom-left, then top-right → bottom-right

## 2026-08-26 — v1.33 (14:10) — Hunt Log duplicate «took the Throne alone» + tied-king order flip fixed

- Hunt Log: `kingGroup` was never pruned when co-kings fell behind, so every later record extension by the surviving group re-fired the `consolidate` event against long-gone members (Μαρία & Δημοσθένης «broke away from Fransisco & Reynaldo & Γιώργος Πα.» on both Aug 10 AND Aug 12). The reign is now pruned to the still-identical kings at each consolidation, so the event fires exactly once per actual reduction of the king group
- Leaderboard/chart: tied members with identical histories (e.g. Μαρία & Δημοσθένης at 5 on Aug 12) could flip display order because the tie-break compared only who reached the CURRENT count first. New shared `crownReachDiff()` seniority comparator decides by the first count at which their reach times differ — order between identical histories never flips when they extend on the same day. Applied to `rankPeriodSeries` (leaderboard, modal, chart) and the ▲/▼ yesterday comparison
- `BUILT` and the app-kiosk.js cache-buster synced to `20260826-60`

## 2026-08-26 — v1.32 (13:35) — Fix: false «took the Throne alone» in the Hunt Log

- When a co-king group extended the record on the same day but the actor's entry was replayed first (earliest `entryTime`, e.g. the others were backfilled later), the `consolidate` event decided «who broke away» from the replay-time `latestCounts` snapshot — the not-yet-replayed co-kings still showed their old count and were all falsely listed as broken away (e.g. «Γιώργος took the Throne alone — broke away from Fransisco & Reynaldo & Μαρία & Δημοσθένης» on Aug 5, while Reynaldo/Μαρία/Δημοσθένης had in fact extended together with him to 2)
- The split now uses the full per-date histories via `identicalThrough` (complete series, not the replay cursor): co-kings still identical through the event date are credited as the new king group (`alsoIds`), only genuinely diverged members are listed as broken away
- Same scenario now logs: «Γιώργος & Reynaldo & Μαρία & Δημοσθένης took the Throne alone — Broke away from Fransisco. · August 5» — matching the leaderboard (4 crowned at 2, Fransisco at 1)
- `BUILT` and the app-kiosk.js cache-buster synced to `20260826-59`

## 2026-08-26 — v1.31 (13:05) — Chart now uses the shared Crown Bounty ranking engine

- `renderKioskChart` no longer reimplements ranking/crown logic: `rankOfMember` ordering and the 👑 group now come straight from the shared `rankPeriodSeries()` engine (same source of truth as the Bounty Leaderboard and the Period Rankings modal), removing the duplicated inline tie-break code
- Side benefit: chart tooltips/legend now display shared places (e.g. two members with identical histories both show #1) exactly like the Bounty Leaderboard
- No behavior change to Hunt Log, Winners list or period scoping — verified they already derive from `getCrownEvents` / `getCumulativeTrainingSeries`
- `BUILT` and the app-kiosk.js cache-buster synced to `20260826-58`

## 2026-08-26 — v1.30 (12:15) — Fix: kiosk reload loop from stale version guard

- The v1.29 deploy bumped `version.txt` but not the `BUILT` constant baked into `index.html`, so the version guard saw a mismatch every check and reloaded the page forever (most visible in the always-on check-in portal)
- `BUILT` and the app-kiosk.js cache-buster are now synced to `20260826-57` along with `version.txt`

## 2026-08-26 — v1.29 (12:00) — Crown Bounty chart: ranked hover/tap member lists

- PC hover tooltip: members now listed strictly top-to-bottom by ranking (highest position/most workouts first) via Chart.js `itemSort` on the shared rank map; each row shows its explicit `#N` position right beside the color indicator
- Mobile tap legend: same strict ranking order, each entry now shows color swatch + `#N` position + name (crown prefix stripped, 👑 stays on the chart labels)

## 2026-08-25 — v1.28 (17:41) — Crown Bounty chart: longer overlap dash segments

- OVERLAP_DASH_LEN bumped 7px → 11px so the alternating multi-color dashes on overlapping lines are easier on the eyes

## 2026-08-25 — v1.27 (17:34) — Crown Bounty chart: overlapping lines drawn as multi-color dashes

- Members with identical training histories rendered pixel-identical lines stacked on top of each other — only the topmost (highest-ranked) line was visible
- New `kioskOverlapDash` Chart.js plugin detects segments where N ≥ 2 datasets share the exact same pixel coordinates and repaints them as a dashed path alternating each member's own color (A→B→A→B…, works for any N); non-overlapping segments stay solid
- Dash pattern uses exact per-member slots (period N·7px) so the passes tile the segment with no gaps; slightly thicker stroke fully covers the underlying solid lines
- Names, tooltips, hover states, legend, markers and all other chart behavior untouched

## 2026-08-24 — v1.26 (19:45) — Attendance stats: per-date ledger counting fixes empty denominators

- Member portal attendance % used the ACTIVE classes only, so hiding Fundamentals/Leg Locks on Aug 24 emptied the session denominator for entire past windows («No class sessions were available in this period», e.g. May 27 – Aug 24)
- `buildAvailableTrainings` now resolves each date through the schedule_activity ledger — a class counts toward a date's available sessions iff it was active on THAT date (Fundamentals/Leg Locks count Aug 3–23, stop Aug 24–30, return Aug 31); classes without ledger history keep the legacy gates
- Same semantics as the calendar/Day Details; `getActiveSchedules` remains only for strictly current-state views

## 2026-08-24 — v1.25 (19:20) — Version guard fixed: stale cached pages can no longer strand themselves

- The old guard stored the fetched version in localStorage and only reloaded on mismatch — a stale cached page would immediately store the NEW version while still running OLD JS, then never reload again (observed live: the kiosk kept rendering pre-ledger behavior after all fixes deployed)
- The guard now compares version.txt against the version baked into the running page (`BUILT` constant in index.html): any stale page self-reloads until the server serves matching HTML; `BUILT` must be bumped together with version.txt on every deploy

## 2026-08-24 — v1.24 (18:05) — Backfill migration: real class activation history into schedule_activity

- New migration `20260824000013_schedule_activity_backfill_truth.sql` encodes the owner-provided truth, replacing the inferred seed rows for the affected classes: Advanced / Competition / Wrestling / Kids never active; Open Mat active from Aug 24; Fundamentals + Leg Locks active Aug 3–23, hidden from Aug 24, re-active from Aug 31 (future-dated ledger row); Leg Locks cancelled on Tue Aug 18 via a `schedule_overrides` row
- Run order in the Supabase SQL editor: `…000012_schedule_activity.sql` first (if not yet applied), then `…000013_schedule_activity_backfill_truth.sql`; both idempotent — the included verification SELECT should list each class's full timeline

## 2026-08-24 — v1.23 (17:45) — Class activity history ledger (schedule_activity) replaces state-inference

- v1.21's "past weeks show everything" overcorrected: classes that never ran in a past week (e.g. newly added or long-hidden Kids/Advanced) appeared there, because the calendar could only infer history from each class's CURRENT state
- New append-only history table `schedule_activity` (id, schedule_id, status active|hidden, effective_from, created_at): every visibility toggle and new class now WRITES a dated row, and the calendar / weekly badge / Day Details READ "was this class active on that date?" from it instead of guessing from today's state
- Migration `20260824000012_schedule_activity.sql` MUST be applied to Supabase — it bootstraps one row per existing class (active since earliest real evidence: first check-in, else activation/creation date) plus hidden-from-today markers for currently hidden classes; client degrades gracefully to the old behavior until applied
- Known bootstrap limitation: a class that was already hidden BEFORE today has no historical hidden marker; if needed, backdate one `schedule_activity` row manually (status 'hidden', effective_from = the date it was hidden)

## 2026-08-24 — v1.22 (17:10) — Day Details: past dates group check-ins under the class that ran

- Check-in Activity Calendar → Day Details resolved sections against ACTIVE classes only, so hiding a class retroactively relabelled all its past-day check-ins to «Inactive / Removed classes» (e.g. 03 Aug showing the fallback bucket instead of Fundamentals)
- For strictly past dates, Day Details now resolves against ALL classes: a hidden (or later re-activated) class keeps its own named section with its historical check-ins; only truly deleted classes stay in the fallback bucket
- Classes appearing in a past day's check-ins also regain a section even if their slot no longer exists on that weekday (e.g. after moving a class's day)
- Today/future dates keep the active-only view, consistent with the calendar history fix in v1.21; attendance % deliberately unchanged (hidden classes still excluded from stats)

## 2026-08-24 — v1.21 (16:45) — Schedule calendar: past weeks show history regardless of hide/activation

- The Training Schedule calendar (kiosk + admin master) dropped classes from past weeks once they were hidden or re-enabled: hiding filtered them out everywhere, and re-activating bumped their activation date (`availableFrom`) to today, so the whole prior week (e.g. 17–23 Aug after an Aug-24 change) rendered empty
- Strictly past dates are now immutable history: they always show the classes that ran back then, regardless of current visibility or activation date; current and future days keep respecting both gates (hidden stays hidden ahead, newly activated classes don't retroactively appear)
- The kiosk weekly 📅 badge counts with the same rules, so past-week badges reflect historical sessions

## 2026-08-24 — v1.20 (16:25) — Schedule builder: Save Entire Class now commits a pending slot edit

- Follow-up to v1.19: pressing the big «Save Entire Class» button silently ignored any in-progress slot edit (day/time picker state was only consumed by the small «+ Add Time Slot / Save Changes» button), so changing a day via the picker then saving directly left the slot on its old day
- «Save Entire Class» now auto-commits a pending slot edit first (aborting if the selection is incomplete), so editing a day and hitting save works no matter which button is pressed
- Any other leftover day/time selection now warns explicitly instead of being dropped silently

## 2026-08-24 — v1.19 (16:06) — Schedule: fixed editing a slot's day duplicating instead of moving

- Training Schedules → Add / Edit Class → slot Edit: the slot's current day stayed pre-checked in the day picker, and because `querySelectorAll` returns days in DOM order (Mon…Sun), the OLD day was always `checkedDays[0]` — "Save Changes" kept the slot on its original day and silently created a duplicate slot on the newly checked day
- Now, while editing a slot, the pre-checked original day is treated as current state rather than a selection: the first *newly* checked day moves the slot there; any further checked days still create additional slots; single-day edits (time changes only) behave exactly as before

## 2026-08-24 — v1.18 (00:45) — Winners rankings modal, marker stacking fix, hunt alert removed

- Removed the «🔥 … — 1 point left to challenge the Throne!» alert from the Hunt Log (markup, renderer, i18n keys)
- Chart event markers now stack top-down per day: 👑 kings always highest, 🛡️ defenses below them, ⚔️ challenges lowest — a new king's emoji can no longer render under a shield even when they sit on different members' lines
- «Crown Bounty Winners» rows are now clickable (hover highlight + › affordance), including the ongoing period; clicking opens a Period Rankings modal listing every member's place/count for that period — final standings once finished, standings-so-far while ongoing, 👑 for the reigning group, roster safety net included
- Extracted the shared ranking engine `rankPeriodSeries()` so the Bounty Leaderboard and the new modal use one source of truth for places/crowns
- Verified with an automated harness: 11/11 scenarios pass

## 2026-08-24 — v1.17 (00:21) — Bounty periods renumbered, period navigation, live countdown

- Removed the «All-time» button from Crown Bounty; the chart, Hunt Log, King bar and Bounty Leaderboard are strictly period-scoped
- New ‹ › period navigation: ‹ appears only when the previous period has recorded sessions, › only while a newer viewed period exists (never past the running one); navigating also rescopesthe Bounty Leaderboard's date picker to that period (defaults to its last day)
- Period numbering fixed: Jul–Oct = Period 1, Nov–Feb = Period 2, Mar–Jun = Period 3 (chart label and Crown Bounty Winners list follow); endExcl corrected to a true exclusive boundary (first day of the next period)
- Countdown banner is now live: ⚔️ 69d 04h 12m 33s until the Crown Bounty ends! — ticks every second with localized unit letters (ημ/ώ/λ/δ in Greek); hidden while viewing a past period
- Verified with an automated harness: 22/22 scenarios pass

## 2026-08-24 — v1.16 (00:01) — Bounty LB: late-backfilled attendance no longer vanishes from past days

- Fixed members missing from historical Bounty Leaderboard days (e.g. absent on Aug 17, back on Aug 19; first training on Aug 4 invisible): the window gate tested the record's entry timestamp, but admin-marked/backfilled attendance stores entryTime = save moment while slotDate = the real class day — anything recorded more than a day later never appeared on earlier date views. The window is now bounded purely by session date, so any session dated to that day shows on that day no matter when it was entered
- Seniority fix: «who reached N first» tie-breaks now anchor the time-of-day to the session date, so backfilled sessions keep the seniority of their own day instead of their bookkeeping timestamp
- 💩 semantics clarified (unchanged code): 🥇🥈🥉 are fixed to places 1–3 and 💩 marks only the unmedaled last-place row(s); a sole member is place 1 → crowned 👑, never pooped
- Verified with an automated harness against the live code: 22/22 scenarios pass, including the exact reported Aug 4 / Aug 17 cases

## 2026-08-23 — v1.15 (23:28) — Bounty LB: phantom-member fix, correct ▲/▼, midnight-safe sessions

- Fixed members appearing/disappearing on the Crown Bounty Leaderboard: a member with «Hide from Leaderboard» enabled was excluded from the roster BEFORE the safety net snapshot, so their own check-ins re-added them as a nameless phantom row (raw id) — hidden ids now count as known and stay off the board; genuinely unknown ids (deleted members with trainings, e.g. Christos) are still rescued
- Fixed ▲/▼ movement indicators for anyone tied on the previous day: yesterday-reference places were sorted by score only, silently inheriting TODAY's order — a displaced holder showed no ▼ and a climber no ▲ whenever they had been tied; reference places now use the exact same tie-break chain as today's standings (score → who reached it first → first training date → name)
- Midnight-boundary safety in the training series: entry timestamps get a ±24h grace while placement is enforced on the effective session date — a class backfilled shortly after midnight now credits its class day instead of vanishing from it (late-night bookings still credit the class's own day)
- Verified all Crown Bounty Leaderboard rules against the live code with an automated harness (15 scenarios): strict surpass-to-overtake, holder-keeps-spot-on-tie, identical-history sharing + shared 👑, green/red/no-indicator movement, open-gym counting, dedup of duplicate check-in rows, period scoping

## 2026-08-23 — v1.14 (04:00) — Bulletproof date arrows (SVG chevrons)

- Replaced the ‹ › text arrows on the Bounty Leaderboard date picker with inline SVG chevrons — they render identically on every device/font and no longer depend on Unicode glyph support
- Restored index.html from the last clean commit after a tooling rewrite risked encoding damage; verified all emojis/Greek text intact

## 2026-08-23 — v1.13 (03:30) — Ranking audit: strict holders, identical-history sharing only

- Re-audited and enforced the core ranking rules: each position has a single holder; a position is shared ONLY by players whose entire workout history is exactly identical
- Record-breaking rule applied at every position: matching a holder's workout count does NOT take their spot — the holder keeps it until strictly surpassed, and the challenger lands below (position = number of players ahead + 1, so a first check-in a day after four founders lands 5th)
- Yesterday-reference places for ▲/▼ use the same grouping rules, so indicators stay consistent with the displayed ranking

## 2026-08-23 — v1.12 (02:50) — Shared-place arrows fixed; Hall of Kings temporarily removed

- Leaderboard places now use competition ranking (1224): equal counts share a place, listed by who reached it first — this is the ranking the ▲/▼ indicators compare against
- Indicators fixed: climbing any shared place shows ▲ green (Manos 4th→3rd), being displaced shows ▼ red (Giorgos Panagiotidis), and kings who keep training together hold the same shared place with no arrow (Maria case)
- Hall of Kings temporarily removed (section markup, renderer and i18n hook) until its stats are reworked; Crown Bounty Winners is unaffected

## 2026-08-23 — v1.11 (02:10) — Crown requires identical history, tier arrows, roster safety

- 👑 now requires the member to be tied at the top count AND have a training history exactly identical to the earliest top holder — Manos (first check-in Aug 4, a day late) is no longer crowned and sits 5th by reach order
- ▲/▼ indicators compare SCORE TIERS (dense rank of training counts) instead of unique places: kings who keep training together hold their tier and show no arrow (Maria stays clean on Aug 10), while a king who misses sessions drops a tier and shows ▼
- Roster safety: any member id found in check-in data but missing from the members list still appears on the leaderboard (shown by id) so check-ins like Christos's can never silently vanish

## 2026-08-23 — v1.10 (01:20) — Crown = everyone tied at the top

- The 👑 now belongs to EVERY member tied at the top training count on the selected date — leaderboard, chart labels and King bar all agree (Reynaldo, Δημοσθένης and Μαρία tied at the top all hold it)
- A member below the top count can never display a crown, regardless of past lineage (fixes Fransisco keeping a crown in 5th place on Aug 5)
- Hunt Log mechanics unchanged: matching the record = ⚔️ challenge, exceeding = 👑 steal, group extension after a challenge = 🛡️ defense

## 2026-08-23 — v1.09 (00:40) — Crown event fixes, per-period Hall of Kings, label ranking, countdown sync

- Chart: a 👑 marker now appears every time the number of kings is reduced (one co-king pulls ahead alone → «took the Throne alone» / «κράτησε μόνος του τον Θρόνο»), in markers, tooltips and Hunt Log
- Defenses: reign-scoped — any extension by the King group after ANY challenge of the current reign records a 🛡️ defense (fixes missing defenses, e.g. Aug 6)
- Crown sharing restored to identical-histories rule; the final king group only keeps members identical to the primary King and still tied at his record (fixes stale crowns like Fransisco's on 14/8)
- Hall of Kings: records are now computed PER PERIOD (crown/score reset each period) — Highest Score, Longest Reign, Most/Total Defenses no longer span periods; reign days are end-exclusive
- Removed «👑 Bounty» badge from the Bounty Leaderboard header
- Chart right-side names are ordered by leaderboard ranking (count desc, earlier reach first) within tied groups
- Countdown and Winners «days left» now use the same formula (exclusive period end + ceil) — both show the same number

## 2026-08-23 — v1.08 (23:55) — Crown group fixes, Hunt Log cleanup, winners countdown, input width

- Crown Bounty Leaderboard: the 👑 now marks every member of the reigning Crown group (not just place 1) — all tied throne holders are visible as of the selected date
- Crown logic: the reigning group = everyone tied at the top when the Crown is claimed; a rival matching the record issues ONE ⚔️ challenge per reign (no duplicate spam); the group extending during an active challenge records a 🛡️ defense (defenses now actually appear)
- Hall of Kings: reign days no longer double-count boundary days (transfer day belongs to the new King) — fixes inflated «Longest Reign» numbers
- Crown Bounty Winners: an ongoing period now shows only ⏳ days remaining instead of the current king's name
- Member Check-In: the ID input now spans the full width of the numpad (300px, aligned edge to edge)

## 2026-08-23 — v1.07 (23:10) — Bounty polish: belt bars, chart draw order, drop Crown Hold Time

- Removed the «Total Crown Hold Time» section (markup, renderer and i18n hooks)
- Bounty Leaderboard rows now show a belt-colored accent bar on the left of each member, using the admin-configured Belt Colors shades (like the member portal stat-card stripe); amber rank pill for a gamified look
- Chart: lines are drawn lowest-ranked first, so higher-ranked members' lines always render on top
- Mobile: tighter leaderboard rows, capped date-picker width, smaller rank pills under 768px

## 2026-08-23 — v1.06 (22:30) — Fix broken check-in portal chart

- Fixed the portal regression: the chart reads `App._kioskLeaderboardMembers`, which was only populated by the removed Training Leaderboard's render path — the chart card stayed hidden and took the whole Crown Bounty section with it
- `renderKioskLeaderboard` now populates the member list before its container check, so the chart renders without a leaderboard card

## 2026-08-23 — v1.05 (22:05) — Crown from day one, leaderboard reshuffle, alert rename

- Crown logic: the Crown is claimable from the very first workout — the end-of-day leader becomes King immediately; members with exactly identical training histories share the Crown (chart 👑 labels/markers, Hunt Log, King bar and Hall of Kings all follow)
- ▲/▼ movement in the Bounty Leaderboard now compares against the previous day — once a member holds their place, no arrow is shown
- Crown Bounty Leaderboard moved above the Hunt Log (still inside the Crown Bounty card)
- 1st place shows the 👑 emoji; removed the gold background from the top row
- Removed the general Training Leaderboard card from the check-in portal (chart still renders; renderKioskLeaderboard now tolerates the missing container)
- 🔥 alert renamed: «1 point left to challenge the Throne!» (EN/EL)

## 2026-08-23 — v1.04 (21:20) — Bounty Leaderboard: unique places, smoother slide, arrow fixes

- Strictly ONE member per place now — ties on score are always broken (who reached the count first → earliest first workout → name); no shared ranks, ever
- Smoother reorder animation: double requestAnimationFrame with an eased cubic-bezier slide and transition cleanup
- Date arrows hardened: they also use the picker's visible value as the base and ignore invalid dates
- Cache-busters bumped to 20260823-31 (previous deploy left some clients on a stale app-kiosk.js — the missing arrows/no-animation symptoms match that stale file)

## 2026-08-23 — v1.03 (20:45) — Bounty Leaderboard: date arrows, slide animation, correct places

- Added ‹ › arrows next to the leaderboard date picker to step day-by-day (clamped to period start / today)
- Rows now slide smoothly above/below each other (FLIP animation) when the standings reorder on date change
- Restored the correct leaderboard ranking: strict places — one person per place, tie on score broken by who reached it first, only members with identical training histories share a place (reverts the mistaken 1224 change)

## 2026-08-23 — v1.02 (20:15) — Bounty Leaderboard: in-card placement, date picker, 1-2-2-4 ranking

- Moved the «Crown Bounty Leaderboard» inside the Crown Bounty card, directly above the 🏆 Hall of Kings
- Removed belt colors from the leaderboard rows (neutral white cards; gold reserved for the Crown Holder)
- Strict standard competition ranking (1224): tied counts share a place and the next place skips (two 3rds → next is 5th)
- New date picker inside the leaderboard header: standings recompute for any date within the current period (min = period start, max = today), with ▲ green / ▼ red movement vs 7 days earlier (clamped to period start)
- Zero-workout members are excluded — a member appears only after their first workout of the period
- 💩 appears only on the very last active place; removed the old localStorage rank-snapshot logic (movement is now deterministic)

## 2026-08-23 — v1.01 (19:29) — Fix broken portal; separate Crown Bounty Leaderboard
- Fixed the broken check-in portal: the chart's period label referenced the i18n map before its declaration, crashing the whole render chain (empty chart, broken check-in)
- Reverted the general Training Leaderboard to its original logic (last 3 months, shared ranks)
- New separate «Crown Bounty Leaderboard» card: current-period standings with strict places (ties broken by who reached the score first; identical histories share a place), ▲ green / ▼ red movement since the last snapshot, and a gold card for the reigning Crown Holder

## 2026-08-23 — v1.00 (19:05) — Period leaderboard with places & rank movement
- Training Leaderboard now runs on the current bounty period with strict places: one member per place, ties broken by who reached the score first (first to claim a place keeps it until broken); only identical training histories share a place
- Rank movement: ▲ green when a member climbs, ▼ red when they drop, default belt-contrast when unchanged, 👑 gold for the Crown Holder (snapshot persisted per period in localStorage)
- Countdown text simplified: «⚔️ 69 days until the Crown Bounty ends! ⚔️»
- Hall of Kings: «Total Crown Defenses» card now always visible
- Chart header shows the displayed period («Period 3 · Jul 2026 – Oct 2026») or «All-time»

## 2026-08-23 — v0.99 (18:42) — Period-based Crown Bounty, countdown, winners fixes
- All Crown Hunt sections (chart, Hunt Log, Total Crown Hold Time, markers, king bar) now run on the current 4-month bounty period instead of the last 90 days; each new period starts fresh while past data lives on in the winners log
- Chart range buttons: «Current Period» and «All-time» (stale saved ranges fall back to Current Period)
- New countdown banner above the chart: «⚔️ Only N days until the Crown Bounty ends! 👑🔥» (EN/EL)
- Crown Bounty Winners fixed: future periods no longer listed as ongoing; newest 3 shown with the rest scrollable (newest first)
- Hall of Kings: added «Total Crown Defenses» all-time card

## 2026-08-23 — v0.98 (18:16) — Bounty periods, Hall tweaks, admin schedule toggle
- Hall of Kings: removed Most Crowns; Highest Score now shows «— N Trainings», Longest Reign «— N days»
- New «Crown Bounty Winners» log: 4-month periods (Nov–Feb, Mar–Jun, Jul–Oct); the Crown Holder on the final day of each period wins it; the running period is marked «ongoing»
- Admin → Member Settings → Check-in Portal: new toggle to hide the Training Schedule card on the check-in portal (persisted to settings)
- Removed the «Scan or enter your Member ID to check in.» prompt from the Member Check-In card (and its i18n updater)

## 2026-08-23 — v0.97 (17:43) — Hall of Kings, 1-point alert, mobile legend fix
- Mobile legend overlay is now viewport-fixed and centered (was anchored inside the scrollable canvas, so entries were cut off-screen)
- New 🏆 Hall of Kings card (all-time records): Highest Score, Longest Reign, Most Crowns, Most Crown Defenses (EN/EL)
- Hunt Log alert: 🔥 «Only 1 point from the Crown!» shown for members sitting exactly 1 training behind the current Crown Holder

## 2026-08-23 — v0.96 (16:19) — Mobile chart UX & Throne renames
- Mobile: the all-members hover tooltip no longer fires on touch-scroll (built-in tooltip is desktop-only); the bottom color/name legend is hidden and now appears as a compact overlay only when the user taps inside the chart
- Renamed «Proclaimed King Days» to «Total Crown Hold Time» (EN/EL)
- King bar stats renamed: Points → «Trainings / Προπονήσεις», Days on Throne → «Throne Streak / Σερί στο Θρόνο» (Crown Defenses already counted per current streak)

## 2026-08-23 — v0.95 (16:07) — Throne wording, range buttons simplified, training dots
- Wording: «challenged the King», «sat on the Throne» (first proclamation), «stole the Crown», «Current Crown Holder», «Days on Throne in the last 90 days» (EN/EL)
- Chart ranges reduced to «Last 90 days» and «All-time» (Custom and Last month removed); stale saved ranges fall back to 90 days
- Every training now shows a small dot on the member's line (first training keeps the bigger dot); datasets no longer clip to the chart area so bottom-axis dots render fully

## 2026-08-23 — v0.94 (15:46) — Crown Bounty rename, marker order, stable chart
- Renamed «Crown Hunt / Κυνηγητό Στέμματος» to «Crown Bounty / Λάφυρο του Στέμματος» (title, i18n, fallbacks)
- Takeover events now read «Stole the Crown / Άρπαξε το Στέμμα» instead of «became King» (first proclamation keeps «became King»)
- Stacked chart markers ordered bottom-up: ⚔️ challenge below, 🛡️ defense, 👑 crown always on top
- Fixed constant chart reloading: realtime visit pings (auto-checkout cron) no longer rebuild the chart — a data fingerprint skips the rebuild when nothing visible changed

## 2026-08-23 — v0.93 (15:16) — Crown Defense (🛡️) & Current King bar above the chart
- New 🛡️ Crown Defense event: when an active Challenger has tied the King's record and the King then retakes the lead (+1 or more), a defense is recorded; plain King extensions without an active challenger stay silent
- 🛡️ markers on the chart, entries in the Hunt Log («defended the Crown — Held off the challenge (Γιώργος) with 6 trainings») and marker tooltips, EN/EL
- New Current King bar above the chart: 👑 king name(s) plus Points, Days on Throne and total Crown Defenses for the current reign; updates dynamically with every render/language switch

## 2026-08-23 — v0.92 (14:42) — Hunt Log shows 5 entries, scroll for the rest
- Hunt Log list height now fits exactly 5 entries (measured per row) with vertical scrolling for older events

## 2026-08-23 — v0.91 (14:27) — Friendlier Crown Hunt chart date labels
- X-axis dates now render as short friendly labels («Aug 3» / «3 Αυγ») instead of raw ISO strings (2026-08-03), localized to the kiosk language
- Labels stay horizontal (no 45° tilt) with auto-skip; January ticks include the year
- Hover tooltip titles now show the full date («Aug 20, 2026»)

## 2026-08-23 — v0.90 (14:16) — Chart polish: marker headroom, horizontal scroll, group-aware event text
- Clipped top emoji fixed: chart top padding now reserves headroom for stacked ⚔️/👑 markers
- Crown Hunt chart is horizontally scrollable: canvas widens to 45px per day (All-time ranges scroll instead of squeezing); re-fits on window resize
- Challenges and takeovers now credit the whole reigning King group: «Μάνος challenged the Crown — Matched the record of Μαρία & Δημοσθένης: 5 trainings» (EN phrasing adjusted for multi-king names)

## 2026-08-23 — v0.89 (15:08) — Fix: co-kings with identical histories no longer trigger ⚔️/👑 against each other
- When Μαρία & Δημοσθένης (shared Crown since Aug 10) extended the record together on Aug 12, the engine emitted 👑 + ⚔️ as if they were rivals
- Members whose training history is identical to the current King's (same cumulative count on every date) are treated as co-kings: their extensions are silent, no challenge/takeover markers
- The initial proclamation event now lists all identical-history co-breakers («Μαρία & Δημοσθένης became King») in the Hunt Log and marker tooltip

## 2026-08-23 — v0.88 (14:52) — Fix: Crown events never fired when record was broken by co-breakers
- First-proclamation pass required a unique end-of-day leader, but real data often had two members breaking the record the same day (Μαρία & Δημοσθένης on Aug 10) so no King was ever proclaimed — chart markers and Hunt Log stayed empty
- Proclamation now uses timestamp tie-break among same-day co-breakers (earliest check-in takes the Crown), matching the existing resolveKings behavior

## 2026-08-23 — v0.87 (14:22) — Hunt Log & Crown Hunt chart event markers
- New single-source Crown event engine `App.getCrownEvents()`: replays every training increment chronologically; ⚔️ when a member reaches exactly the King's record, 👑 when someone exceeds it; King extensions stay silent; first King requires breaking away from a shared top with 4+ sessions (preserves opening-period suppression)
- Crown Hunt chart: every historical event drawn as an emoji marker anchored to the triggering member's exact data point (scale-based, resize/mobile-safe), vertical offsets prevent overlap
- Marker tooltips on hover/tap: «George challenged the Crown / Matched Manos' record of 6 trainings / August 23, 2026» style details, EN/EL
- New Hunt Log card under the chart listing all events newest-first from the same event objects (chart and log can never diverge)
- Old date-level crown drawing replaced by per-event markers; current-King indicator (👑 prefix on labels) unchanged
- i18n keys huntLog*/huntChallenge/huntNewKing/huntFirstKing/huntMatched/huntBroke (EN+EL); chart re-renders on language toggle

## 2026-08-23 — v0.86 (13:31) — Full-card belt colors on Training Leaderboard & Proclaimed King Days
- Removed the belt badge from member cards on the Training Leaderboard and Proclaimed King Days list
- Card backgrounds now use the member's belt color (custom shades apply); same contrast rules as check-in cards: White belt → black text (#000000), all other belts → white text (#FFFFFF)
- Rank pills and count badges keep their own light backgrounds for readability on any belt color

## 2026-08-23 — v0.85 (13:19) — Custom belt colors & full-color check-in cards
- New "Belt Colors" card in Admin → Member Settings: per-belt color picker + hex field (White/Blue/Purple/Brown/Black) with Save/Reset; shades persist to the `settings` table (`belt_colors` key) and localStorage fallback
- Saved shades drive belt styling app-wide via an injected style override on `.belt-box` / `.belt-badge` classes (`App.applyBeltColors()`, applied at boot, after settings load, and on save)
- Kiosk "Currently Inside" list: removed the separate belt badge from each member card; the whole card is now filled with the member's belt color
- Text contrast rules on kiosk cards: White belt → black text (#000000); all other belts → white text (#FFFFFF)
- Added `Utils.getBeltColor()` helper; new `DEFAULT_BELT_COLORS` constant in `app-core.js`

## 2026-08-23 — v0.84 (12:58) — Dotted last-name abbreviations on kiosk leaderboard
- Disambiguation names now end with a dot: the last name is kept only up to and including its first consonant («Νίκος Π.», «Γιώργος Ιωάν.»)
- Letters extend past the first consonant only when needed to stay unique between same-first-name members («Νίκος Παπ.» vs «Νίκος Παπα.»)

## 2026-08-23 — v0.83 (12:50) — First-name display on kiosk leaderboard & Crown Hunt
- Kiosk Training Leaderboard, Crown Hunt chart labels (right-side names, mobile legend, tooltips) and Proclaimed King Days list now show the member's first name only
- When two displayed members share a first name, just enough leading letters of the last name are appended to disambiguate («Νίκος Παπα» vs «Νίκος Παπ»); fully identical names fall back to the full last name
- Added shared `App.kioskDisplayNames()` helper in `app-kiosk.js`

## 2026-08-23 — v0.82 (01:43) — Timestamp-precise king resolution & suppressed initial crowns
- Integrated check-in event timestamps into `getCumulativeTrainingSeries` and `resolveKings`: on August 20, Μάνος checked in at 16:40 before Reynaldo at 16:43, ensuring only Μάνος is proclaimed king and receives king days
- Suppressed premature crowns on August 5 and 6: initial shared opening sessions (counts 1→3) do not generate crowns; the first king is proclaimed on August 10 when the record of 3 was broken to 4 (Μαρία & Δημοσθένης)

## 2026-08-23 — v0.81 (01:34) — Rename to Crown Hunt & unify Proclaimed King Days
- Renamed "Training Progress" to "Crown Hunt" («Κυνηγητό Στέμματος») with description: "There can be only one King, break his record to steal his crown!"
- Renamed "Crown History" to "Proclaimed King Days" («Ημέρες Ανακηρυγμένου Βασιλιά») with description: "Days as King in the last 90 days."
- Merged the chart and Proclaimed King Days list into a single unified card
- Removed emojis from the Proclaimed King Days leaderboard rank column
- Proclaimed king days now only begin counting once a king is officially proclaimed on a record-break (starting from August 10 in live data)

## 2026-08-23 — v0.80 (01:21) — Align Crown History strictly with chart king resolution
- Aligned `resolveKings` in Crown History to evaluate the full series date history, exactly matching the chart's crown assignment
- Ensures only 1 king exists at any given time (unless multiple members share the exact same training count on every single date)
- Prevents initial same-day check-in ties from falsely granting crown days to members who never actually owned the crown

## 2026-08-23 — v0.79 (01:18) — Fix Crown History day calculation
- Fixed Crown History day tracking so it strictly follows the gym's crown rules: the crown is held continuously by the record holder(s) until the record is strictly broken
- Ties during later dates do not steal or dilute the crown; the crown stays with whoever led first (`resolveKings`), matching the chart's 👑 logic
- Singular/plural support added for days count (day vs days / ημέρα vs ημέρες)

## 2026-08-23 — v0.78 (01:10) — Crown History leaderboard on kiosk
- Added a "Crown History" card below the Training Progress chart showing every member who has held the #1 crown and for how many days (always calculated over the last 90 days)
- Uses the same cumulative training logic as the chart; on tied days all co-leaders get credit
- Rank #1 gets a 👑 emoji; the rest are numbered
- Full i18n support (English + Greek) with translations in `applyKioskTranslations`
- Reuses existing `.kiosk-lb-card` layout for consistent styling

## 2026-08-21 — v0.77 (02:10) — Chart crown on any king change, not just record extension
- A crown is now drawn above a date whenever the set of record-holders changes (a new king enters or a previous co-holder is dethroned), not only when a brand-new member breaks the record
- This restores the missing 2026-08-10 crown (9018/19961998 took the lead from 6157) while still suppressing 2026-08-12 (the same two kings merely extended 4→5)

## 2026-08-21 — v0.76 (02:00) — Chart crown only when a NEW king appears
- In-chart crowns no longer appear when the same king(s) merely extend their own record (e.g. 2026-08-12, where the co-leaders who already held the record went 4→5)
- A crown is drawn only when a member who was NOT holding the record before breaks the previous max — a genuinely new king/kings

## 2026-08-21 — v0.75 (01:50) — King above tied names; crowns on record-break dates
- In the right-side name section, when the king shares the same final training count with another member, his name is now placed above the tied member(s)
- Crown emojis are drawn inside the chart above the date whenever an existing record is broken (a new king/kings takes the top); the very first record is not crowned since there is no prior king to steal from

## 2026-08-21 — v0.74 (01:40) — Single king crown, first-training dots, direct session connectors
- The crown is now a single "king" badge shown next to the current record-holder's name (right labels on PC, legend on mobile). The record must be strictly broken for someone to steal it; when two members tie at the top with different histories, the crown stays with whoever led longest (reached the top first). It is shared only by members with exactly the same training history
- A visible dot is drawn at the bottom of the chart on each member's very first training of the period (their cumulative count always starts at 1)
- Line rendering changed: sessions are connected directly (straight connectors), so the line is parallel to the x-axis only after a member's last training, extending flat to the far right — no more flat plateaus between every session

## 2026-08-21 — v0.73 (01:30) — Chart: real overtakes only, straight lines, y from 1, dynamic height
- Crowns now appear only on a genuine overtake: a member who was already active and behind the leader newly enters the leadership group (verified: no crown on 2026-08-10, where the co-leaders merely extended their own record)
- Lines are now straight (tension 0) instead of curved between points
- Y-axis starts at 1 at the very bottom (no 0 tick)
- Chart height is dynamic: scales with member count (series.length × 30 + padding) so all athletes fit comfortably even at 50, with top/bottom padding reserved for staggered names and crowns so the top ones are no longer clipped

## 2026-08-21 — v0.72 (01:20) — Chart polish: lines from first training, no 0 tick, staggered labels, working crowns, no dots
- Member lines now only start at their first training (no flat 0 line before it); the y-axis no longer shows the 0 tick
- Right-side names for members tied on the same final count are staggered vertically so they no longer stack on top of one another
- Crowns now appear whenever a member sets a new all-time high cumulative count (previous rule required a strict leader change, which never fired because the leader is usually tied); verified against live data
- Hidden the line dots (points only show on hover), reducing visual clutter

## 2026-08-21 — v0.71 (01:10) — Training Progress chart: full lines, right labels, all-athlete tooltips, crowns
- Each member line now runs the full timeline (cumulative count carried forward, flat from their last training to the far right)
- On PC (≥768px) each athlete's name is drawn at the far right aligned to their line's final value; the bottom legend is used on mobile only
- Hovering any date now shows ALL athletes in the tooltip (with their cumulative count at that date), not just those who trained that day
- A 👑 crown is drawn on the date a member overtakes the current leader (strict leader change with a higher count)

## 2026-08-21 — v0.70 (01:00) — Training Progress line chart on Check-in Portal
- Added a "Training Progress" multi-line chart below the Training Leaderboard showing each member's cumulative training count over time (class check-ins + open-gym visits, mirroring the leaderboard count)
- Timeframe pills: Last 3 months (default), Last month, All-time, and a Custom date range; persisted per device (kiosk_chart_range)
- Deterministic per-member colors (stable hash → distinct palette), hover tooltips show member name, exact date, and cumulative count
- Uses Chart.js 4.4.3 UMD from CDN (guarded: chart hides gracefully if the library or data is unavailable, leaving the rest of the kiosk untouched)
- i18n: new `chart*` keys (EN+EL) applied via applyKioskTranslations

## 2026-08-21 — v0.69 (00:50) — Fix "Last" medal only on the final rank
- The "Last" leaderboard emoji (default 💩) was applied to every member past the highest configured place; it now only shows on the last displayed rank (all members tied at that rank), with everyone else falling back to their rank number

## 2026-08-21 — v0.68 (00:45) — Infinite leaderboard + dynamic medal places
- Leaderboard Size accepts 0 = show everyone on the Training Leaderboard (badge shows "Everyone" / "Όλοι")
- Leaderboard Medals are now dynamic: admin can add/remove extra places (each with its own emoji) plus a "Last" row that covers every rank past the highest configured place (default 💩)
- Removed the redundant emoji preview column to the right of the medal inputs (the emojis are already inside the boxes)
- i18n: new `leaderboardAllBadge` key (EN+EL)

## 2026-08-21 — v0.67 (00:30) — Configurable Training Leaderboard size
- Admin can now choose how many members the public Training Leaderboard shows (default 10) via a new "Leaderboard Size" card in Member Settings
- The kiosk leaderboard renders the top N (still keeping same-rank ties), the badge shows "Top N", and the value syncs to Supabase settings + localStorage like the other member settings

## 2026-08-20 — v0.66 (01:10) — Open-gym visits count in Total Trainings & Hours
- `getMemberTrainingCount` now also counts open-gym visits (a visit with no class check-in) as one training each, so Total Trainings and the averages match the Total Hours Trained behaviour
- `getMemberLeaderboardCount` now delegates to `getMemberTrainingCount` (identical semantics: class sessions + open-gym visits) — leaderboard ranking is unchanged
- `getMemberTotalHours` now also adds entry→exit duration for open-gym visits when the member has class check-ins (previously those open-gym minutes were only counted in the no-class-checkins fallback), keeping Total Hours aligned with Total Trainings

## 2026-08-21 — v0.65 (00:16) — Don't show "still inside" for expired visit windows
- Added `App.getVisitEffectiveExit` (returns `exit_time`, or `expected_exit_time` if that window has passed, else null) and applied it in Day Details, the Visit Log, and `calcVisitDuration`
- A check-in whose expected window (class end + 15 min) has passed but that the auto-checkout cron hasn't closed no longer shows "still inside"/"In Progress" — it shows the expected checkout time and a real duration
- Keeps the +15 min buffer (reverted the earlier checkout-time change); this is purely a display robustness fix that doesn't depend on pg_cron

## 2026-08-20 — v0.67 (23:55) — Deleting a payment now reverts its visits to Unpaid
- The 000009 recompute preservation (keep "paid: covered (no payment record)" visits paid) also prevented deleting a session/time payment from re-marking its visits unpaid, because recompute can't tell a no-record visit from one paid solely by a session payment.
- New migration `20260820000010_fix_delete_payment_unpay.sql` (create-or-replace `delete_payment`): it now explicitly un-pays the visits the deleted payment covered (time-window visits, or the first N session-quota visits) before recompute, so those visits are no longer "currently paid" and are not preserved. recompute then re-covers any still covered by remaining payments, and genuine no-record visits (not covered by the deleted payment) stay preserved.

## 2026-08-20 — v0.66 (23:46) — Fix payment recompute inverting "covered (no payment record)" check-ins
- Root cause: `recompute_member`'s full reset (`update visits set is_unpaid = (paid_override is distinct from 'paid')`) wiped the paid status of any visit that is paid but has no covering payment record and no `paid_override` ("paid: covered (no payment record)"). With no ledger backing to re-derive from, adding a new payment (e.g. a drop-in session) then left that previously-paid check-in Unpaid while the new session got consumed by another visit — statuses inverted.
- New migration `20260820000009_fix_recompute_preserve_covered.sql` (create-or-replace `recompute_member`): the reset now preserves currently-paid visits that have no manual override and are not attributable to a covering time-payment window. Time/membership-covered visits are still reset and re-derived, so deleting a payment still re-marks its visits unpaid.

## 2026-08-20 — v0.64 (19:06) — Member portal: unpaid spacing + class shown in history
- Added spacing below the Unpaid Training Sessions description (was cramped against the table)
- Added a Class column to the member's "Unpaid Training Sessions" and "My Personal Calendar & Check-in History" tables, showing the attended class (e.g. Fundamentals) via `buildVisitClassTags`; open-gym/no-class rows show "—"
- New i18n keys `memberUnpaidClassHeader` and `memberViewHistoryClass` (EN+EL)

## 2026-08-20 — v0.63 (18:50) — Member attendance: not-attending classes + per-row emoji
- Classes the member hasn't attended in the window now show "Not attending" (i18n `memberViewNotAttending`) instead of 0%, and are excluded from the Overall % so they don't lower it; the per-person available window already starts at the member's first check-in in the last 90 days
- Restored the gamified per-class emoji in the member attendance rows (`att-class-emoji`)

## 2026-08-20 — v0.62 (18:36) — Schedule: hide empty days + activation-date visibility
- Training Schedule now hides any day with no public classes that week (previously only Sat/Sun were hidden), and the remaining day columns stretch to fill the full width via the existing `--days-count` grid
- A class is now shown in the schedule only from its activation date (`availableFrom`) onward, so a class activated this week no longer appears in earlier weeks' views

## 2026-08-20 — v0.61 (18:27) — Training Schedule shows real week dates + syncs cancellations
- The Training Schedule calendar (kiosk + admin master) now displays the actual dates of the current week under each day (e.g. "Monday 12 Aug") instead of bare day names, via `getWeekDates` (Monday-first)
- Added prev/next week navigation (`scheduleWeekNav`) and a week-range label in both the kiosk card header and the admin master calendar
- Classes cancelled through the Check-in Activity Calendar (a `cancelled` `schedule_overrides` row for that date) now render greyed-out with a strikethrough and "Cancelled" badge in that week's column, and the `📅` count reflects non-cancelled sessions
- Fully backward compatible: no DB schema change; reuses the existing `schedule_overrides` table (requires the `cancelled` column). If no overrides exist the calendar shows the normal weekly template with dates

## 2026-08-20 — v0.65 (01:00) — Fix "not started" check comparing against invalid time string
- The "don't count classes that haven't started" filter was silently disabled: `slot.start` is stored as `"19:30:00"` (with seconds), so `new Date(day + 'T' + slot.start + ':00')` produced an invalid `"…T19:30:00:00"` string and the comparison was skipped
- Today's not-yet-started session (e.g. the 19:30 Fundamentals on the current day) was therefore still counted, inflating the Attendance Statistics denominator (e.g. 11 instead of 10)
- `buildAvailableTrainings` now parses the slot's hour/minute via `split(':')` instead of concatenating the raw seconds-bearing string

## 2026-08-20 — v0.64 (01:00) — Fix replaced class double-counted in Attendance Statistics
- A class instance replaced via Day Details (one-off override to another class) was counted twice in the Attendance Statistics denominator: once under the original class's slot (resolved to the replacement) and again under the replacement class's own scheduled slot that same date
- `buildAvailableTrainings` now dedupes sessions by effective `date|classId`, so a replaced instance counts as one session (and matches the attended-side keying already used by `getMemberAttendance`)

## 2026-08-20 — v0.63 (00:50) — Rename Attendance %, skip not-yet-started sessions
- Renamed the admin member modal's "Attendance %" section to "Attendance Statistics" (and the matching Activation Date helper text)
- Attendance Statistics no longer counts today's class sessions whose start time hasn't arrived yet — only classes that have already begun (or are on past days) count toward the denominator

## 2026-08-20 — v0.62 (00:40) — Fix payment history loss risk from sync diff-delete
- Fixed a data-loss bug where a payment/notification history could be wiped from Supabase: the sync layer's diff (`persist`) would hard-delete rows that exist in the in-memory mirror but are missing from `STATE`. When the sensitive collections (`payments`, `notifications`) were emptied client-side (non-admin boot / admin lock via `clearSensitiveData`) while a stale mirror remained, a subsequent admin flush would permanently delete every row from the DB.
- Payments are now upsert-only in `flush()` — they can only be removed through the `delete_payment` RPC (followed by a reload), never by the sync diff.
- `clearSensitiveData()` and the non-admin boot path now also clear the `payments`/`notifications` sync mirrors and reset their ready flags, so a later flush can't treat the wiped state as a deletion.
- This is a safety fix; it does not change how payments are stored or displayed.

## 2026-08-20 — v0.61 (00:32) — Custom attendance feedback ranges with emojis
- Member Settings → Attendance Feedback now lets the admin add/remove custom statistic ranges (threshold %, emoji, and color per range) instead of a fixed tier list
- Each range has an editable threshold, a color picker, and an emoji input; removed the redundant hex code text field (the color picker covers it)
- Added an "+ Add Range" button and a per-range "Remove" action (at least one range is always required)
- The chosen emoji now displays next to the member's attendance percentage on the member dashboard
- Attendance storage migrated from legacy `attendance_emojis`/`attendance_colors` maps to a single ordered `attendance_ranges` setting (old values auto-migrate)

## 2026-08-20 — v0.60 (00:21) — Open-gym counted on leaderboard only; fix override persistence
- `getMemberTrainingCount` now counts only actual class sessions (Total Trainings / member stats) — open-gym visits (no class selected) are excluded from attendance statistics
- Added `getMemberLeaderboardCount` (class sessions + open-gym visits) and switched the leaderboard to use it, so open-gym check-ins count toward ranking but not toward Total Trainings
- NOTE: the one-off override persistence requires the `cancelled` column in `schedule_overrides` — if the table was created from the chat SQL (which lacked it), apply: `alter table public.schedule_overrides add column if not exists cancelled boolean not null default false;`

## 2026-08-19 — v0.59 (23:31) — One-off class instance overrides + explicit activation date
- Day Details Edit is now date-specific: a new `schedule_overrides` table + `modal-day-override` lets an admin replace that date's class instance with another existing class, or set a custom name/details for that date only — the recurring weekly schedule is untouched
- When replacing with another class, that date's check-ins are re-pointed to the replacement class (per the chosen attribution); clearing/replacing updates attendance and Day Details accordingly
- Day Details Delete now cancels just that date's instance (a `cancelled` one-off override, shown as a strikethrough "Cancelled" section with a Restore action), keeping the recurring class and all check-ins
- Attendance % and Day Details honor overrides via `resolveInstance`; cancelled/replaced/hidden instances are excluded from the attendance denominator
- Added an explicit **Activation Date** field to the class editor (`available_from`); it defaults to today for new classes, is editable, and is auto-set to today when a class is reactivated (hidden → visible) so past dates are not retroactively counted
- New migration `20260819000007_schedule_overrides.sql` must be applied to Supabase

## 2026-08-19 — v0.58 (23:06) — Day Details: edit/delete the class (not individual members)
- Moved the Edit / Delete actions in Day Details from the per-member rows to the class section header, per the request to edit/delete the class itself directly from Day Details
- Edit opens the existing Schedule editor for that class (`editClassFromDayDetail` → navigate + `editScheduleClass`)
- Delete soft-deletes the class (moves to bin, keeps all existing check-ins) and refreshes the open Day Details view (`deleteClassFromDayDetail`)
- Member rows now show only the member (name, belt, time) and paid/unpaid badge

## 2026-08-19 — v0.57 (22:54) — Day Details: active-class filter, per-session edit/delete, spacing fix
- Added `App.getActiveSchedules()` (schedules where `isPublic !== false`); `buildAvailableTrainings` now uses it so hidden/inactive classes are excluded from the attendance % denominator (training stats) — hidden classes the member attended no longer count toward their %
- Day Details now builds class sections only from active/visible classes; check-ins whose class is hidden or deleted group under "Inactive / Removed classes" (time-only), preserving full history
- Day Details rows now have Edit + Delete buttons per check-in: Edit opens the existing Visit Edit modal (and the Day Details view re-renders after save); Delete removes the visit + its class check-ins and reconciles the member, then refreshes Day Details
- Refactored Day Details rendering into `renderAnalyticalDayContent` so edits/deletes refresh in place without re-pushing the modal onto the stack
- Fixed awkward spacing when a section shows "No check-ins": compact `.analytical-day-empty` state and tightened section margins

## 2026-08-19 — v0.56 (22:45) — Analytical calendar day-detail modal
- Clicking a day in the Check-in Activity Calendar now opens a "Day Details" modal (`modal-analytical-day` / `App.openAnalyticalDay`) instead of jumping straight to the Visit Log
- The modal groups the day's check-ins into subsections: one per scheduled class (name, color dot, member count), a "Removed classes" section for check-ins whose class was deleted (time-only rows), and an "Open Gym / No class" section
- Each row shows the member (name + belt), their check-in/out time (or "Inside"), and a Paid/Unpaid badge; deleted-member names still resolve via the recycle bin
- A "View in Visit Log" button filters the Check-in Log to that date (`analyticalDayOpenLog` → existing `filterVisitsByDate`)

## 2026-08-19 — v0.55 (22:30) — Deleted-class check-ins fall back to time-only display
- `buildVisitClassTags` now skips check-ins whose class no longer exists in the schedule, so Visit History and the kiosk "Currently Inside" list fall back to the raw entry/exit time (open-gym style) instead of a generic "Class" label
- Class check-in rows themselves are untouched (they have no FK to `schedules`, so deleting a class never deletes its check-ins); restoring a class from the bin re-resolves its tags automatically

## 2026-08-19 — v0.54 (22:18) — Assign classes to an existing check-in from Visit History
- Visit Edit modal now includes a multi-select class picker (`renderVisitClassPicker`), listing the classes scheduled on the visit's entry date with the visit's current classes pre-checked
- Saving replaces the visit's `class_checkins` with the selected classes (unchecking all clears the assignment → open gym), updates `visit.classIds`, and recomputes `expectedExitTime` from the new classes when the visit is still open
- Changing the entry date re-renders the picker for the new date (`onVisitEntryChange`); the picker reuses the existing slot-id normalization and the shared `.visit-class-option` styles
- Only the client record is edited here (same `DB.saveVisits` / `DB.saveClassCheckins` path as the rest of the editor) — this does not invoke the `check_in_member` RPC

## 2026-08-19 — v0.53 (22:07) — Live-sync class check-ins to Visit History & other views
- Root cause: realtime only subscribed to `visits` and `notifications`, so a check-in performed on a different device (QR / mobile / kiosk) left the admin's `class_checkins` cache stale — Visit History showed the entry time instead of the chosen class ("Fundamentals") until a full reload/`loadAll`
- Added a realtime subscription on the `class_checkins` table (`refreshClassCheckins`) for all clients, so new/edited class check-ins appear immediately in Visit History, the kiosk "Currently Inside" tags, and the calendar
- `refreshClassCheckins` mirrors `refreshVisits` (diffs against the canonical mirror, respects the flush guard, then re-renders via `scheduleAfterCloudSyncRender`)
- Auto-checkout itself is unchanged: the pg_cron `auto-checkout-visits` job (every minute) closes a visit at its `expected_exit_time` (class end + 15 min), so members are not "instantly" checked out by design

## 2026-08-17 — v0.52 (02:06) — Fix Dashboard Check-in Log date boundaries, attribution, validations, and sync
- Date filters in Check-in Log (`renderVisitLog`) now use `Utils.dayStart` and `Utils.dayEnd` to parse local day boundaries without UTC midnight timezone offset shifts
- Soft-deleted members in Recycle Bin (`DB.getBin()`) are now checked in `getVisitPaidByInfo` so paid historical visits correctly attribute to their plans
- Pre-filtered orphan visits in `renderVisitLog` so "Filtered Total" and "Unpaid Hits" cards precisely match the rendered table row count
- Guarded `parseFloat(pay.amount || 0).toFixed(2)` in `renderVisitLog` against missing amounts
- Added chronologically invalid exit time validation in `saveVisitEdit` (`exitTime < entryTime`)
- Editing active visits (`exitTime === null`) in `saveVisitEdit` now recomputes `expectedExitTime` to prevent dropping from live present list
- `saveVisitEdit` now triggers live view updates (`renderLivePresent`, `renderKioskLeaderboard`, `renderAdminDashboard`)
- `switchTab('dashboard', 'log')` now auto-refreshes `renderVisitLog`
- `exportMonthlyExcel` now includes Recycle Bin members and exports UTF-8 BOM blob CSV for Excel compatibility
- Bumped `version.txt` and `index.html` cache-busters for `app-admin.js` and `app-ui.js`

## 2026-08-15 — v0.51 (12:50) — Remove emojis from Training Stats (admin + member portal)
- Removed all emoji icons from the Training Stats stat cards (Total Trainings, Total Hours, averages, Leaderboard Rank) in both the member portal and the admin member modal — these share `getMemberStatsHTML`, so one change covers both. The stat cards now show just the label + value (rank color accent retained)
- Removed the attendance feedback emojis (overall %, per-class %, and the 🏅/🔥 Best Class / Streak highlight icons) from the member portal attendance section
- Admin member modal attendance: removed the emoji from the Overall line and the emoji column from the per-class grid
- Admin "Attendance Feedback" editor now edits only the percentage colors (emoji inputs and preview removed); card text updated accordingly. The stored `attendanceEmojis` setting is left in place for backup compatibility but is no longer displayed
- Removed now-unused CSS rules (`.stat-icon`, `.att-emoji`, `.att-class-emoji`, `.att-highlight-icon`)
- Bumped `version.txt` and the `styles.css`/`app-member-portal.js`/`app-admin.js` cache-busters

## 2026-08-15 — v0.50 (12:35) — Top member card titled "Member Info"
- The top info card on the member dashboard now has a "Member Info" heading (EN `Member Info` / EL `Στοιχεία Μέλους`) above the Current Belt / Member ID / Account Status / Expiration Date / Sessions Left lines
- New i18n key `memberViewMemberInfo` (EN+EL) applied in `applyKioskTranslations`
- Bumped `version.txt` and the `app-member-portal.js`/`app-i18n.js` cache-busters

## 2026-08-15 — v0.49 (12:20) — Move Sessions Left out of Training Stats into the info card
- The "Sessions Left" progress bar no longer renders as a stat card inside the Training Stats grid. Session-based members now see it as a dedicated info line (with a progress bar) right below Expiration Date in the top info card, matching the Current Belt / Member ID / Account Status / Expiration Date layout
- Removed the redundant "Sessions Left: N" text appended to the Account Status line (the dedicated line replaces it)
- Bumped `version.txt` and the `app-member-portal.js` cache-buster

## 2026-08-15 — v0.48 (12:05) — Member attendance: skip 0% "best class"; neutral color below 50%
- The "Best Class" highlight no longer appears when the top class is 0% (or any score below the 50% feedback threshold) — a 0% "best class" was misleading
- Attendance percentages below 50% now render in the default (black) text color instead of the primary blue that the `attendanceColor()` fallback injected; the overall and per-class progress bars use a neutral gray fill below 50% instead of blue
- Bumped `version.txt` and the `app-member-portal.js` cache-buster

## 2026-08-15 — v0.47 (11:50) — Member portal: session progress, attendance highlights, expiry banner
- Session-based members now get a "Sessions Left" stat card with a progress bar showing the remaining bundle (granted total from the payment ledger), color-coded green/amber/red by how many are left — instead of just a bare number in the status line
- Member attendance now surfaces a "Best Class" highlight (the member's highest-%. class) and a consecutive-week training streak (🔥 N-week streak) above the per-class list; both EN+EL, hidden when there's no data
- Added an expiration countdown banner shown when a valid membership has ≤7 days left ("⏳ Your membership expires in N days …"), separate from the red expired status line
- New i18n keys `memberViewBestClass`, `memberViewStreak`, `memberViewStreakWeek(s)`, `memberExpiryBanner` (EN+EL); new `.member-attendance-highlights`/`.att-highlight` styles
- Bumped `version.txt` and the `styles.css`/`app-member-portal.js`/`app-i18n.js` cache-busters

## 2026-08-15 — v0.46 (11:30) — Member portal settings & spacing
- Merged the member portal's two separate cards — "Change Member ID" and "Hide From Leaderboard" — into a single unified "Settings" card (EN+EL), with the leaderboard toggle on top and the ID change below, separated by a divider
- Fixed excessive vertical spacing between member portal sections: `.main-content` already spaces its flex children with `gap: 1.5rem`, but every card also carried `mb-2` (1rem), making gaps ~2.5rem. Removed the redundant bottom margins from the member view cards and topbar so sections sit closer together
- The member dashboard now shows the member's own ID (new `memberViewMemberId` i18n key) so members always know the ID they use to check in
- `changeMemberId` in the member portal now also rewrites the local payments and notifications `memberId`s (matching the admin form fix from v0.43), so the ledger/notifications update immediately
- Bumped `version.txt` and the `app-member-portal.js`/`app-i18n.js` cache-busters

## 2026-08-15 — v0.45 (11:05) — Member form auto-log payment now uses the server RPC
- The member form's automatic payment log (`saveMember` with a plan + payment) previously wrote the payment through the client-side ledger and reconciled visits with the legacy client-side engine — a second source of truth that could drift from the server's `recompute_member`. It now calls the same server-side `apply_payment` RPC the payment modal uses, after flushing the member row so the FK/recompute see it, then reloads payments/members/visits.
- `prevExpiration` on the auto-log now records the member's actual prior expiration instead of an empty string.
- No-payment member saves keep their client-side Inactive enforcement (an edited member with no coverage and no new plan still lapses); the paid-plan path relies on the server recompute, which already sets `account_status`.
- Bumped `version.txt` and the `app-members.js` cache-buster.

## 2026-08-15 — v0.44 (10:45) — Payments & Payment Ledger fixes
- Editing a payment no longer resets the Quantity to 1, which silently halved session bundles (a 2x8-session purchase was re-saved as 8) and wiped `sessionsGranted` on custom payments with no plan. The quantity is restored from the payment's `sessionsGranted`, and saving preserves the existing grant when the form derives none
- New "Sessions" field in the payment modal: auto-fills from the selected plan × quantity, and overrides the derived grant when typed manually (custom drop-in bundles); pre-filled when editing an existing session payment
- Payment modal: switching from a time-based plan to a session plan no longer leaves a stale expiration date in the field (which got saved and gave the member an expiration from a session purchase)
- Payment Ledger "New Exp. Date" column now shows each payment's own `appliedExpiration` instead of the member's current expiration date (which repeated the same value across all rows and reflected the latest recompute, not that payment)
- Member modal payment history gained a "Coverage" column showing each payment's expiration window or granted sessions
- Fixed a timezone divergence between the client-side reconciliation/ledger attribution and the server recompute: date-only strings were parsed as UTC midnight, mis-classifying visits near midnight as unpaid/paid. New `Utils.dayStart`/`Utils.dayEnd` parse date-only strings as local day boundaries, applied across `reconcileMemberPaymentVisitStatus`, `computeMemberFirstUnpaidDay`, and `getVisitPaidByInfo`
- Bumped `version.txt` and the `app-core.js`/`app-payments.js`/`app-admin.js` cache-busters

## 2026-08-15 — v0.43 (10:15) — Member Directory & Edit Profile bug fixes
- Edit modal: the Expiration field no longer shows a red "expired" background for members who simply have no expiration date (session-based / never had a plan) — red only shows when an actual date is in the past
- Edit modal: belt stripes (e.g. "Purple/2") are now preserved when saving an unchanged base belt instead of being silently truncated to the plain belt; changing the base belt still resets to the plain belt
- Mass Freeze now freezes every Active member with usable coverage — session-based members (previously skipped by the date-only check) are included, and members with no usable coverage are left alone
- Mass Unfreeze no longer resurrects a stale "Active" status for members whose coverage lapsed while frozen — they lapse to Inactive
- Mobile member cards now respect the column configurator: the status badge only renders when the status column is enabled (matching the desktop table), and the "Sessions" chip now shows just the remaining count (was rendering `X/0` because `sessionsTotal` is a boolean)
- The Member Directory "Cancelled" tab now only lists members whose displayed status is actually Cancelled, mirroring the badge priority — an Expired/Inactive/No-Sessions member who is also 90-day-inactive no longer appears there
- Renaming a member (ID change) now also rewrites the local payments and notifications `memberId`s, so the ledger/notifications render immediately instead of after a reload
- Applying a plan in the member form now stacks purchased sessions onto the remaining balance (renewal of an 8-session bundle with 4 left shows 12) and restoring the plan dropdown to "Custom/No Plan" restores the member's original expiration and session balance instead of leaving the form half-cleared; switching to a session plan no longer silently wipes a time-based expiration
- Bumped `version.txt` and the `app-members.js` cache-buster

## 2026-08-15 — v0.42 (09:45) — No red alert styling for Inactive/Cancelled members
- Member directory row/card red alert styling only applied to members who were still `Active` with a lapsed expiration date. After v0.41 made lapsed members lapse to `Inactive`, Inactive (and Cancelled) members kept the red background purely because their `expirationDate` was in the past, even though the status badge already read Inactive/Cancelled. Red now only shows for genuinely expired-but-still-active members (`app-members.js`).
- Bumped `version.txt` and the `app-members.js` cache-buster.

## 2026-08-15 — v0.41 (09:30) — Expired members lapse to Inactive; fix UTC-date coverage bug
- Root cause of "Expired member checked in and was marked OK / paid with no payment record": `check_in_member` decided coverage with the server's UTC `current_date`, but all client badges use the Athens (Europe/Athens, UTC+3) date. For up to 3 hours after Athens midnight, a lapsed membership was still "covered" server-side, so the visit was written `is_unpaid=false` even though the member had no sessions and no covering payment. `check_in_member` now compares `expiration_date >= (now() at time zone 'Europe/Athens')::date`, matching the client.
- "Expired" was only a UI label derived from `expirationDate` — no stored status ever flipped to `inactive`, so the account stayed `active`/stale forever. Now: `check_in_member` sets `account_status='inactive'` on an uncovered (unpaid) check-in, and a new nightly cron job (`expire-members-inactive`) sweeps Active members whose time-based membership lapsed with no sessions left.
- `recompute_member` now uses the Athens date for coverage/status decisions too, so recompute and live check-in agree with the client's badges.
- New migration `20260813000006_expired_members_inactive.sql` (create-or-replace RPCs + cron + one-time ledger backfill for already-lapsed members with payment records). `migration/apply-remote.js` now applies every migration in `supabase/migrations/` in order instead of just the first two — run `SUPABASE_ACCESS_TOKEN=… node migration/apply-remote.js` to deploy.


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
