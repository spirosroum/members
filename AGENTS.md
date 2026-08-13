# AGENTS.md — GymDesk (Sloth Submission Grappling)

## Architecture

This is a **single-page static web app** with no build step, no bundler, no CI. Hosted on **GitHub Pages** (`spirosroum.github.io/members`, custom domain `members.ssgbjj.gr`). Three view containers in `index.html` (kiosk, admin, member) are toggled via CSS `hidden`. **Supabase (PostgreSQL)** is the backend/database; the client is **online-first** (no offline queue — localStorage is only a last-known-state cache). All JS is loaded via `<script>` tags — **load order is critical** (see below). `@supabase/supabase-js` v2 is loaded from CDN (UMD, exposes `window.supabase`).

```
index.html
├── styles.css
├── @supabase/supabase-js@2 (CDN)   ← window.supabase
├── qrcode.min.js (CDN)
├── js/app-core.js     ← Supabase client, STATE, DB, Sync adapter, Utils, global App, auth, boot init
├── js/app-ui.js       ← modals, navigation, color palettes, sidebar, admin login UI
├── js/app-kiosk.js    ← public kiosk check-in, leaderboard, numpad, live present list
├── js/app-member-portal.js    ← member dashboard, self-service (Google sign-in deferred)
├── js/app-checkin-admin.js    ← staff check-in, broadcast notice, QR code
├── js/app-mobile-checkin.js   ← mobile self-check-in flow
├── js/app-members.js   ← member directory, exports, freeze/unfreeze, member modal
├── js/app-plans.js     ← membership plans, public plans/classes, closed dates
├── js/app-schedule.js  ← class schedules, draft slots, calendar view
├── js/app-payments.js  ← payment ledger, payment modal (calls apply_payment/delete_payment RPCs)
├── js/app-admin.js     ← dashboard, analytical calendar, visit log, settings
└── js/app-i18n.js      ← Greek/English kiosk translations, window.onload boot hook (MUST BE LAST)
```

**Every JS file** uses `Object.assign(App, { /* methods */ })` — all methods live on the global `App` object. There are no ES modules. If a file is loaded before the methods it depends on, the app silently breaks.

## AI Agent Rules (READ FIRST)

### Before making any change
- **Read `HISTORY.md` only if needed** — it is a changelog, not required reading. Check it only when the change touches recently-modified code or you need a feature's history; otherwise skip it (`git log` covers recent changes). Older entries live in `HISTORY-ARCHIVE.md`.
- **Locate code with grep, then read narrowly** — grep all JS files and `index.html` for the symbol/method first, then Read only the surrounding block (~40 lines). Do not read entire files. Note that the same method can be defined in multiple files via `Object.assign`.
- **Minimal edits:** change only what is necessary. Do not refactor unrelated code. Do not add comments.

### On every commit/push
- **Update `HISTORY.md`** — append a new entry at the top with today's date, a short version name (e.g. `0.1`), the current time (HH:MM), a one-line summary, and a bullet list of what changed. Header format: `## YYYY-MM-DD — v0.1 (HH:MM) — Short summary`. Bump the version name on each change (minor bump per change: `0.1` → `0.2`). For a major update, suggest bumping the major version and flag it to the user. When `HISTORY.md` grows past ~15 entries, move the older entries to the top of `HISTORY-ARCHIVE.md`.
- **Write a descriptive commit message** — summarize what changed and why. Keep it under 72 chars for the subject line.
- **After committing, auto-push to `main`** on `https://github.com/spirosroum/members.git` (GitHub Pages deploys from `main`, not `master`). If git push fails, tell the user which files changed so they can upload manually.

### After deployment (schema changes only)
- Supabase schema lives in `supabase/migrations/*.sql`. Apply a new migration via the SQL editor, the Supabase CLI (`supabase db push`), or `node migration/apply-remote.js` with a Personal Access Token. **Never edit the live DB without also updating the migration files.**

## Deployment

- **There is no dev server, no npm, no build.** Open `index.html` directly in a browser (or use `python3 -m http.server 3000` for local testing). The `migration/` dir has its own `package.json` for the one-off ETL scripts only.
- **Production:** GitHub Pages serves the `main` branch. Deploy by pushing to `main`. When git push is not available, the user manually uploads changed files. The version guard in `index.html` reads `version.txt` and auto-reloads stale clients — bump `version.txt` AND the `?v=` cache-busters on every deploy.
- **No lint, no typecheck, no tests.** There is no tooling.

## Supabase & Auth

