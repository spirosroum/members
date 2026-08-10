# AGENTS.md — GymDesk (Sloth Submission Grappling)

## Architecture

This is a **single-page static web app** with no build step, no bundler, no CI. Hosted on **GitHub Pages** (`spirosroum.github.io/members`). Three view containers in `index.html` (kiosk, admin, member) are toggled via CSS `hidden`. Firebase Firestore is the cloud DB, localStorage is the local cache/fallback. All JS is loaded via `<script>` tags — **load order is critical** (see below). Firebase compat SDK v10.8.0 (not modular v9+ API).

```
index.html
├── styles.css
├── firebase-app-compat.js / firebase-firestore-compat.js / firebase-auth-compat.js (CDN)
├── qrcode.min.js (CDN)
├── js/app-core.js     ← STATE, DB, FSEngine, Utils, global App object, boot init
├── js/app-ui.js       ← modals, navigation, color palettes, sidebar, admin login UI
├── js/app-kiosk.js    ← public kiosk check-in, leaderboard, numpad, live present list
├── js/app-member-portal.js    ← member dashboard, Google sign-in, self-service
├── js/app-checkin-admin.js    ← staff check-in, broadcast notice, QR code
├── js/app-mobile-checkin.js   ← mobile self-check-in flow
├── js/app-members.js   ← member directory, exports, freeze/unfreeze, member modal
├── js/app-plans.js     ← membership plans, public plans/classes, closed dates
├── js/app-schedule.js  ← class schedules, draft slots, calendar view
├── js/app-payments.js  ← payment ledger, payment modal, reconciliation
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
- **Update `HISTORY.md`** — append a new entry at the top with today's date, a short version name (e.g. `0.1`), the current time (HH:MM), a one-line summary, and a bullet list of what changed. Header format: `## YYYY-MM-DD — v0.1 (HH:MM) — Short summary`. Bump the version name on each change (minor bump per change: `0.1` → `0.2`). For a major update (breaking change, big new feature, large refactor), suggest bumping the major version (`0.x` → `1.0`) and flag it to the user. When `HISTORY.md` grows past ~15 entries, move the older entries to the top of `HISTORY-ARCHIVE.md`.
- **Write a descriptive commit message** — summarize what changed and why (e.g. `Fix visit log date filter for UTC+2 timezone` not `fix bug`). Keep it under 72 chars for the subject line.
- **After committing, auto-push to `master`** on `https://github.com/spirosroum/members.git`. If git push fails, tell the user which files changed so they can upload manually.

### After deployment
- **Can also deploy to Firebase Hosting:** `firebase deploy --only hosting` to `https://ssg-desk.web.app`.

## Deployment

- **There is no dev server, no npm, no build.** Open `index.html` directly in a browser (or use `python3 -m http.server 3000` for local testing).
- **Production:** hosted on **GitHub Pages** at `https://spirosroum.github.io/members/` with a custom domain at **`https://members.ssgbjj.gr/`**. Deploy by pushing to the `master` branch of `https://github.com/spirosroum/members.git`. When git push is not available, the user manually uploads changed files.
- **Firebase Hosting** (`https://ssg-desk.web.app`) is also available as a secondary deployment target. Deploy with `firebase deploy --only hosting`.
- **Deploy Firestore Rules only:** `firebase deploy --only firestore:rules`
- **No lint, no typecheck, no tests.** There is no tooling.

## Firebase & Auth

- **Project:** `ssg-desk` in europe-west1
- **Admin email:** hardcoded in `js/app-core.js` as `ADMIN_EMAIL = 'spirosroumeliotis29@gmail.com'`. Admin auth uses Firebase email/password. The `isAdmin()` function in `firestore.rules` checks both `request.auth.token.admin` custom claim AND the email fallback.
- **kiosk (anonymous) flows:** On boot, the app signs in anonymously (`auth.signInAnonymously()`). This provides an auth token so Firestore rules (which require `request.auth != null`) allow reads. Unauthenticated REST API requests are denied by rules.
- **Member Google sign-in:** Members link their Google account to their member record via the `email` field. Resolution is case-insensitive client-side. Email is intentionally public (not in the private subcollection) to enable this resolution.

## Data Model & Sync

- **Per-record architecture:** Each logical collection (`members`, `visits`, `payments`, `plans`, etc.) maps to a Firestore collection where `docId == record.id`. `schedules` and `closedDates` are stored as single array docs because order matters and only admin writes them.
- **Local-first:** `STATE` is the in-memory source of truth. `DB.getX()`/`DB.saveX()` read/write STATE and persist to localStorage via `fallbackToLocal()`, then sync to Firestore via `FSEngine.scheduleFlush()` (debounced 600ms). The app works fully offline and syncs when online.
- **PII isolation:** Sensitive fields (`phone`, `dob`, `notes`) are in `/members/{id}/private/info` — admin-only read/write. `DB.getMembers()` merges them in (admin only; stripped for kiosk). `DB.saveMembers()` strips them out, writes them to the private subcollection as a fire-and-forget.
- **Cloud sync guard:** `FSEngine.applied` prevents an empty-localState client from deleting the entire cloud collection on its first flush. The `dirty` flag prevents local edits from being overwritten by incoming snapshots.
- **Array docs vs. per-record collections:** `schedules`/`closedDates` are single array docs that are admin-only writes. On kiosk/member (non-admin) clients the local `dirty` flag for them is always spurious, so `handleArrayDocSnapshot()` and `resolveMigrationState()` apply the cloud state regardless of it. Do not reintroduce a `!dirty` gate for non-admin array-doc applies — a fresh incognito client would show an empty schedule (snapshot never re-fires, dirty never clears).

## Critical Invariants

- **Member IDs** are 4–8 digit numeric strings. IDs are autogenerated as random 4-digit numbers (`Math.floor(1000 + Math.random() * 9000)`).
- **Member renames** (member self-service ID changes) are a multi-step fire-and-forget: create new doc → update old doc's `id` field → delete old doc. Pending renames are persisted to localStorage (`gym_fs_renames`) so a crash mid-rename doesn't orphan data.
- **`cleanBin()`** auto-deletes recycle bin entries older than 365 days on every app init.
- **`autoCheckoutStaleVisits()`** runs every 60 seconds and auto-closes visits whose `expectedExitTime` has passed.
- **Date handling:** All dates use `Utils.dateToLocalIso()` — NOT `.toISOString()` — because UTC conversion shifts days for positive-offset timezones (Greece is UTC+2/+3).
- **Admin view locking:** When auth state changes to non-admin, `clearSensitiveData()` wipes `memberPrivate`, `payments`, `notifications`, and `bin` from STATE and localStorage to prevent data leakage on shared devices.
- **`MEMBER_PRIVATE_FIELDS`** (line 47 in app-core.js): `['phone', 'dob', 'notes']`. Adding a field here makes it admin-only. Making a field public means removing it from this array AND from the Firestore subcollection writes.

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
- **Touch device detection:** `('ontouchstart' in window) || (navigator.maxTouchPoints > 0)` — used to choose redirect vs popup for Google sign-in on mobile.
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
- **Ignore Firebase quota warnings** on kiosk refreshes — the app already caps retries, and anonymous read spikes during gym hours are expected.
