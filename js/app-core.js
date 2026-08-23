// =====================================================================
// app-core.js
// Supabase config, global STATE, data layer (Supabase adapter), Utils,
// and base App object.
// Plain script (no ES modules). Methods attach to the global App object
// created in app-core.js. Load order is fixed in index.html.
//
// NOTE: Migrated from Firebase/Firestore to Supabase (PostgreSQL).
// The hand-rolled Firestore sync engine (mirrors/dirty/unconfirmed/rename
// ledger) is replaced by a thin online-first Supabase adapter. The DB /
// STATE / Utils / App API surface is unchanged so the UI files keep
// working; check-in / payment / rename flows are being moved onto the
// server-side RPCs (see supabase/migrations/*).
// =====================================================================
        // Your Supabase project credentials.
        // Replace with your project URL + anon (public) key.
        const SUPABASE_URL = 'https://lwmwihdfwafnhtykslbz.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3bXdpaGRmd2Fmbmh0eWtzbGJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NTAwMDUsImV4cCI6MjEwMjIyNjAwNX0._8UucT18itw47qMcEhHhT1gxFqq1SCGGlqdrkwl_06U';

        // Initialize Supabase client
        let sb = null;
        if (window.supabase && window.supabase.createClient) {
            sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } else {
            console.warn('Supabase JS client not loaded — data sync disabled.');
        }

        // =====================================================================
        // AUTH (Supabase Auth)
        // Admin is identified by profiles.role = 'admin' (set server-side),
        // never by a hardcoded email in client code. Kiosk/member flows use
        // the anon key (no sign-in required); RLS enforces permissions.
        // =====================================================================
        let currentAuthUser = null;

        // Firebase-compatible auth facade so the existing UI call sites
        // (signInWithEmailAndPassword / signOut / onAuthStateChanged /
        // sendPasswordResetEmail) keep working unchanged.
        function getAuth() {
            if (!sb) return null;
            const mapErr = (err) => {
                const e = Object.assign({}, err || {});
                const m = (err && err.message) || '';
                if (/invalid login credentials/i.test(m)) e.code = 'auth/invalid-credential';
                else if (/user not found/i.test(m)) e.code = 'auth/user-not-found';
                else if (/invalid email/i.test(m)) e.code = 'auth/invalid-email';
                return e;
            };
            return {
                currentUser: currentAuthUser,
                onAuthStateChanged(cb) {
                    sb.auth.getSession().then(({ data }) => {
                        const u = (data && data.session) ? data.session.user : null;
                        currentAuthUser = u;
                        if (cb) cb(u);
                    });
                    const { data } = sb.auth.onAuthStateChange((_evt, session) => {
                        const u = session ? session.user : null;
                        currentAuthUser = u;
                        if (cb) cb(u);
                    });
                    return data.subscription.unsubscribe;
                },
                signInWithEmailAndPassword(email, pwd) {
                    return sb.auth.signInWithPassword({ email, password: pwd })
                        .then(r => ({ user: r.data.user }))
                        .catch(err => { throw mapErr(err); });
                },
                signOut() { return sb.auth.signOut(); },
                sendPasswordResetEmail(email) {
                    return sb.auth.resetPasswordForEmail(email).then(() => ({}));
                },
                // Google sign-in deferred during migration.
                signInWithPopup() {
                    return Promise.reject(Object.assign(new Error('Google sign-in is deferred during migration.'),
                        { code: 'auth/operation-not-supported' }));
                }
            };
        }

        // Async: true only when the signed-in user has the admin role.
        async function isAdminUser(user) {
            if (!user || !sb) return false;
            try {
                const { data, error } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
                if (error || !data) return false;
                return data.role === 'admin';
            } catch (e) {
                return false;
            }
        }