- **Project URL:** `https://lwmwihdfwafnhtykslbz.supabase.co`. Client config (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) is at the top of `js/app-core.js`. The **service-role key and any Firebase/DB secrets must never be committed**.
- **Admin auth:** Supabase Auth (email/password). A user is admin iff `public.profiles.role = 'admin'` (checked server-side by the `is_admin()` RLS helper and client-side by `isAdminUser()`). The `handle_new_user` trigger auto-creates a `profiles` row on signup. Single admin today; the `staff_role` enum is ready for RBAC.
- **Kiosk (anonymous) flows:** use the **anon key** — no sign-in required. `RLS` (Row Level Security) grants anon read-only access to public tables and execute access to the `SECURITY DEFINER` RPCs (`check_in_member`, `create_notification`). There is no anonymous auth user.
- **Member Google sign-in is deferred** during migration; member self-service logs in by member ID only.
- **RLS replaces Firestore rules.** Permissions are enforced in Postgres (`supabase/migrations/20260813000001_init.sql`), not in client code. Anon can never read `member_private`, `payments`, or `notifications`.

## Data Model & Sync

- **Relational schema:** each Firestore collection became a Postgres table (`members`, `member_private`, `visits`, `class_checkins`, `payments`, `plans`, `schedules`, `schedule_slots`, `closed_dates`, `notifications`, `bins`, `settings`, `profiles`, `member_pins`). Foreign keys (e.g. `visits.member_id → members.id`) enforce integrity; `ON DELETE/UPDATE CASCADE` handles member renames/deletes without orphan risk.
- **Online-first adapter (`Sync` in app-core.js):** `STATE` is the in-memory cache. `loadAll()` hydrates it from Supabase; realtime subscriptions keep `visits` + `notifications` live; `DB.saveX()` updates STATE then flushes (debounced 600ms) via `persist()`, which **diffs against a canonical mirror and writes only changed rows** (plus deletes removed rows). `members` is upsert-only (soft-delete via `deleted_at`, never a hard cascade delete).
- **camelCase ↔ snake_case** mapping lives in `MAPS` (per-table `to`/`from`) in app-core.js. STATE/UI is camelCase; the DB is snake_case.
- **PII isolation:** `phone`, `dob`, `notes`, `email` live in `member_private` (admin-only via RLS). `DB.getMembers()` merges them in for admins only.
- **Server-side RPCs (the "rules"):** `check_in_member` (atomic check-in), `apply_payment` + `delete_payment` + `recompute_member` (atomic payment/coverage), `rename_member` (PK rename + cascade), `create_notification`, `verify_member_pin` (future PIN kiosk), `is_admin`. All are `SECURITY DEFINER`.
- **Scheduled jobs (`pg_cron`):** `auto-checkout-visits` (closes stale visits every minute), `anonymize-deleted-members` (scrubs PII >365d), `purge-bins` (deletes old bin entries). These replace the old client-side `setInterval` logic.

## Critical Invariants

- **Member IDs** are 4–8 digit numeric strings (enforced by the member form; the DB accepts any non-empty string for legacy IDs).
- **Member renames** go through the `rename_member` RPC — a single `UPDATE members SET id` that cascades to visits/check-ins/payments/notifications atomically. Do **not** implement renames client-side by inserting the new ID then deleting the old.
- **`cleanBin()`** auto-deletes recycle bin entries older than 365 days on app init (backed by the `purge-bins` cron).
- **Auto-checkout** is server-side (`pg_cron`); the client no longer runs `autoCheckoutStaleVisits`.
- **Date handling:** all dates use `Utils.dateToLocalIso()` — NOT `.toISOString()` — because UTC conversion shifts days for positive-offset timezones (Greece is UTC+2/+3).
- **Admin view locking:** when auth changes to non-admin, `clearSensitiveData()` wipes `memberPrivate`, `payments`, `notifications`, and `bin` from STATE and localStorage. `initAuth` only reacts to real admin-status transitions (not every token refresh), and `lockAdmin`/`unlockAdmin` are idempotent — do not reintroduce re-navigation on auth events.
- **`MEMBER_PRIVATE_FIELDS`** (`['phone', 'dob', 'notes']`) in app-core.js marks fields that go to `member_private`. `email` is also private now (Google sign-in deferred). Adding a field here makes it admin-only.

## i18n (Greek Localization)

