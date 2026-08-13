// =====================================================================
// transform.js — GymDesk Firestore → Supabase migration, Step 2 of 3.
// Reads migration/export/firestore-export.json and writes one JSON file
// per target table under migration/transformed/, mapping the legacy
// camelCase Firestore records onto the snake_case relational schema
// (see supabase/migrations/20260813000001_init.sql).
//
// Usage:
//   node transform.js
// =====================================================================
const fs = require('fs');
const path = require('path');

const IN = path.join(__dirname, 'export', 'firestore-export.json');
const OUT_DIR = path.join(__dirname, 'transformed');

if (!fs.existsSync(IN)) {
  console.error(`Missing ${IN}. Run export.js first.`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));

// ── value coercion helpers ──────────────────────────────────────────
const toDate = v => (v && v !== '') ? v : null;
const toInt = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};
const toBool = v => !!v;
const toNum = v => (v === null || v === undefined || v === '') ? 0 : parseFloat(v);
const toTs = v => (v && v !== '') ? v : null;
const lower = v => (typeof v === 'string' ? v.toLowerCase() : v);

// ── members + member_private ────────────────────────────────────────
const PRIVATE_FIELDS = ['phone', 'dob', 'notes'];
function memberRows() {
  const members = [];
  const privRows = [];
  const privById = {};
  (raw.memberPrivate || []).forEach(p => { privById[p.memberId] = p.data || {}; });

  (raw.members || []).forEach(m => {
    const d = m.data || {};
    const id = d.id || m.id;

    members.push({
      id,
      first_name: d.firstName || '',
      last_name: d.lastName || '',
      gender: d.gender || null,
      belt: d.belt || 'White',
      expiration_date: toDate(d.expirationDate),
      account_status: lower(d.accountStatus) || 'active',
      sessions_total: toBool(d.sessionsTotal),
      sessions_left: Math.max(0, toInt(d.sessionsLeft) ?? 0),
      plan_days: toInt(d.planDays),
      hide_from_leaderboard: toBool(d.hideFromLeaderboard),
      trial_participant: toBool(d.trialParticipant),
      trial_converted: toBool(d.trialConverted)
    });

    const sub = privById[id] || {};
    const priv = {};
    PRIVATE_FIELDS.forEach(f => {
      const v = (sub[f] !== undefined && sub[f] !== null) ? sub[f] : d[f];
      if (v !== undefined && v !== null && v !== '') priv[f] = v;
    });
    if (d.email && d.email !== '') priv.email = d.email;

    if (Object.keys(priv).length > 0) {
      privRows.push({ member_id: id, ...priv });
    }
  });

  return { members, member_private: privRows };
}

// ── visits ──────────────────────────────────────────────────────────
function visitRows() {
  return (raw.visits || []).map(v => {
    const d = v.data || {};
    return {
      id: d.id || v.id,
      member_id: d.memberId,
      entry_time: toTs(d.entryTime) || new Date().toISOString(),
      expected_exit_time: toTs(d.expectedExitTime),
      exit_time: toTs(d.exitTime),
      is_unpaid: toBool(d.isUnpaid),
      paid_override: d.paidOverride || null,
      class_ids: Array.isArray(d.classIds) ? d.classIds : []
    };
  }).filter(r => r.member_id);
}

// ── class check-ins ─────────────────────────────────────────────────
function classCheckinRows() {
  return (raw.classCheckins || []).map(c => {
    const d = c.data || {};
    return {
      id: d.id || c.id,
      visit_id: d.visitId,
      member_id: d.memberId,
      class_id: d.classId,
      slot_date: toDate(d.slotDate),
      slot_day: d.slotDay || null,
      slot_start: (d.slotStart && d.slotStart !== '') ? d.slotStart : null,
      slot_end: (d.slotEnd && d.slotEnd !== '') ? d.slotEnd : null,
      entry_time: toTs(d.entryTime)
    };
  }).filter(r => r.member_id);
}

// ── schedules + schedule_slots ──────────────────────────────────────
function scheduleRows() {
  const schedules = [];
  const slots = [];
  const items = (raw.schedules && Array.isArray(raw.schedules.items)) ? raw.schedules.items : [];
  items.forEach((cls, i) => {
    const id = cls.id || `SCHED-${i}`;
    schedules.push({
      id,
      name: cls.name || '',
      description: cls.description || null,
      description_html: false,
      practitioners: cls.practitioners || null,
      requirements: cls.requirements || null,
      color: cls.color || '#2563eb',
      capacity: cls.capacity || null,
      is_public: cls.isPublic !== false
    });
    (cls.slots || []).forEach((s, j) => {
      slots.push({
        id: s.id || `${id}-SLOT-${j}`,
        schedule_id: id,
        day: s.day || null,
        start: s.start || '00:00',
        end: s.end || '00:00'
      });
    });
  });
  return { schedules, schedule_slots: slots };
}