const PRESET_PALETTE = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#db2777', '#334155', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#0f766e', '#86198f'];

        // Sensitive member fields now live in the member_private table
        // (admin-only via RLS). Email was kept public in Firestore; it moves
        // to member_private in the relational schema.
        const MEMBER_PRIVATE_FIELDS = ['phone', 'dob', 'notes'];

        // Attendance feedback defaults (admin-editable via Member Settings).
        // Each range is { threshold, emoji, color }: the emoji+color shown when
        // attendance % is >= threshold.
        const DEFAULT_ATTENDANCE_RANGES = [
            { threshold: 50, emoji: '👍', color: '#10b981' },
            { threshold: 60, emoji: '💪', color: '#22c55e' },
            { threshold: 70, emoji: '⭐', color: '#84cc16' },
            { threshold: 80, emoji: '🏆', color: '#eab308' },
            { threshold: 90, emoji: '🔥', color: '#f59e0b' },
            { threshold: 95, emoji: '👑', color: '#f97316' },
            { threshold: 98, emoji: '🦥', color: '#d4af37' }
        ];
        const DEFAULT_ATTENDANCE_EMOJIS = Object.fromEntries(DEFAULT_ATTENDANCE_RANGES.map(r => [r.threshold, r.emoji]));
        const DEFAULT_ATTENDANCE_COLORS = Object.fromEntries(DEFAULT_ATTENDANCE_RANGES.map(r => [r.threshold, r.color]));
        const DEFAULT_LEADERBOARD_EMOJIS = { 1: '🥇', 2: '🥈', 3: '🥉', last: '💩' };
        const DEFAULT_BELT_COLORS = { White: '#ffffff', Blue: '#1d4ed8', Purple: '#6b21a8', Brown: '#78350f', Black: '#0f172a' };
        const DEFAULT_LEADERBOARD_SIZE = 10;

        // Hydrate attendance ranges from localStorage, migrating the legacy
        // keyed maps (threshold -> emoji/color) into the ordered range array.
        function loadAttendanceRanges() {
            try {
                const stored = JSON.parse(localStorage.getItem('gym_attendance_ranges') || 'null');
                if (Array.isArray(stored) && stored.length) return stored;
            } catch (e) { /* ignore and migrate below */ }
            const emojis = Object.assign({}, DEFAULT_ATTENDANCE_EMOJIS, JSON.parse(localStorage.getItem('gym_attendance_emojis') || '{}'));
            const colors = Object.assign({}, DEFAULT_ATTENDANCE_COLORS, JSON.parse(localStorage.getItem('gym_attendance_colors') || '{}'));
            const thresholds = Object.keys(colors).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
            if (thresholds.length) return thresholds.map(t => ({ threshold: t, emoji: emojis[t] || '', color: colors[t] || '#000000' }));
            return DEFAULT_ATTENDANCE_RANGES.map(r => Object.assign({}, r));
        }

        // CLOUD-SYNCED DATA LAYER (Supabase)
        const STATE = {
            members: JSON.parse(localStorage.getItem('gym_members') || '[]'),
            visits: JSON.parse(localStorage.getItem('gym_visits') || '[]'),
            payments: JSON.parse(localStorage.getItem('gym_payments') || '[]'),
            plans: JSON.parse(localStorage.getItem('gym_plans') || '[]'),
            planBin: JSON.parse(localStorage.getItem('gym_plan_bin') || '[]'),
            closedDates: JSON.parse(localStorage.getItem('gym_closed_dates') || '[]'),
            schedules: JSON.parse(localStorage.getItem('gym_schedules') || '[]'),
            scheduleBin: JSON.parse(localStorage.getItem('gym_schedule_bin') || '[]'),
            scheduleOverrides: JSON.parse(localStorage.getItem('gym_schedule_overrides') || '[]'),
            notifications: JSON.parse(localStorage.getItem('gym_notifications') || '[]'),
            notificationBin: JSON.parse(localStorage.getItem('gym_notification_bin') || '[]'),
            bin: JSON.parse(localStorage.getItem('gym_bin') || '[]'),
            classCheckins: JSON.parse(localStorage.getItem('gym_class_checkins') || '[]'),
            portalName: localStorage.getItem('gym_portal_name') || '🥋 BJJ Kiosk Portal',
            hiddenBelts: JSON.parse(localStorage.getItem('gym_hidden_belts') || '[]'),
            currency: localStorage.getItem('gym_currency') || '€',
            checkinNotice: localStorage.getItem('gym_checkin_notice') || '',
            checkinNoticeColor: localStorage.getItem('gym_checkin_notice_color') || '#fde68a',
            memberPrivate: JSON.parse(localStorage.getItem('gym_member_private') || '{}'),
            showClassCheckins: JSON.parse(localStorage.getItem('gym_show_class_checkins') ?? 'true'),
            memberStatsVisibility: JSON.parse(localStorage.getItem('gym_member_stats_visibility') || '{"totalTrainings":true,"totalHours":true,"avgDay":true,"avgWeek":true,"avgDays":true,"avgDaysMonth":true,"avgMonth":true,"rank":true}'),
            attendanceRanges: loadAttendanceRanges(),
            leaderboardEmojis: Object.assign({}, DEFAULT_LEADERBOARD_EMOJIS, JSON.parse(localStorage.getItem('gym_leaderboard_emojis') || '{}')),
            leaderboardSize: parseInt(localStorage.getItem('gym_leaderboard_size') || '10', 10),
            beltColors: Object.assign({}, DEFAULT_BELT_COLORS, JSON.parse(localStorage.getItem('gym_belt_colors') || '{}')),
            hideKioskSchedule: JSON.parse(localStorage.getItem('gym_hide_kiosk_schedule') || 'false')
        };

        function fallbackToLocal() {
            try {
                localStorage.setItem('gym_members', JSON.stringify(STATE.members || []));
                localStorage.setItem('gym_visits', JSON.stringify(STATE.visits || []));
                localStorage.setItem('gym_payments', JSON.stringify(STATE.payments || []));
                localStorage.setItem('gym_plans', JSON.stringify(STATE.plans || []));
                localStorage.setItem('gym_plan_bin', JSON.stringify(STATE.planBin || []));
                localStorage.setItem('gym_closed_dates', JSON.stringify(STATE.closedDates || []));
                localStorage.setItem('gym_schedules', JSON.stringify(STATE.schedules || []));
                localStorage.setItem('gym_schedule_bin', JSON.stringify(STATE.scheduleBin || []));
                localStorage.setItem('gym_schedule_overrides', JSON.stringify(STATE.scheduleOverrides || []));
                localStorage.setItem('gym_notifications', JSON.stringify(STATE.notifications || []));
                localStorage.setItem('gym_notification_bin', JSON.stringify(STATE.notificationBin || []));
                localStorage.setItem('gym_bin', JSON.stringify(STATE.bin || []));
                localStorage.setItem('gym_class_checkins', JSON.stringify(STATE.classCheckins || []));
                localStorage.setItem('gym_portal_name', STATE.portalName || '🥋 BJJ Kiosk Portal');
                localStorage.setItem('gym_hidden_belts', JSON.stringify(STATE.hiddenBelts || []));
                localStorage.setItem('gym_currency', STATE.currency || '€');
                localStorage.setItem('gym_checkin_notice', STATE.checkinNotice || '');
                localStorage.setItem('gym_checkin_notice_color', STATE.checkinNoticeColor || '#fde68a');
                localStorage.setItem('gym_member_private', JSON.stringify(STATE.memberPrivate || {}));
                localStorage.setItem('gym_show_class_checkins', JSON.stringify(STATE.showClassCheckins !== false));
                localStorage.setItem('gym_member_stats_visibility', JSON.stringify(STATE.memberStatsVisibility || {}));
                localStorage.setItem('gym_attendance_ranges', JSON.stringify(STATE.attendanceRanges || DEFAULT_ATTENDANCE_RANGES));
                localStorage.setItem('gym_leaderboard_emojis', JSON.stringify(STATE.leaderboardEmojis || {}));
                localStorage.setItem('gym_leaderboard_size', String(STATE.leaderboardSize || DEFAULT_LEADERBOARD_SIZE));
                localStorage.setItem('gym_belt_colors', JSON.stringify(STATE.beltColors || {}));
                localStorage.setItem('gym_hide_kiosk_schedule', JSON.stringify(STATE.hideKioskSchedule === true));
            } catch (err) {
                console.warn('Failed to persist to localStorage fallback', err);
            }
        }

        function settingsPayload() {
            return {
                portalName: STATE.portalName || '🥋 BJJ Kiosk Portal',
                hiddenBelts: STATE.hiddenBelts || [],
                currency: STATE.currency || '€',
                checkinNotice: STATE.checkinNotice || '',
                checkinNoticeColor: STATE.checkinNoticeColor || '#fde68a',
                showClassCheckins: STATE.showClassCheckins !== false,
                memberStatsVisibility: STATE.memberStatsVisibility || { totalTrainings: true, totalHours: true, avgDay: true, avgWeek: true, avgDays: true, avgDaysMonth: true, avgMonth: true, rank: true },
                attendanceRanges: STATE.attendanceRanges || DEFAULT_ATTENDANCE_RANGES,
                leaderboardEmojis: STATE.leaderboardEmojis || DEFAULT_LEADERBOARD_EMOJIS,
                leaderboardSize: STATE.leaderboardSize || DEFAULT_LEADERBOARD_SIZE,
                beltColors: STATE.beltColors || DEFAULT_BELT_COLORS,
                hideKioskSchedule: STATE.hideKioskSchedule === true
            };
        }

        // =====================================================================
        // SUPABASE ADAPTER (replaces the Firestore per-record sync engine)
        //
        // camelCase (STATE) <-> snake_case (Postgres) row maps. Online-first:
        // loadAll() hydrates STATE, realtime keeps visits/notifications live,
        // and DB setters full-replace their collection via persist().
        // =====================================================================
        const MAPS = {
            members: {
                table: 'members',
                state: 'members',
                to: (m) => ({
                    id: m.id,
                    first_name: m.firstName || '',
                    last_name: m.lastName || '',
                    gender: m.gender || null,
                    belt: m.belt || 'White',
                    expiration_date: m.expirationDate || null,
                    account_status: (m.accountStatus || 'active').toLowerCase(),
                    sessions_total: !!m.sessionsTotal,
                    sessions_left: parseInt(m.sessionsLeft) || 0,
                    plan_days: (m.planDays != null && m.planDays !== '') ? parseInt(m.planDays, 10) : null,
                    hide_from_leaderboard: !!m.hideFromLeaderboard,
                    trial_participant: !!m.trialParticipant,
                    trial_converted: !!m.trialConverted,
                    deleted_at: null
                }),
                from: (r) => ({
                    id: r.id,
                    firstName: r.first_name,
                    lastName: r.last_name,
                    gender: r.gender,
                    belt: r.belt,
                    expirationDate: r.expiration_date,
                    accountStatus: r.account_status ? (r.account_status.charAt(0).toUpperCase() + r.account_status.slice(1)) : 'Active',
                    sessionsTotal: r.sessions_total,
                    sessionsLeft: r.sessions_left,
                    planDays: r.plan_days,
                    hideFromLeaderboard: r.hide_from_leaderboard,
                    trialParticipant: r.trial_participant,
                    trialConverted: r.trial_converted
                })
            },
            visits: {
                table: 'visits',
                state: 'visits',
                to: (v) => ({
                    id: v.id,
                    member_id: v.memberId,
                    entry_time: v.entryTime || new Date().toISOString(),
                    expected_exit_time: v.expectedExitTime || null,
                    exit_time: v.exitTime || null,
                    is_unpaid: !!v.isUnpaid,
                    paid_override: v.paidOverride || null,
                    class_ids: Array.isArray(v.classIds) ? v.classIds : []
                }),
                from: (r) => ({
                    id: r.id,
                    memberId: r.member_id,
                    entryTime: r.entry_time,
                    expectedExitTime: r.expected_exit_time,
                    exitTime: r.exit_time,
                    isUnpaid: r.is_unpaid,
                    paidOverride: r.paid_override,
                    classIds: r.class_ids || []
                })
            },
            payments: {
                table: 'payments',
                state: 'payments',
                to: (p) => ({
                    id: p.id,
                    member_id: p.memberId,
                    date: p.date,
                    amount: parseFloat(p.amount) || 0,
                    note: p.note || null,
                    plan_id: p.planId || null,
                    sessions_granted: (p.sessionsGranted != null && p.sessionsGranted !== '') ? parseInt(p.sessionsGranted, 10) : null,
                    applied_expiration: p.appliedExpiration || null,
                    applied_start_date: p.appliedStartDate || null,
                    prev_expiration: p.prevExpiration || null,
                    cleared_visit_ids: Array.isArray(p.clearedVisitIds) ? p.clearedVisitIds : []
                }),
                from: (r) => ({
                    id: r.id,
                    memberId: r.member_id,
                    date: r.date,
                    amount: r.amount,
                    note: r.note,
                    planId: r.plan_id,
                    sessionsGranted: r.sessions_granted,
                    appliedExpiration: r.applied_expiration,
                    appliedStartDate: r.applied_start_date,
                    prevExpiration: r.prev_expiration,
                    clearedVisitIds: r.cleared_visit_ids || []
                })
            },
            plans: {
                table: 'plans',
                state: 'plans',
                to: (p) => ({
                    id: p.id,
                    name: p.name,
                    description: p.description || null,
                    description_html: !!p.descriptionHtml,
                    days: (p.days != null && p.days !== '') ? parseInt(p.days, 10) : null,
                    sessions: (p.sessions != null && p.sessions !== '') ? parseInt(p.sessions, 10) : null,
                    price: parseFloat(p.price) || 0,
                    color: p.color || '#2563eb',
                    is_public: p.isPublic !== false,
                    starred: !!p.starred,
                    is_trial: !!p.isTrial
                }),
                from: (r) => ({
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    descriptionHtml: r.description_html,
                    days: r.days,
                    sessions: r.sessions,
                    price: r.price,
                    color: r.color,
                    isPublic: r.is_public,
                    starred: r.starred,
                    isTrial: r.is_trial
                })
            },
            classCheckins: {
                table: 'class_checkins',
                state: 'classCheckins',
                to: (c) => ({
                    id: c.id,
                    visit_id: c.visitId,
                    member_id: c.memberId,
                    class_id: c.classId,
                    slot_date: c.slotDate || null,
                    slot_day: c.slotDay || null,
                    slot_start: c.slotStart || null,
                    slot_end: c.slotEnd || null,
                    entry_time: c.entryTime || null
                }),
                from: (r) => ({
                    id: r.id,
                    visitId: r.visit_id,
                    memberId: r.member_id,
                    classId: r.class_id,
                    slotDate: r.slot_date,
                    slotDay: r.slot_day,
                    slotStart: r.slot_start,
                    slotEnd: r.slot_end,
                    entryTime: r.entry_time
                })
            },
            notifications: {
                table: 'notifications',
                state: 'notifications',
                to: (n) => ({
                    id: n.id,
                    title: n.title,
                    msg: n.msg || null,
                    type: n.type || 'info',
                    date: n.date || new Date().toISOString(),
                    read: !!n.read,
                    member_id: n.memberId || null
                }),
                from: (r) => ({
                    id: r.id,
                    title: r.title,
                    msg: r.msg,
                    type: r.type,
                    date: r.date,
                    read: r.read,
                    memberId: r.member_id
                })
            }
        };

        const CHUNK = 500;
        function chunkRows(rows) {
            const out = [];
            for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
            return out;
        }

        const Sync = {
            loaded: false,
            ready: {},
            mirrors: {},          // col -> Map(id -> JSON string of row)
            settingsMirror: null,
            privateMirror: null,
            _waiters: {},         // col -> [resolve]
            _subs: {},            // realtime channel per collection
            _flushTimer: null,
            _flushPromise: null,
            _resolveFlush: null,

            whenReady(col) {
                if (this.ready[col]) return Promise.resolve();
                if (!this._waiters[col]) this._waiters[col] = [];
                return new Promise(res => this._waiters[col].push(res));
            },
            whenReadyAll(cols) {
                return Promise.all((cols || []).map(c => this.whenReady(c)));
            },

            _markReady(col) {
                this.ready[col] = true;
                (this._waiters[col] || []).forEach(r => r());
                this._waiters[col] = [];
            },

            async _fetch(table) {
                const { data, error } = await sb.from(table).select('*');
                if (error) throw error;
                return data || [];
            },

            async load(col) {
                const map = MAPS[col];
                let q = sb.from(map.table).select('*');
                if (col === 'members') q = q.is('deleted_at', null);
                const { data, error } = await q;
                if (error) throw error;
                const arr = (data || []).map(map.from);
                STATE[map.state] = arr;
                this.mirrors[col] = new Map(arr.map(r => [String(r.id), JSON.stringify(map.to(r))]));
                this._markReady(col);
            },

            async loadSchedules() {
                const [scheds, slots] = await Promise.all([
                    this._fetch('schedules'), this._fetch('schedule_slots')
                ]);
                const byId = {};
                scheds.forEach(s => { byId[s.id] = MAPS_EXTRA.scheduleFrom(s); });
                slots.forEach(sl => {
                    if (byId[sl.schedule_id]) {
                        byId[sl.schedule_id].slots = byId[sl.schedule_id].slots || [];
                        byId[sl.schedule_id].slots.push(MAPS_EXTRA.slotFrom(sl));
                    }
                });
                STATE.schedules = Object.values(byId);
                this._markReady('schedules');
            },

            async loadScheduleOverrides() {
                const rows = await this._fetch('schedule_overrides');
                STATE.scheduleOverrides = rows.map(MAPS_EXTRA.overrideFrom);
                this._markReady('scheduleOverrides');
            },

            async loadClosedDates() {
                const rows = await this._fetch('closed_dates');
                STATE.closedDates = rows.map(MAPS_EXTRA.closedDateFrom);
                this._markReady('closedDates');
            },

            async loadSettings() {
                const rows = await this._fetch('settings');
                const s = {};
                rows.forEach(r => { s[r.key] = r.value; });
                if (s.portal_name != null) STATE.portalName = s.portal_name;
                if (Array.isArray(s.hidden_belts)) STATE.hiddenBelts = s.hidden_belts;
                if (s.currency != null) STATE.currency = s.currency;
                if (s.checkin_notice != null) STATE.checkinNotice = s.checkin_notice;
                if (s.checkin_notice_color != null) STATE.checkinNoticeColor = s.checkin_notice_color;
                if (s.show_class_checkins != null) STATE.showClassCheckins = !!s.show_class_checkins;
                if (s.member_stats_visibility) STATE.memberStatsVisibility = Object.assign({ totalTrainings: true, totalHours: true, avgDay: true, avgWeek: true, avgDays: true, avgDaysMonth: true, avgMonth: true, rank: true }, s.member_stats_visibility);
                if (Array.isArray(s.attendance_ranges) && s.attendance_ranges.length) STATE.attendanceRanges = s.attendance_ranges;
                else if (s.attendance_colors) {
                    const colors = Object.assign({}, DEFAULT_ATTENDANCE_COLORS, s.attendance_colors);
                    const emojis = Object.assign({}, DEFAULT_ATTENDANCE_EMOJIS, s.attendance_emojis || {});
                    STATE.attendanceRanges = Object.keys(colors).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b).map(t => ({ threshold: t, emoji: emojis[t] || '', color: colors[t] || '#000000' }));
                }
                if (s.leaderboard_emojis) STATE.leaderboardEmojis = Object.assign({}, DEFAULT_LEADERBOARD_EMOJIS, s.leaderboard_emojis);
                if (s.leaderboard_size != null) STATE.leaderboardSize = parseInt(s.leaderboard_size, 10) || DEFAULT_LEADERBOARD_SIZE;
                if (s.belt_colors && typeof s.belt_colors === 'object') {
                    STATE.beltColors = Object.assign({}, DEFAULT_BELT_COLORS, s.belt_colors);
                    if (App.applyBeltColors) App.applyBeltColors();
                }
                if (s.hide_kiosk_schedule != null) {
                    STATE.hideKioskSchedule = !!s.hide_kiosk_schedule;
                    if (App.applyKioskScheduleVisibility) App.applyKioskScheduleVisibility();
                }
                this.settingsMirror = JSON.stringify(settingsPayload());
                this._markReady('settings');
            },

            async loadPrivate() {
                const rows = await this._fetch('member_private');
                const priv = {};
                rows.forEach(r => { if (r.member_id) priv[r.member_id] = MAPS_EXTRA.privateFrom(r); });
                STATE.memberPrivate = priv;
                this.privateMirror = JSON.stringify(priv);
            },

            async loadBins() {
                const rows = await this._fetch('bins');
                STATE.bin = [];
                STATE.planBin = [];
                STATE.scheduleBin = [];
                STATE.notificationBin = [];
                rows.forEach(r => {
                    const payload = r.payload || {};
                    if (r.entity_type === 'member') STATE.bin.push(payload);
                    else if (r.entity_type === 'plan') STATE.planBin.push(payload);
                    else if (r.entity_type === 'schedule') STATE.scheduleBin.push(payload);
                    else if (r.entity_type === 'notification') STATE.notificationBin.push(payload);
                });
            },

            // Admin-only collections are denied for the anon kiosk (RLS),
            // so they are loaded only when an admin is signed in.
            async loadAdminOnly() {
                await Promise.all([this.load('payments'), this.load('notifications'), this.loadPrivate(), this.loadBins()]);
            },

            async loadAll() {
                const isAdmin = FSEngine.isAdminClient();
                await Promise.all([
                    this.load('members'), this.load('visits'), this.load('plans'),
                    this.load('classCheckins'), this.loadSchedules(), this.loadScheduleOverrides(),
                    this.loadClosedDates(), this.loadSettings()
                ]);
                if (isAdmin) {
                    await this.loadAdminOnly();
                } else {
                    STATE.payments = [];
                    STATE.notifications = [];
                    STATE.memberPrivate = {};
                    STATE.bin = [];
                    STATE.planBin = [];
                    STATE.scheduleBin = [];
                    STATE.notificationBin = [];
                    // Empty the mirrors so a later admin flush can't diff-delete the
                    // sensitive rows from Supabase based on a stale snapshot.
                    this.mirrors.payments = new Map();
                    this.mirrors.notifications = new Map();
                    this.mirrors.notificationBin = new Map();
                    this.mirrors.bin = new Map();
                    this._markReady('payments');
                    this._markReady('notifications');
                }
                this.loaded = true;
            },

            // Persist a per-record collection: only write rows that actually changed
            // (vs the canonical mirror) and delete rows removed from STATE. Supabase
            // needs no full-table rewrite on every save — this is a diff, not a wipe.
            // `members` is upsert-only: deletions/renames go through the bin /
            // rename_member flows, never a hard cascade delete.
            async persist(col, opts) {
                if (!sb || !this.ready[col]) return;
                const map = MAPS[col];
                const arr = STATE[map.state] || [];
                const mirror = this.mirrors[col] || new Map();
                const keys = new Set();
                const upserts = [];
                arr.forEach(camel => {
                    if (!camel || !camel.id) return;
                    const k = String(camel.id);
                    keys.add(k);
                    const row = map.to(camel);
                    if (mirror.get(k) !== JSON.stringify(row)) upserts.push(row);
                });
                for (const c of chunkRows(upserts)) {
                    const { error } = await sb.from(map.table).upsert(c, { onConflict: 'id' });
                    if (error) throw error;
                }
                const removed = [];
                mirror.forEach((v, k) => { if (!keys.has(k)) removed.push(k); });
                if (col === 'members') {
                    // Members are soft-deleted (moved to bin), never hard-deleted, so a
                    // cascade delete can never wipe their visits/check-ins/payments.
                    for (const k of removed) {
                        const { error } = await sb.from('members').update({ deleted_at: new Date().toISOString() }).eq('id', k);
                        if (error) throw error;
                    }
                } else if (!(opts && opts.upsertOnly)) {
                    for (const k of removed) {
                        const { error } = await sb.from(map.table).delete().eq('id', k);
                        if (error) throw error;
                    }
                }
                this.mirrors[col] = new Map(arr.filter(r => r && r.id).map(r => [String(r.id), JSON.stringify(map.to(r))]));
            },

            async persistSchedules() {
                if (!sb || !this.ready.schedules) return;
                const scheds = (STATE.schedules || []).map(MAPS_EXTRA.scheduleTo);
                const slots = [];
                (STATE.schedules || []).forEach((cls, i) => {
                    const sid = cls.id || `SCHED-${i}`;
                    (cls.slots || []).forEach((sl, j) => {
                        slots.push({ id: sl.id || `${sid}-SLOT-${j}`, schedule_id: sid, day: sl.day, start: sl.start, end: sl.end });
                    });
                });
                for (const c of chunkRows(scheds)) await sb.from('schedules').upsert(c, { onConflict: 'id' });
                for (const c of chunkRows(slots)) await sb.from('schedule_slots').upsert(c, { onConflict: 'id' });
                // Remove slots no longer present
                const keep = new Set(slots.map(s => s.id));
                const { data: existing } = await sb.from('schedule_slots').select('id');
                (existing || []).forEach(e => { if (!keep.has(e.id)) sb.from('schedule_slots').delete().eq('id', e.id); });
            },

            async persistClosedDates() {
                if (!sb || !this.ready.closedDates) return;
                const rows = (STATE.closedDates || []).map((c, i) => ({ id: `CD-${i}`, date: c.date, date_end: c.dateEnd || null, repeat: !!c.repeat, reason: c.reason || null }));
                for (const c of chunkRows(rows)) await sb.from('closed_dates').upsert(c, { onConflict: 'id' });
                const keep = new Set(rows.map(r => r.id));
                const { data: existing } = await sb.from('closed_dates').select('id');
                (existing || []).forEach(e => { if (!keep.has(e.id)) sb.from('closed_dates').delete().eq('id', e.id); });
            },

            async persistScheduleOverrides() {
                if (!sb || !this.ready.scheduleOverrides) return;
                const rows = (STATE.scheduleOverrides || []).map(MAPS_EXTRA.overrideTo);
                for (const c of chunkRows(rows)) await sb.from('schedule_overrides').upsert(c, { onConflict: 'id' });
                const keep = new Set(rows.map(r => r.id));
                const { data: existing } = await sb.from('schedule_overrides').select('id');
                (existing || []).forEach(e => { if (!keep.has(e.id)) sb.from('schedule_overrides').delete().eq('id', e.id); });
            },

            async persistSettings() {
                if (!sb || !this.ready.settings) return;
                const p = settingsPayload();
                const json = JSON.stringify(p);
                if (this.settingsMirror === json) return;
                const rows = [
                    { key: 'portal_name', value: p.portalName },
                    { key: 'hidden_belts', value: p.hiddenBelts },
                    { key: 'currency', value: p.currency },
                    { key: 'checkin_notice', value: p.checkinNotice },
                    { key: 'checkin_notice_color', value: p.checkinNoticeColor },
                    { key: 'show_class_checkins', value: p.showClassCheckins },
                    { key: 'member_stats_visibility', value: p.memberStatsVisibility },
                    { key: 'attendance_ranges', value: p.attendanceRanges },
                    { key: 'leaderboard_emojis', value: p.leaderboardEmojis },
                    { key: 'leaderboard_size', value: p.leaderboardSize },
                    { key: 'belt_colors', value: p.beltColors },
                    { key: 'hide_kiosk_schedule', value: p.hideKioskSchedule }
                ];
                for (const c of chunkRows(rows)) await sb.from('settings').upsert(c, { onConflict: 'key' });
                this.settingsMirror = json;
            },

            async persistMemberPrivate() {
                if (!sb) return;
                const priv = STATE.memberPrivate || {};
                const json = JSON.stringify(priv);
                if (this.privateMirror === json) return;
                const rows = Object.keys(priv).map(mid => Object.assign({ member_id: mid }, priv[mid]));
                for (const c of chunkRows(rows)) await sb.from('member_private').upsert(c, { onConflict: 'member_id' });
                this.privateMirror = json;
            },

            async persistBins() {
                if (!sb) return;
                const BIN_TYPES = [
                    ['bin', 'member'], ['planBin', 'plan'],
                    ['scheduleBin', 'schedule'], ['notificationBin', 'notification']
                ];
                for (const [stateKey, entityType] of BIN_TYPES) {
                    const arr = STATE[stateKey] || [];
                    const rows = arr.map(r => ({
                        entity_type: entityType,
                        original_id: r.id,
                        payload: r,
                        deleted_at: r.deletedAt || new Date().toISOString()
                    }));
                    for (const c of chunkRows(rows)) {
                        const { error } = await sb.from('bins').upsert(c, { onConflict: 'entity_type,original_id' });
                        if (error) throw error;
                    }
                    const keep = new Set(rows.map(r => String(r.original_id)));
                    const { data: existing } = await sb.from('bins').select('original_id').eq('entity_type', entityType);
                    (existing || []).forEach(e => {
                        if (!keep.has(String(e.original_id))) {
                            sb.from('bins').delete().eq('entity_type', entityType).eq('original_id', e.original_id);
                        }
                    });
                }
            },

            // Debounced full-save of everything dirty (mirrors the old saveToCloud).
            scheduleFlush() {
                if (!this._flushPromise) {
                    this._flushPromise = new Promise(resolve => { this._resolveFlush = resolve; });
                }
                if (this._flushTimer) return this._flushPromise;
                this._flushTimer = setTimeout(() => { this._flushTimer = null; this.flush(); }, 600);
                return this._flushPromise;
            },
            _resolveFlushNow() {
                if (this._resolveFlush) { const r = this._resolveFlush; this._resolveFlush = null; this._flushPromise = null; r(); }
            },
            async flush() {
                const isAdmin = FSEngine.isAdminClient();
                const jobs = [];
                const push = (p) => jobs.push(p.catch(err => console.warn('Supabase write skipped:', err && err.message ? err.message : err)));
                ['members', 'visits', 'plans', 'classCheckins'].forEach(col => push(this.persist(col)));
                push(this.persistSchedules());
                push(this.persistClosedDates());
                push(this.persistScheduleOverrides());
                if (isAdmin) {
                    // Payments are upsert-only here: the only legitimate way to remove a
                    // payment is the delete_payment RPC (then reload), so the sync diff
                    // must never hard-delete payment rows when STATE/mirror get out of sync.
                    push(this.persist('payments', { upsertOnly: true }));
                    push(this.persist('notifications'));
                    push(this.persistMemberPrivate());
                    push(this.persistBins());
                }
                push(this.persistSettings());
                await Promise.all(jobs);
                this._resolveFlushNow();
            },

            // ── server-side RPC wrappers (used by Phase 4 flows) ──
            async checkIn(payload) {
                const { data, error } = await sb.rpc('check_in_member', payload);
                if (error) throw error;
                return data;
            },
            async applyPayment(payment) {
                const { error } = await sb.rpc('apply_payment', { p_payment: payment });
                if (error) throw error;
            },
            async deletePayment(memberId, paymentId) {
                const { error } = await sb.rpc('delete_payment', { p_member_id: memberId, p_payment_id: paymentId });
                if (error) throw error;
            },
            async recomputeMember(memberId) {
                const { error } = await sb.rpc('recompute_member_admin', { p_member_id: memberId });
                if (error) throw error;
            },
            async renameMember(oldId, newId) {
                const { error } = await sb.rpc('rename_member', { p_old_id: oldId, p_new_id: newId });
                if (error) throw error;
            },
            async createNotification(title, msg, type, memberId) {
                const { error } = await sb.rpc('create_notification', { p_title: title, p_msg: msg, p_type: type, p_member_id: memberId });
                if (error) throw error;
            },

            // ── realtime (visits = Currently Inside; notifications = admin) ──
            subscribeRealtime() {
                if (!sb) return;
                if (!this._subs.visits) {
                    this._subs.visits = sb.channel('visits-changes')
                        .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => this.refreshVisits())
                        .subscribe();
                }
                if (!this._subs.classCheckins) {
                    this._subs.classCheckins = sb.channel('class-checkins-changes')
                        .on('postgres_changes', { event: '*', schema: 'public', table: 'class_checkins' }, () => this.refreshClassCheckins())
                        .subscribe();
                }
                if (FSEngine.isAdminClient() && !this._subs.notifications) {
                    this._subs.notifications = sb.channel('notifications-changes')
                        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => this.refreshNotifications())
                        .subscribe();
                }
            },
            unsubscribeRealtime() {
                Object.keys(this._subs).forEach(k => { try { sb.removeChannel(this._subs[k]); } catch (e) {} delete this._subs[k]; });
            },

            async refreshVisits() {
                if (!this.loaded) return;
                // Skip while a local write is pending/flushing: a stale server fetch here
                // would resurrect records this client just deleted (realtime race).
                if (this._flushPromise) return;
                try {
                    const rows = await this._fetch('visits');
                    STATE.visits = rows.map(MAPS.visits.from);
                    this.mirrors.visits = new Map(STATE.visits.map(r => [String(r.id), JSON.stringify(MAPS.visits.to(r))]));
                    fallbackToLocal();
                    scheduleAfterCloudSyncRender();
                } catch (e) { console.warn('realtime visits refresh failed', e); }
            },
            async refreshClassCheckins() {
                if (!this.loaded) return;
                if (this._flushPromise) return;
                try {
                    const rows = await this._fetch('class_checkins');
                    STATE.classCheckins = rows.map(MAPS.classCheckins.from);
                    this.mirrors.classCheckins = new Map(STATE.classCheckins.map(r => [String(r.id), JSON.stringify(MAPS.classCheckins.to(r))]));
                    fallbackToLocal();
                    scheduleAfterCloudSyncRender();
                } catch (e) { console.warn('realtime class-checkins refresh failed', e); }
            },
            async refreshNotifications() {
                if (!this.loaded) return;
                if (this._flushPromise) return;
                try {
                    const rows = await this._fetch('notifications');
                    STATE.notifications = rows.map(MAPS.notifications.from);
                    this.mirrors.notifications = new Map(STATE.notifications.map(r => [String(r.id), JSON.stringify(MAPS.notifications.to(r))]));
                    fallbackToLocal();
                    scheduleAfterCloudSyncRender();
                } catch (e) { console.warn('realtime notifications refresh failed', e); }
            },

            // Re-hydrate the check-in-affected collections after an RPC call.
            async reloadCheckinData() {
                await Promise.all([
                    this.load('members'), this.load('visits'), this.load('classCheckins')
                ]);
                fallbackToLocal();
                scheduleAfterCloudSyncRender();
            },

            // Re-hydrate the payment-affected collections after an RPC call.
            async reloadPaymentData() {
                await Promise.all([
                    this.load('payments'), this.load('members'), this.load('visits')
                ]);
                fallbackToLocal();
                scheduleAfterCloudSyncRender();
            }
        };

        // Schedule / closed-date / private extra maps (kept separate to avoid
        // cluttering the per-record MAPS).
        const MAPS_EXTRA = {
            scheduleFrom: (r) => ({
                id: r.id, name: r.name, description: r.description,
                practitioners: r.practitioners, requirements: r.requirements,
                color: r.color, capacity: r.capacity, isPublic: r.is_public,
                availableFrom: r.available_from || null,
                slots: []
            }),
            slotFrom: (sl) => ({ id: sl.id, day: sl.day, start: sl.start, end: sl.end }),
            scheduleTo: (cls) => ({
                id: cls.id, name: cls.name, description: cls.description || null,
                description_html: false, practitioners: cls.practitioners || null,
                requirements: cls.requirements || null, color: cls.color || '#2563eb',
                capacity: cls.capacity || null, is_public: cls.isPublic !== false,
                available_from: cls.availableFrom || null
            }),
            closedDateFrom: (r) => ({ date: r.date, dateEnd: r.date_end || undefined, repeat: !!r.repeat, reason: r.reason || '' }),
            overrideFrom: (r) => ({
                id: r.id,
                scheduleId: r.schedule_id,
                date: r.date,
                replacementClassId: r.replacement_class_id || null,
                name: r.name || null,
                description: r.description || null,
                color: r.color || null,
                cancelled: !!r.cancelled
            }),
            overrideTo: (o) => ({
                id: o.id,
                schedule_id: o.scheduleId,
                date: o.date,
                replacement_class_id: o.replacementClassId || null,
                name: o.name || null,
                description: o.description || null,
                color: o.color || null,
                cancelled: !!o.cancelled
            }),
            privateFrom: (r) => {
                const entry = {};
                if (r.phone != null) entry.phone = r.phone;
                if (r.dob != null) entry.dob = r.dob;
                if (r.notes != null) entry.notes = r.notes;
                if (r.email != null) entry.email = r.email;
                return entry;
            }
        };

        // =====================================================================
        // FSEngine — compatibility shim. The UI files reference a small set of
        // FSEngine properties; this object keeps them working on top of Sync.
        // =====================================================================
        const FSEngine = {
            db: sb,
            ready: Sync.ready,
            migrationResolved: false,
            renameMap: new Map(),      // renames are server-side now — always empty
            _subs: Sync._subs,
            mirrors: Sync.mirrors,

            isAdminClient: () => { try { return !!App.isAdminAuthed && App.isAdminAuthed(); } catch (e) { return false; } },

            whenReady: (col, timeoutMs) => {
                const t = timeoutMs || 12000;
                return Promise.race([
                    Sync.whenReady(col),
                    new Promise(res => setTimeout(res, t))
                ]);
            },
            whenReadyAll: (cols, timeoutMs) => {
                const t = timeoutMs || 12000;
                return Promise.race([
                    Sync.whenReadyAll(cols),
                    new Promise(res => setTimeout(res, t))
                ]);
            },

            notifyRename: (oldId, newId) => {
                return Sync.renameMember(oldId, newId).catch(err => console.warn('rename failed', err));
            },

            resubscribeMissing: () => { /* Supabase RLS does not kill listeners */ },
            migrate: () => Promise.resolve(true),
            scheduleFlush: () => Sync.scheduleFlush(),
            flush: () => Sync.flush(),
            checkIn: (payload) => Sync.checkIn(payload),
            reloadCheckinData: () => Sync.reloadCheckinData(),
            recomputeMember: (memberId) => Sync.recomputeMember(memberId),
            resyncAll: () => { Sync.loadAll().then(() => scheduleAfterCloudSyncRender()); }
        };

        // Mark every cloud collection loaded so resolution proceeds.
        function resolveMigrationState() {
            if (FSEngine.migrationResolved) return;
            FSEngine.migrationResolved = true;
        }

        function saveToCloud() {
            fallbackToLocal();
            if (!sb) return Promise.resolve();
            return Sync.scheduleFlush();
        }

        var renderDebounceTimer = null;
        function scheduleAfterCloudSyncRender() {
            if (renderDebounceTimer) return;
            renderDebounceTimer = setTimeout(() => {
                renderDebounceTimer = null;
                renderAfterCloudSync();
            }, 200);
        }

        function renderAfterCloudSync() {
            function safe(cb) { try { cb(); } catch (e) { console.warn('renderAfterCloudSync error:', e); } }
            safe(() => { document.getElementById('kiosk-title-display').innerText = STATE.portalName; });
            safe(() => App.renderLivePresent && App.renderLivePresent());
            safe(() => App.renderKioskLeaderboard && App.renderKioskLeaderboard());
            safe(() => App.renderCheckinNotice && App.renderCheckinNotice());
            safe(() => App.updateNotificationBadge && App.updateNotificationBadge());
            if (App.isAdminAuthed()) {
                safe(() => App.renderMemberDirectory && App.renderMemberDirectory());
                safe(() => App.renderMemberBin && App.renderMemberBin());
                safe(() => App.renderPlans && App.renderPlans());
                safe(() => App.renderPlanBin && App.renderPlanBin());
                safe(() => App.renderSchedules && App.renderSchedules());
                safe(() => App.renderScheduleBin && App.renderScheduleBin());
                safe(() => App.renderNotifications && App.renderNotifications());
                safe(() => App.renderNotificationBin && App.renderNotificationBin());
                safe(() => App.renderVisitLog && App.renderVisitLog());
                safe(() => App.renderAdminDashboard && App.renderAdminDashboard());
                safe(() => App.renderAllPayments && App.renderAllPayments());
                safe(() => App.renderAnalyticalCalendar && App.renderAnalyticalCalendar());
            }
            safe(() => App.renderCalendarView && App.renderCalendarView('kiosk-schedule-container', false));
            if (App.isAdminAuthed()) {
                safe(() => App.renderCalendarView && App.renderCalendarView('master-schedule-container', true));
            }
            safe(() => { if (typeof window.renderSchedule === 'function') window.renderSchedule(); });
            safe(() => { if (typeof window.renderUI === 'function') window.renderUI(); });
            safe(() => { if (typeof window.updateDashboard === 'function') window.updateDashboard(); });
            safe(() => App.updateUICurrency && App.updateUICurrency());
        }

        const DB = {
            // getters
            getMembers: () => {
                const members = (STATE.members || []).map(m => Object.assign({}, m));
                if (!FSEngine.isAdminClient()) return members;
                const priv = STATE.memberPrivate || {};
                members.forEach(m => {
                    if (m.id && priv[m.id]) Object.assign(m, priv[m.id]);
                });
                return members;
            },
            getBin: () => STATE.bin || [],
            getVisits: () => STATE.visits || [],
            getPlans: () => STATE.plans || [],
            getPlanBin: () => STATE.planBin || [],
            getClosedDates: () => STATE.closedDates || [],
            getSchedules: () => STATE.schedules || [],
            getScheduleBin: () => STATE.scheduleBin || [],
            getScheduleOverrides: () => STATE.scheduleOverrides || [],
            getClassCheckins: () => STATE.classCheckins || [],
            getNotifications: () => STATE.notifications || [],
            getNotificationBin: () => STATE.notificationBin || [],
            getPayments: () => STATE.payments || [],
            getPortalName: () => STATE.portalName || '🥋 BJJ Kiosk Portal',
            getHiddenBelts: () => STATE.hiddenBelts || [],
            getCurrency: () => STATE.currency || '€',
            getCheckinNotice: () => STATE.checkinNotice || '',
            getCheckinNoticeColor: () => STATE.checkinNoticeColor || '#fde68a',
            getShowClassCheckins: () => STATE.showClassCheckins !== false,
            getMemberStatsVisibility: () => Object.assign({ totalTrainings: true, totalHours: true, avgDay: true, avgWeek: true, avgDays: true, avgDaysMonth: true, avgMonth: true, rank: true }, STATE.memberStatsVisibility || {}),
            getLeaderboardSize: () => parseInt(STATE.leaderboardSize, 10) || DEFAULT_LEADERBOARD_SIZE,

            // setters (update state and persist)
            saveMembers: (data) => {
                const members = data || [];
                const priv = STATE.memberPrivate || {};
                const updatedPrivate = new Set();
                const memberIds = new Set();
                members.forEach(m => {
                    if (!m.id) return;
                    memberIds.add(m.id);
                    const entry = {};
                    let hasPrivate = false;
                    MEMBER_PRIVATE_FIELDS.forEach(f => {
                        if (m[f] !== undefined) { entry[f] = m[f]; hasPrivate = true; delete m[f]; }
                    });
                    if (m.email !== undefined) { entry.email = m.email; hasPrivate = true; delete m.email; }
                    if (hasPrivate) { priv[m.id] = entry; updatedPrivate.add(m.id); }
                });
                Object.keys(priv).forEach(mid => {
                    if (!memberIds.has(mid)) { delete priv[mid]; updatedPrivate.add(mid); }
                });
                STATE.memberPrivate = priv;
                STATE.members = members;
                return saveToCloud();
            },
            saveBin: (data) => { STATE.bin = data || []; return saveToCloud(); },
            saveVisits: (data) => { STATE.visits = data || []; return saveToCloud(); },
            savePlans: (data) => { STATE.plans = data || []; return saveToCloud(); },
            savePlanBin: (data) => { STATE.planBin = data || []; return saveToCloud(); },
            saveClosedDates: (data) => { STATE.closedDates = data || []; return saveToCloud(); },
            saveSchedules: (data) => { STATE.schedules = data || []; return saveToCloud(); },
            saveScheduleBin: (data) => { STATE.scheduleBin = data || []; return saveToCloud(); },
            saveScheduleOverrides: (data) => { STATE.scheduleOverrides = data || []; return saveToCloud(); },
            saveClassCheckins: (data) => { STATE.classCheckins = data || []; return saveToCloud(); },
            saveNotifications: (data) => { STATE.notifications = data || []; return saveToCloud(); },
            saveNotificationBin: (data) => { STATE.notificationBin = data || []; return saveToCloud(); },
            savePayments: (data) => { STATE.payments = data || []; return saveToCloud(); },
            setPortalName: (name) => { STATE.portalName = name; return saveToCloud(); },
            setHiddenBelts: (data) => { STATE.hiddenBelts = data || []; return saveToCloud(); },
            setCurrency: (c) => { STATE.currency = c; return saveToCloud(); },
            setShowClassCheckins: (v) => { STATE.showClassCheckins = !!v; return saveToCloud(); },
            setMemberStatsVisibility: (v) => { STATE.memberStatsVisibility = v || {}; return saveToCloud(); },
            setLeaderboardSize: (n) => { STATE.leaderboardSize = parseInt(n, 10) || DEFAULT_LEADERBOARD_SIZE; return saveToCloud(); },
            setBeltColors: (c) => { STATE.beltColors = c || {}; return saveToCloud(); },
            setHideKioskSchedule: (v) => { STATE.hideKioskSchedule = !!v; return saveToCloud(); },
            getHideKioskSchedule: () => STATE.hideKioskSchedule === true,
            saveCheckinNotice: (msg) => { STATE.checkinNotice = msg || ''; return saveToCloud(); },
            saveCheckinNoticeColor: (color) => { STATE.checkinNoticeColor = color || '#fde68a'; return saveToCloud(); },

            fetchAllMemberPrivate: async (force) => {
                if (!sb || !FSEngine.isAdminClient()) return;
                await Sync.whenReady('members');
                try {
                    await Sync.loadPrivate();
                    fallbackToLocal();
                } catch (e) { console.warn('fetchAllMemberPrivate failed', e); }
            },

            exportData: () => {
                if (!FSEngine.isAdminClient()) { alert('Admin access required.'); return; }
                const members = (STATE.members || []).map(m => {
                    const entry = Object.assign({}, m);
                    if (STATE.memberPrivate && STATE.memberPrivate[m.id]) Object.assign(entry, STATE.memberPrivate[m.id]);
                    return entry;
                });
                const data = {
                    members: members, visits: STATE.visits || [], payments: STATE.payments || [],
                    plans: STATE.plans || [], planBin: STATE.planBin || [], closedDates: STATE.closedDates || [], schedules: STATE.schedules || [], scheduleBin: STATE.scheduleBin || [],
                    portalName: STATE.portalName || '🥋 BJJ Kiosk Portal', hiddenBelts: STATE.hiddenBelts || [],
                    bin: STATE.bin || [], classCheckins: STATE.classCheckins || [], notifications: STATE.notifications || [],
                    notificationBin: STATE.notificationBin || [],
                    adminPassword: null,
                    currency: STATE.currency || '€', checkinNoticeColor: STATE.checkinNoticeColor || '#fde68a',
                    checkinNotice: STATE.checkinNotice || '', showClassCheckins: STATE.showClassCheckins !== false,
                    memberStatsVisibility: STATE.memberStatsVisibility || {}
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `GymDesk_Backup_${Utils.todayLocalIso()}.json`; a.click();
            },

            importData: () => {
                if (!FSEngine.isAdminClient()) { alert('Admin access required.'); return; }
                const fileInput = document.getElementById('import-file');
                if (!fileInput.files.length) return alert('Please select a file first.');
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result) || {};
                        STATE.members = data.members || STATE.members;
                        STATE.visits = data.visits || STATE.visits;
                        STATE.payments = data.payments || STATE.payments;
                        if (data.plans) STATE.plans = data.plans;
                        if (data.planBin) STATE.planBin = data.planBin;
                        if (data.closedDates) STATE.closedDates = data.closedDates;
                        if (data.schedules) STATE.schedules = data.schedules;
                        if (data.scheduleBin) STATE.scheduleBin = data.scheduleBin;
                        if (data.notifications) STATE.notifications = data.notifications;
                        if (data.notificationBin) STATE.notificationBin = data.notificationBin;
                        if (data.portalName) STATE.portalName = data.portalName;
                        if (data.hiddenBelts) STATE.hiddenBelts = data.hiddenBelts;
                        if (data.bin) STATE.bin = data.bin;
                        if (data.classCheckins) STATE.classCheckins = data.classCheckins;
                        if (data.currency) STATE.currency = data.currency;
                        if (data.checkinNoticeColor) STATE.checkinNoticeColor = data.checkinNoticeColor;
                        if (data.checkinNotice) STATE.checkinNotice = data.checkinNotice;
                        if (data.showClassCheckins !== undefined) STATE.showClassCheckins = data.showClassCheckins;
                        if (data.memberStatsVisibility) STATE.memberStatsVisibility = data.memberStatsVisibility;

                        const priv = STATE.memberPrivate || {};
                        (STATE.members || []).forEach(m => {
                            if (!m.id) return;
                            const entry = {};
                            let hasPrivate = false;
                            MEMBER_PRIVATE_FIELDS.forEach(f => {
                                if (m[f] !== undefined) { entry[f] = m[f]; hasPrivate = true; delete m[f]; }
                            });
                            if (m.email !== undefined) { entry.email = m.email; hasPrivate = true; delete m.email; }
                            if (hasPrivate) priv[m.id] = entry;
                        });
                        STATE.memberPrivate = priv;

                        saveToCloud().then(() => {
                            alert('Backup restored successfully!');
                            location.reload();
                        }).catch(() => {
                            fallbackToLocal();
                            alert('Backup restored locally (cloud save failed).');
                            location.reload();
                        });

                    } catch (err) { alert('Error parsing JSON file.'); }
                };
                reader.readAsText(fileInput.files[0]);
            },

            resyncAll: () => {
                if (!FSEngine.isAdminClient()) return alert('Admin access required.');
                FSEngine.resyncAll();
                alert('Supabase data reloading — the view should refresh within a few seconds.');
            }
        };

        const Utils = {
            formatDate: (dateStr) => {
                if (!dateStr) return 'N/A';
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return 'N/A';
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                return `${dd}/${mm}/${yyyy}`;
            },
            dateToLocalIso: (date) => {
                if (!date) return '';
                const d = date instanceof Date ? date : new Date(date);
                if (isNaN(d.getTime())) return '';
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            },
            todayLocalIso: () => Utils.dateToLocalIso(new Date()),
            currentMonthLocal: () => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            },
            toLocalDatetimeInput: (iso) => {
                if (!iso) return '';
                const d = new Date(iso);
                if (isNaN(d.getTime())) return '';
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            },
            formatDateLocalized: (dateStr, lang = 'en') => {
                if (!dateStr) return 'N/A';
                try {
                    const locale = lang === 'el' ? 'el-GR' : 'en-GB';
                    return new Date(dateStr).toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
                } catch (e) {
                    return Utils.formatDate(dateStr);
                }
            },
            formatTime: (dateStr) => { if (!dateStr) return '--:--'; return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); },
            getDaysRemaining: (expDateStr) => { 
                if (!expDateStr) return -1;
                const expDate = new Date(expDateStr + 'T23:59:59'); 
                const now = new Date();
                return Math.floor((expDate - now) / (1000 * 60 * 60 * 24)); 
            },
            // Parse a date-only string (YYYY-MM-DD) as the local start/end of that day.
            // new Date('YYYY-MM-DD') would parse as UTC midnight, shifting the boundary
            // by the UTC offset (3h for Greece) and mis-classifying visits near midnight.
            dayStart: (dateStr) => { if (!dateStr) return null; const d = new Date(dateStr + 'T00:00:00'); return isNaN(d.getTime()) ? null : d; },
            dayEnd: (dateStr) => { if (!dateStr) return null; const d = new Date(dateStr + 'T23:59:59.999'); return isNaN(d.getTime()) ? null : d; },
            formatDurationMins: (mins) => {
                if (mins == null || isNaN(mins)) return '';
                if (mins < 0) mins = 0;
                return mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins}m`;
            },
            calcDuration: (entry, exit) => {
                if (!exit) return 'In Progress';
                const mins = Math.round((new Date(exit) - new Date(entry)) / 60000);
                return Utils.formatDurationMins(mins);
            },
            escapeHTML: (str) => { if (!str) return ''; const div = document.createElement('div'); div.innerText = str; return div.innerHTML; },
            sortKey: (str) => String(str == null ? '' : str)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/ς/g, 'σ'),
            isGreek: (str) => /[\u0370-\u03FF]/.test(String(str == null ? '' : str)),
            normalizeSearch: (str) => Utils.sortKey(str),
            renderRichText: (text) => {
                if (!text) return '';
                const normalized = text.replace(/\r\n?/g, '\n');
                const escaped = Utils.escapeHTML(normalized);
                const escapedWithBreaks = escaped.replace(/<br\s*\/?>/gi, '\n');
                const inline = escapedWithBreaks
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.+?)\*/g, '<em>$1</em>');
                const lines = inline.split('\n');
                let html = '';
                let inList = false;
                lines.forEach(line => {
                    const trimmed = line.trim();
                    const listMatch = trimmed.match(/^[-•]\s+(.*)$/);
                    if (listMatch) {
                        if (!inList) {
                            inList = true;
                            html += '<ul style="margin:0.5rem 0 0.75rem 1.25rem; padding-left: 0;">';
                        }
                        html += `<li style="margin-bottom:0.35rem;">${listMatch[1]}</li>`;
                    } else {
                        if (inList) {
                            html += '</ul>';
                            inList = false;
                        }
                        if (trimmed === '') {
                            html += '<br>';
                        } else {
                            html += `<p style="margin:0 0 0.75rem 0;">${trimmed}</p>`;
                        }
                    }
                });
                if (inList) html += '</ul>';
                return html;
            },
            renderRichHtml: (text) => {
                if (!text) return '';
                const normalized = text.replace(/\r\n?/g, '\n');
                return normalized.replace(/\n/g, '<br>');
            },
            renderPlanDescription: (text, allowHtml) => {
                if (allowHtml) return Utils.renderRichHtml(text);
                return Utils.renderRichText(text);
            },
            formatPlanValidity: (plan) => {
                const daysValue = plan && plan.days != null && plan.days !== '' ? parseInt(plan.days, 10) : NaN;
                const hasDays = !Number.isNaN(daysValue) && daysValue > 0;
                const hasSessions = plan && plan.sessions != null && plan.sessions !== '';
                if (hasDays) {
                    return `${daysValue} Days${hasSessions ? ` | Sessions: ${Utils.escapeHTML(plan.sessions)}` : ''}`;
                }
                if (hasSessions) {
                    return `Sessions Only (${Utils.escapeHTML(plan.sessions)})`;
                }
                return 'No validity configured';
            },
            convertTo12Hour: (time24) => {
                if(!time24) return '';
                let [hours, minutes] = time24.split(':');
                let h = parseInt(hours);
                let ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12 || 12;
                return `${h}:${minutes} ${ampm}`;
            },
            calcAge: (dob) => {
                if(!dob) return 'N/A';
                return Math.floor((new Date() - new Date(dob)) / 31557600000);
            },
            getBeltBadge: (rawBelt) => {
                const b = rawBelt || 'White';
                const baseBelt = b.split('/')[0].trim();
                const beltClass = baseBelt.toLowerCase();
                return `<span class="belt-badge belt-${beltClass}">${baseBelt}</span>`;
            },
            getBeltBox: (rawBelt) => {
                const b = rawBelt || 'White';
                const baseBelt = b.split('/')[0].trim();
                const beltClass = baseBelt.toLowerCase();
                return `<span class="belt-box belt-${beltClass}" aria-label="${baseBelt}"></span>`;
            },
            getBeltColor: (rawBelt) => {
                const baseBelt = ((rawBelt || 'White').split('/')[0].trim());
                const colors = STATE.beltColors || DEFAULT_BELT_COLORS;
                return colors[baseBelt] || DEFAULT_BELT_COLORS[baseBelt] || '#ffffff';
            },
            getMemberIdBadge: (m) => {
                const beltBase = (m && m.belt) ? m.belt.split('/')[0].trim() : 'White';
                const beltClass = beltBase.toLowerCase();
                const id = (m && m.id) ? m.id : '—';
                return `<span class="belt-badge belt-${beltClass}" style="width: 84px; text-align: center; overflow-wrap: anywhere;">${Utils.escapeHTML(id)}</span>`;
            },
            buildClosedSet: (forYear) => {
                const closedList = DB.getClosedDates();
                const closed = new Set();
                closedList.forEach(c => {
                    const entry = typeof c === 'string' ? { date: c } : c;
                    const startStr = entry.date;
                    const endStr   = entry.dateEnd || entry.date;
                    const repeat   = !!entry.repeat;

                    const [sy, sm, sd] = startStr.split('-').map(Number);
                    const [ey, em, ed] = endStr.split('-').map(Number);

                    const maxYear = (repeat && forYear) ? Math.max(forYear, sy) : sy;
                    for (let yr = sy; yr <= maxYear; yr++) {
                        const yearOffset = yr - sy;
                        let cur = new Date(Date.UTC(sy + yearOffset, sm - 1, sd));
                        const end = new Date(Date.UTC(ey + yearOffset, em - 1, ed));
                        while (cur <= end) {
                            closed.add(cur.toISOString().split('T')[0]);
                            cur.setUTCDate(cur.getUTCDate() + 1);
                        }
                    }
                });
                return closed;
            },
            calculateExpirationDate: (startDateStr, durationDays) => {
                if (!startDateStr || !durationDays) return '';
                let current = new Date(startDateStr);
                let daysLeft = parseInt(durationDays);

                let count = 0;
                let ymd = current.toISOString().split('T')[0];
                const closedSet = Utils.buildClosedSet(new Date(startDateStr).getUTCFullYear() + 5);

                if (!closedSet.has(ymd)) count++;
                while (count < daysLeft) {
                    current.setUTCDate(current.getUTCDate() + 1);
                    ymd = current.toISOString().split('T')[0];
                    if (!closedSet.has(ymd)) count++;
                }
                return ymd;
            }
        };


        const App = {
            kioskMsgTimer: null,
            draftClassSlots: [], 
            currentUser: null,
            attendanceDays: 90,
            authUser: null,
            adminAuthed: false,
            adminListenersBound: false,
            dirSortCol: 'lastName',
            dirSortAsc: true,
            dirStatus: 'active',
            retentionSortCol: 'perWeek',
            retentionSortAsc: true,
            pendingCheckinMember: null,
            pendingAdminCheckin: null,
            isMobileCheckinMode: false,
            columnsConfig: (() => {
                try {
                    const saved = JSON.parse(localStorage.getItem('gym_columns_config'));
                    if (Array.isArray(saved) && saved.length > 0) return saved;
                } catch (e) {}
                return [
                    {id: 'firstName', label: 'First Name', checked: true},
                    {id: 'lastName', label: 'Last Name', checked: true},
                    {id: 'id', label: 'ID', checked: true},
                    {id: 'gender', label: 'Gender', checked: false},
                    {id: 'age', label: 'Age', checked: true},
                    {id: 'phone', label: 'Phone', checked: true},
                    {id: 'status', label: 'Account Status', checked: true},
                    {id: 'exp', label: 'Expiration', checked: true},
                    {id: 'last-visit', label: 'Last Training', checked: false}
                ];
            })(),
            draggedColIndex: null,
            visitTimeoutHours: 1,
            computeExpectedExitTime: (entryIso, selectedClasses = [], forceDefault = false) => {
                const now = entryIso ? new Date(entryIso) : new Date();

                if (selectedClasses && selectedClasses.length > 0) {
                    let latestEndMs = 0;
                    selectedClasses.forEach(sel => {
                        if (!sel.slotEnd) return;
                        const [eh, em] = sel.slotEnd.split(':').map(Number);
                        const endDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em);
                        if (endDt.getTime() > latestEndMs) {
                            latestEndMs = endDt.getTime();
                        }
                    });
                    if (latestEndMs > 0) {
                        return new Date(latestEndMs + (15 * 60 * 1000)).toISOString();
                    }
                }

                if (forceDefault) {
                    const hours = App.visitTimeoutHours || 1;
                    return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
                }

                const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const todayName = dayNames[now.getDay()];
                const schedules = DB.getSchedules() || [];
                for (const cls of schedules) {
                    for (const slot of (cls.slots || [])) {
                        if (slot.day !== todayName) continue;
                        const [sh, sm] = (slot.start || '00:00').split(':').map(Number);
                        const [eh, em] = (slot.end || '00:00').split(':').map(Number);
                        const startDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm);
                        const endDt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em);
                        if (now >= startDt && now <= endDt) {
                            return new Date(endDt.getTime() + (15 * 60 * 1000)).toISOString();
                        }
                    }
                }
                const hours = App.visitTimeoutHours || 1;
                return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
            },
            // Effective check-out time for display. If the visit was never explicitly closed
            // (exit_time null) but its expected window has passed (e.g. the auto-checkout cron
            // hasn't run), treat the expected exit as the checkout time so it stops showing
            // "still inside". Returns null only when genuinely still open.
            getVisitEffectiveExit: (visit) => {
                if (!visit) return null;
                if (visit.exitTime) return visit.exitTime;
                if (visit.expectedExitTime && new Date(visit.expectedExitTime) <= new Date()) {
                    return visit.expectedExitTime;
                }
                return null;
            },
            getClassStartTime: (checkin) => {
                if (!checkin) return null;
                let y = null, mo = null, d = null;
                if (checkin.slotDate) {
                    const parts = checkin.slotDate.split('-').map(Number);
                    y = parts[0]; mo = parts[1]; d = parts[2];
                }
                let hh = 0, mm = 0;
                if (checkin.slotStart) {
                    const t = checkin.slotStart.split(':').map(Number);
                    hh = t[0] || 0; mm = t[1] || 0;
                }
                if (y == null || isNaN(y) || isNaN(mo) || isNaN(d)) return null;
                return new Date(y, mo - 1, d, hh, mm, 0, 0);
            },
            getVisitVisibleWindows: (visit) => {
                const windows = [];
                if (!visit || !visit.id) return windows;
                const checkins = DB.getClassCheckins().filter(c => c.visitId === visit.id);
                checkins.forEach(c => {
                    const start = App.getClassStartTime(c);
                    if (!start) return;
                    let end = null;
                    if (c.slotEnd) {
                        const t = c.slotEnd.split(':').map(Number);
                        end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), t[0] || 0, t[1] || 0, 0, 0);
                    }
                    if (!end || isNaN(end.getTime())) {
                        end = new Date(start.getTime() + 60 * 60 * 1000);
                    }
                    windows.push({
                        from: new Date(start.getTime() - 30 * 60 * 1000),
                        until: new Date(end.getTime() + 15 * 60 * 1000)
                    });
                });
                return windows;
            },
            isVisitVisibleNow: (visit, now) => {
                const windows = App.getVisitVisibleWindows(visit);
                if (windows.length === 0) return true;
                const t = now.getTime();
                return windows.some(w => t >= w.from.getTime() && t <= w.until.getTime());
            },
            calcVisitDuration: (visit) => {
                if (!visit || !visit.id) return Utils.calcDuration(visit && visit.entryTime, visit && visit.exitTime);
                const effExit = App.getVisitEffectiveExit(visit);
                if (!effExit) return 'In Progress';
                const checkins = DB.getClassCheckins().filter(c => c.visitId === visit.id);
                if (checkins.length === 0) return Utils.calcDuration(visit.entryTime, effExit);
                let minStart = null;
                let maxEnd = null;
                checkins.forEach(c => {
                    const start = App.getClassStartTime(c);
                    if (!start) return;
                    if (!minStart || start.getTime() < minStart.getTime()) minStart = start;
                    let end = null;
                    if (c.slotEnd) {
                        const t = c.slotEnd.split(':').map(Number);
                        end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), t[0] || 0, t[1] || 0, 0, 0);
                    }
                    if (!end || isNaN(end.getTime())) {
                        end = new Date(start.getTime() + 60 * 60 * 1000);
                    }
                    if (!maxEnd || end.getTime() > maxEnd.getTime()) maxEnd = end;
                });
                if (minStart && maxEnd) {
                    return Utils.formatDurationMins(Math.round((maxEnd.getTime() - minStart.getTime()) / 60000));
                }
                return Utils.calcDuration(visit.entryTime, effExit);
            },
            computeVisitUnpaid: (member) => {
                if (!member) return true;
                if (member.accountStatus === 'Frozen') return true;
                if (member.accountStatus === 'Cancelled') return true;
                if (member.accountStatus === 'Inactive') return true;
                const planDays = member.planDays != null ? parseInt(member.planDays, 10) : null;
                if (planDays && member.expirationDate && Utils.getDaysRemaining(member.expirationDate) >= 0) return false;
                if (member.sessionsTotal) return (parseInt(member.sessionsLeft) || 0) <= 0;
                if (planDays) return true;
                if (member.expirationDate && Utils.getDaysRemaining(member.expirationDate) >= 0) return false;
                return true;
            },
            normalizeScheduleSlotId: (classId, slotDay, slotStart, slotEnd) => {
                const rawId = `checkin-slot-${classId}-${slotDay}-${slotStart}-${slotEnd}`;
                return rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
            },
            getWeekdayDateForCurrentWeek: (dayName) => {
                if (!dayName) return null;
                const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
                const targetIndex = days.indexOf(dayName);
                if (targetIndex === -1) return null;
                const now = new Date();
                const currentDayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
                const offset = targetIndex - currentDayIndex;
                const date = new Date(now);
                date.setDate(now.getDate() + offset);
                return date;
            },

            // ---------- ADMIN AUTH & VIEW GATING ----------
            isAdminAuthed: () => !!App.adminAuthed,

            initAuth: () => {
                const auth = getAuth();
                if (!auth) {
                    console.warn('Supabase Auth not available — admin login disabled.');
                    return;
                }
                let lastAdmin = null;
                auth.onAuthStateChanged(async (user) => {
                    App.authUser = user || null;
                    const isAdmin = await isAdminUser(user);
                    // Only react to real admin-status transitions. Supabase fires
                    // onAuthStateChange for TOKEN_REFRESHED / INITIAL_SESSION etc., which
                    // previously re-ran unlockAdmin() and yanked the admin back to Staff Check-in.
                    if (isAdmin === lastAdmin) return;
                    lastAdmin = isAdmin;
                    if (isAdmin) {
                        App.unlockAdmin();
                    } else {
                        App.lockAdmin();
                    }
                });
            },

            bindAdminListeners: () => {
                if (App.adminListenersBound) return;
                const bind = (id, evt, fn) => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener(evt, fn);
                };
                bind('checkin-search', 'input', App.handleAdminCheckinSearch);
                bind('member-form', 'submit', App.saveMember);
                bind('plan-form', 'submit', App.savePlan);
                bind('visit-form', 'submit', App.saveVisitEdit);
                bind('payment-form', 'submit', App.savePayment);
                App.adminListenersBound = true;
            },

            lockAdmin: () => {
                const wasAuthed = App.adminAuthed;
                App.adminAuthed = false;
                App.adminListenersBound = false;
                Sync.unsubscribeRealtime();
                const adminView = document.getElementById('view-admin');
                if (adminView) {
                    adminView.classList.add('hidden');
                    document.querySelectorAll('.view-pane').forEach(el => el.classList.add('hidden'));
                }
                const memberVisible = document.getElementById('view-member') && !document.getElementById('view-member').classList.contains('hidden');
                const mobileVisible = document.getElementById('view-mobile-checkin') && !document.getElementById('view-mobile-checkin').classList.contains('hidden');
                if (!memberVisible && !mobileVisible) {
                    document.querySelectorAll('.app-container').forEach(el => el.classList.add('hidden'));
                    const kiosk = document.getElementById('view-kiosk');
                    if (kiosk) kiosk.classList.remove('hidden');
                }
                App.closeModal('modal-login');
                App.renderCheckinNotice && App.renderCheckinNotice();
                if (wasAuthed) App.clearSensitiveData();
            },

            clearSensitiveData: () => {
                STATE.memberPrivate = {};
                DB._privateSignature = undefined;
                STATE.payments = [];
                STATE.notifications = [];
                STATE.notificationBin = [];
                STATE.bin = [];
                if (STATE.members) {
                    STATE.members.forEach(m => {
                        MEMBER_PRIVATE_FIELDS.forEach(f => { delete m[f]; });
                        delete m.email;
                    });
                }
                localStorage.removeItem('gym_member_private');
                localStorage.removeItem('gym_payments');
                localStorage.removeItem('gym_notifications');
                localStorage.removeItem('gym_notification_bin');
                localStorage.removeItem('gym_bin');
                // Clear the in-memory sync mirrors too, so a later flush can never
                // treat these wiped collections as deleted and hard-delete the
                // rows from Supabase (which would permanently destroy payments).
                Sync.mirrors.payments = new Map();
                Sync.mirrors.notifications = new Map();
                Sync.mirrors.notificationBin = new Map();
                Sync.mirrors.bin = new Map();
                Sync.ready.payments = false;
                Sync.ready.notifications = false;
                fallbackToLocal();
            },

            unlockAdmin: () => {
                const wasLocked = !App.adminAuthed;
                App.adminAuthed = true;
                const adminView = document.getElementById('view-admin');
                if (!adminView) {
                    console.warn('Admin view not found in DOM — cannot unlock admin portal.');
                    App.adminAuthed = false;
                    return;
                }
                App.bindAdminListeners();
                if (!wasLocked) return; // already unlocked — don't re-navigate or re-load
                Sync.loadAdminOnly()
                    .then(() => {
                        Sync.subscribeRealtime();
                        scheduleAfterCloudSyncRender();
                    })
                    .catch(err => console.warn('Admin unlock load failed:', err));
                App.renderColorPaletteUI && App.renderColorPaletteUI();
                App.renderColumnConfigurator && App.renderColumnConfigurator();
                const monthInput = document.getElementById('export-month-picker');
                if (monthInput && !monthInput.value) monthInput.value = Utils.currentMonthLocal();
                const memberVisible = document.getElementById('view-member') && !document.getElementById('view-member').classList.contains('hidden');
                const mobileVisible = document.getElementById('view-mobile-checkin') && !document.getElementById('view-mobile-checkin').classList.contains('hidden');
                if (!memberVisible && !mobileVisible) {
                    document.querySelectorAll('.app-container').forEach(el => el.classList.add('hidden'));
                    const kiosk = document.getElementById('view-kiosk');
                    if (kiosk) kiosk.classList.add('hidden');
                    if (adminView) adminView.classList.remove('hidden');
                    App.navigate('admin-checkin');
                }
            },

            reconcileAllMemberPayments: () => {
                const memberIds = new Set(DB.getPayments().map(p => p.memberId));
                memberIds.forEach(mid => {
                    try { App.reconcileMemberPaymentVisitStatus(mid); } catch (e) { console.warn('Startup reconciliation failed for', mid, e); }
                });
            },

            applyBeltColors: () => {
                let el = document.getElementById('belt-color-overrides');
                if (!el) {
                    el = document.createElement('style');
                    el.id = 'belt-color-overrides';
                    document.head.appendChild(el);
                }
                const colors = Object.assign({}, DEFAULT_BELT_COLORS, STATE.beltColors || {});
                el.textContent = Object.keys(colors).map(b => {
                    const cls = String(b).toLowerCase();
                    return `.belt-box.belt-${cls}, .belt-badge.belt-${cls} { background: ${colors[b]}; }`;
                }).join('');
            },

            applyKioskScheduleVisibility: () => {
                const card = document.getElementById('kiosk-schedule-card');
                if (card) card.classList.toggle('hidden', STATE.hideKioskSchedule === true);
            },

            init: () => {
                App.cleanBin(); 
                App.updateUICurrency();
                App.applyBeltColors();
                App.applyKioskScheduleVisibility();
 
                App.bindAdminListeners();
                 
                document.getElementById('kiosk-title-display').innerText = DB.getPortalName();
 
                const persistedMonth = localStorage.getItem('gym_analytical_month');
                const nowYm = Utils.currentMonthLocal();
                document.getElementById('export-month-picker').value = persistedMonth || nowYm;
 
                App.renderColorPaletteUI();
                App.renderLivePresent(); 
                App.renderKioskLeaderboard();
                App.renderCheckinNotice();
                App.updateNotificationBadge();
                App.renderCalendarView('kiosk-schedule-container', false);
                App.updateKioskInputMode();
                document.getElementById('kiosk-id-input').focus();
                App.cleanupClassCheckins();
                if (typeof App.setKioskChartRange === 'function') {
                    const saved = localStorage.getItem('kiosk_chart_range');
                    App.chartRange = ['period', 'all'].includes(saved) ? saved : 'period';
                    const rangeBtn = document.querySelector('.kiosk-chart-range-btn[data-range="' + App.chartRange + '"]');
                    if (rangeBtn) rangeBtn.classList.add('active');
                    App.renderKioskChart && App.renderKioskChart();
                }
 
                if (typeof App.setKioskLanguage === 'function') App.setKioskLanguage(localStorage.getItem('kiosk_lang') || 'en');
                 
                App.renderColumnConfigurator();
                window.addEventListener('resize', App.updateKioskInputMode);
                window.addEventListener('orientationchange', App.updateKioskInputMode);
                let chartRz = null;
                window.addEventListener('resize', () => {
                    clearTimeout(chartRz);
                    chartRz = setTimeout(() => { try { App.renderKioskChart(); } catch (e) {} }, 150);
                });

                // Boot: restore any persisted auth session, then hydrate STATE from
                // Supabase and start realtime. No anonymous sign-in is required —
                // the anon key is implicit and RLS enforces permissions.
                App.adminAuthed = false;
                const adminView = document.getElementById('view-admin');
                if (adminView) adminView.classList.add('hidden');
                App.initAuth();

                if (!sb) {
                    console.warn('Supabase client not available — running from localStorage only.');
                    return;
                }
                Sync.loadAll()
                    .then(() => {
                        resolveMigrationState();
                        Sync.subscribeRealtime();
                        fallbackToLocal();
                        scheduleAfterCloudSyncRender();
                    })
                    .catch(err => console.warn('Initial data load failed:', err));

                // Stale-visit auto-checkout is handled server-side by the pg_cron
                // "auto-checkout-visits" job; the client only runs the dormancy check.
                setInterval(() => {
                    App.autoDeactivateDormant && App.autoDeactivateDormant();
                }, 60000);

                App.renderCheckinQR();
                const queryParams = new URLSearchParams(window.location.search);
                if (queryParams.has('checkin')) {
                    App.showMobileCheckinView();
                }
            },

            cleanBin: () => {
                const bin = DB.getBin();
                const now = new Date();
                const filtered = bin.filter(m => (now - new Date(m.deletedAt)) < (365 * 24 * 60 * 60 * 1000));
                DB.saveBin(filtered);
            },

        };

window.App = App;
window.DB = DB;
window.Utils = Utils;
window.FSEngine = FSEngine;