- Only kiosk/member/public views use i18n. Admin panel is English-only.
- Translations live in `App.KIOSK_I18N` in `js/app-i18n.js` (en + el maps).
- Days use full Greek names (Δευτέρα, Τρίτη, etc.) — these must match the English day names in schedule data.
- Language is persisted to `localStorage['kiosk_lang']`.
- `App.applyKioskTranslations()` does manual DOM ID/class/attribute mapping — there is no framework. When adding kiosk-facing UI text, update both the `en` and `el` maps AND the `applyKioskTranslations()` selector logic.
- **Uppercase Greek has no accent marks (τόνοι):** a Greek word rendered entirely in uppercase must not carry accents — write "ΕΛΛΑΔΑ" not "ΕΛΛΆΔΑ", "ΑΘΗΝΑ" not "ΑΘΉΝΑ". This also applies to strings displayed via CSS `text-transform: uppercase` (e.g. `.stat-card h3` in styles.css) — strip the τόνοι from the source string so the uppercased rendering is accent-free. Keep the Greek spelling otherwise unchanged.
- **`app-i18n.js` must be the LAST script in index.html** because it calls `window.onload = App.init` and must have all App methods available.

## Conventions

- **No comments** in code unless explaining a non-obvious data flow or security decision.
- **Inline event handlers** in HTML (`onclick="App.foo()"`, `onchange="App.bar()"`) are the norm — used alongside programmatic `addEventListener` bindings in `bindAdminListeners()`.
- **CSS variables** (`--primary`, `--gray-light`, etc.) are in `:root` at the top of `styles.css`. All new UI should use these, not hardcoded colors.
- **Responsive breakpoint:** 768px (`@media (max-width: 768px)`). Below this, the sidebar becomes a sliding drawer, numpad appears, and tables switch to mobile card layout (`.mobile-cards`).
- **Touch device detection:** `('ontouchstart' in window) || (navigator.maxTouchPoints > 0)`.
- **`Utils.escapeHTML()`** must be used on any user-generated content rendered as innerHTML. This is the app's XSS defense since it builds HTML strings in JS.

## UI Aesthetics & Component Consistency

These rules apply to **all three portals** (admin, kiosk/check-in, member) — no portal may look different from the others for the same kind of control.

- **There are exactly TWO canonical checkbox styles. Never use a raw native `<input type="checkbox">` in visible UI.** Pick based on intent:
  1. **Switch (boolean on/off)** — `.closed-date-toggle` (`<label class="closed-date-toggle"><input type="checkbox"><span class="closed-date-toggle-track"></span><span class="closed-date-toggle-label">…</span></label>`). Use for a single yes/no setting (e.g. plan Visible/Starred/Trial, class Visible, Repeat every year, Hide from Leaderboard, Allow raw HTML). If the label text should reflect state, add an `id` to the label span and update it from a small `App.update…Label()` handler (`onchange="App.updatePlanVisibilityLabel()"`).
  2. **Pill chips (multi-select group)** — `.day-picker` (`<div class="day-picker"><label><input type="checkbox"> Label</label>…</div>`). Use for a set of related choices where several may be on at once (e.g. schedule days Mon–Sun, belt visibility, visible columns, export fields, class-checkin visibility).
- **Hidden checkboxes are OK** when they drive selection logic and are never rendered (e.g. class-selection checkboxes in kiosk/staff check-in) — those stay `hidden` and are not part of the visual system.
- **Cards/boxes and section headers** use the shared `.card` component and CSS variables only — no per-section hardcoded colors, inline `style=` overrides are the exception, not the rule.
- **Submenu/tab bars** (Member Directory, Plans, Schedule, etc.) use `.tabs` / `.tab` — always horizontally scrollable and never squashed (tabs keep `flex-shrink: 0`). Do not add per-section tab styling.
- **Pills show `cursor: pointer`**; only genuinely draggable pills (column configurator) keep `cursor: move` via `label[draggable="true"]`.
- **When adding any checkbox anywhere**, copy an existing switch or pill example from this list and reuse the class — never introduce a third checkbox style.

## Recommended Practices for AI Agents

Beyond the mandatory rules above, these are recommended for the best results:

- **Batch related changes into one commit** — don't create separate commits for each tweak of the same feature/bug.
- **Check for side effects** — because this is a global-namespace app (`App.method`), adding or renaming a method can break calls in other files. Always grep for all call sites when renaming.
- **Keep HTML and JS in sync** — inline `onclick="App.foo()"` handlers in `index.html` must match the actual method name. JavaScript can't warn you about a broken reference.
- **Test locally before committing** — run `python3 -m http.server 3000` and test the actual flow for each view (kiosk, admin, member) to verify nothing broke.
- **Preserve load order** — if adding a new JS file, insert it in the correct position in `index.html` based on dependencies, and update the architecture diagram in this file.
- **Prefer editing existing files** over creating new ones — the app's simplicity (14 JS files total) is a feature, not a bug.
- **Never introduce build tools, npm, TypeScript, or frameworks** — the zero-build philosophy is deliberate.
- **Don't add comments** — the codebase convention is clean, comment-free code. Only add them for genuinely non-obvious logic.
