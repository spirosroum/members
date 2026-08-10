# Bug Reports — GymDesk (Sloth Submission Grappling)

Status legend: `open` = confirmed/reported, not yet fixed. `fixed` = resolved (see HISTORY.md entry).

---

## BUG-001 — Member name edit does not persist (reverts after page refresh)

- **Status:** fixed — 2026-08-10
- **Reported:** 2026-08-10
- **Location:** Admin Portal > Member Directory
- **Severity:** High (data persistence)

### Root cause
A check-in client (kiosk or staff check-in) holds a copy of the member doc that can be **stale** — an admin edited the name on another device — while the sync engine's mirror is frozen during a dirty flush. When the client saved its `sessionsLeft` decrement, `diffAndWrite()` pushed a **whole-record** `{merge:true}` write (`batch.set`), which wrote the stale `firstName`/`lastName` back over the newer cloud doc. The admin's edit appeared to land (local state + localStorage updated), but the cloud name was silently reverted within moments, so a refresh (which reloads from Firestore) showed the old name.

### Fix
`js/app-core.js` — `diffAndWrite()`: member writes for records that already exist in the mirror are now **field-scoped** — only the fields whose values differ from the mirror record are emitted (e.g. a check-in emits just `sessionsLeft`). A stale display field (name, belt, etc.) is never written back. New member docs (create path) still write the full record.

### Notes
- The same mechanism could revert any admin member edit (belt, expiration, etc.), not just names — the fix covers all member fields.
- No Firestore rules deploy needed; this is client-side only.

---

## BUG-002 — Payments ledger shows "Unknown Member" for member name

- **Status:** fixed — 2026-08-10
- **Reported:** 2026-08-10
- **Location:** Admin Portal > Management > Payments (Payment Ledger)
- **Severity:** Medium (cosmetic / data display)

### Root cause
Two gaps:
1. `renderAllPayments()` resolved each payment's member name via `members.find(x => x.id === p.memberId)` at render time. If `STATE.members` had not been applied yet (fresh boot / sync race when navigating to the pane), every payment fell back to the literal `'Unknown Member'`.
2. Payment records whose `memberId` referenced a member id that had been **renamed** (self-service ID change) were loaded from Firestore with the old id, and `applyRenameLedger()` never re-ran for records merged into STATE *after* the rename ledger applied — so the lookup failed until the page was refreshed.

### Fix
- `js/app-payments.js` — `renderAllPayments()`: shows a "Loading member names…" row and defers rendering until the members snapshot arrives (`FSEngine.whenReady('members')`); and resolves member names **through the rename ledger** (`FSEngine.renameMap`) when the direct id lookup fails.
- `js/app-core.js` — `applyCollectionSnapshotData()`: incoming snapshot records for payments/visits/class-check-ins/notifications are now translated to the member's current id via `resolveRenameTarget()`, so records loaded after the rename ledger applied never point at a stale id.

### Notes
- The visit log / dashboard name lookups benefit from the same snapshot-time rename translation.