// ── closed dates ────────────────────────────────────────────────────
function closedDateRows() {
  const items = (raw.closedDates && Array.isArray(raw.closedDates.items)) ? raw.closedDates.items : [];
  return items.map((c, i) => {
    const e = typeof c === 'string' ? { date: c } : c;
    return {
      id: `CD-${i}`,
      date: e.date,
      date_end: e.dateEnd || null,
      repeat: toBool(e.repeat)
    };
  });
}

// ── plans ───────────────────────────────────────────────────────────
function planRows() {
  return (raw.plans || []).map(p => {
    const d = p.data || {};
    return {
      id: d.id || p.id,
      name: d.name || '',
      description: d.description || null,
      description_html: toBool(d.descriptionHtml),
      days: toInt(d.days),
      sessions: toInt(d.sessions),
      price: toNum(d.price),
      color: d.color || '#2563eb',
      is_public: d.isPublic !== false,
      starred: toBool(d.starred),
      is_trial: toBool(d.isTrial)
    };
  });
}

// ── payments ────────────────────────────────────────────────────────
function paymentRows() {
  return (raw.payments || []).map(p => {
    const d = p.data || {};
    return {
      id: d.id || p.id,
      member_id: d.memberId,
      date: d.date || new Date().toISOString().slice(0, 10),
      amount: toNum(d.amount),
      note: d.note || null,
      plan_id: d.planId || null,
      sessions_granted: toInt(d.sessionsGranted),
      applied_expiration: toDate(d.appliedExpiration),
      applied_start_date: toDate(d.appliedStartDate),
      prev_expiration: toDate(d.prevExpiration),
      cleared_visit_ids: Array.isArray(d.clearedVisitIds) ? d.clearedVisitIds : []
    };
  }).filter(r => r.member_id);
}

// ── notifications ───────────────────────────────────────────────────
function notificationRows() {
  return (raw.notifications || []).map(n => {
    const d = n.data || {};
    return {
      id: d.id || n.id,
      title: d.title || '',
      msg: d.msg || null,
      type: d.type || 'info',
      date: toTs(d.date) || new Date().toISOString(),
      read: toBool(d.read),
      member_id: d.memberId || null
    };
  });
}

// ── recycle bins ────────────────────────────────────────────────────
const BIN_MAP = { bin: 'member', planBin: 'plan', scheduleBin: 'schedule', notificationBin: 'notification' };
function binRows() {
  const rows = [];
  Object.keys(BIN_MAP).forEach(col => {
    (raw[col] || []).forEach(d => {
      const data = d.data || {};
      rows.push({
        entity_type: BIN_MAP[col],
        original_id: data.id || d.id,
        payload: data,
        deleted_at: data.deletedAt || new Date().toISOString()
      });
    });
  });
  return rows;
}

// ── settings ────────────────────────────────────────────────────────
const SETTINGS_MAP = {
  portalName: 'portal_name',
  hiddenBelts: 'hidden_belts',
  currency: 'currency',
  checkinNotice: 'checkin_notice',
  checkinNoticeColor: 'checkin_notice_color',
  showClassCheckins: 'show_class_checkins',
  memberStatsVisibility: 'member_stats_visibility'
};
function settingRows() {
  const rows = [];
  Object.keys(SETTINGS_MAP).forEach(k => {
    if (raw.settings[k] !== undefined) {
      rows.push({ key: SETTINGS_MAP[k], value: raw.settings[k] });
    }
  });
  return rows;
}

// ── write outputs ───────────────────────────────────────────────────
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { members, member_private } = memberRows();
  const { schedules, schedule_slots } = scheduleRows();

  // Placeholder members for orphaned references (visits / check-ins / payments /
  // notifications that reference members deleted from Firestore). Preserves the
  // visit history and satisfies the foreign-key constraints.
  const knownIds = new Set(members.map(m => m.id));
  const orphanIds = new Set();
  ['visits', 'payments', 'classCheckins', 'notifications'].forEach(col => {
    (raw[col] || []).forEach(d => {
      const id = (d.data || {}).memberId;
      if (id && !knownIds.has(id)) orphanIds.add(id);
    });
  });
  orphanIds.forEach(id => {
    members.push({
      id,
      first_name: '(Deleted',
      last_name: 'Member)',
      gender: null,
      belt: 'White',
      expiration_date: null,
      account_status: 'inactive',
      sessions_total: false,
      sessions_left: 0,
      plan_days: null,
      hide_from_leaderboard: true,
      trial_participant: false,
      trial_converted: false
    });
    console.log('Placeholder member for orphaned id', id);
  });

  const tables = {
    members,
    member_private,
    visits: visitRows(),
    class_checkins: classCheckinRows(),
    schedules,
    schedule_slots,
    closed_dates: closedDateRows(),
    plans: planRows(),
    payments: paymentRows(),
    notifications: notificationRows(),
    bins: binRows(),
    settings: settingRows()
  };

  Object.keys(tables).forEach(name => {
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(tables[name], null, 2));
  });

  const summary = Object.keys(tables)
    .map(k => `${k}=${tables[k].length}`)
    .join(', ');
  console.log(`Transformed → ${OUT_DIR}`);
  console.log(`Summary: ${summary}`);
}

main();
