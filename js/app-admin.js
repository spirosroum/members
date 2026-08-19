// =====================================================================
// app-admin.js
// App methods: setRetentionPeriod, setRetentionSort, renderRetentionStats, renderRetentionTable, exportRetentionExcel, getMemberFirstTrainingDate, getMemberJoinDate, renderKPIs, sendAdminPasswordReset, renderAdminDashboard, renderAnalyticalCalendar, filterVisitsByDate, exportMonthlyExcel, getVisitPaidByInfo, renderVisitLog, openVisitEditModal, saveVisitEdit, deleteVisitFromModal, searchDashboardHistory, renderAdminSettings, updatePortalName, updateCurrency, saveBeltVisibility, saveClassCheckinsVisibility, renderMemberSettings, saveMemberStatsVisibility, repairDuplicateMembers
// Plain script (no ES modules). Methods attach to the global App object
// created in app-core.js. Load order is fixed in index.html.
// =====================================================================
Object.assign(App, {
            // --- ADMIN DASHBOARD & LOG ---
            // --- RETENTION & ATTENDANCE ---
            setRetentionPeriod: (weeks) => {
                App.retentionPeriodWeeks = weeks;
                const isCustom = weeks === 'custom';
                document.querySelectorAll('.retention-period-btn').forEach(b => {
                    const matches = isCustom ? b.dataset.custom === '1' : parseInt(b.dataset.weeks, 10) === weeks;
                    b.classList.toggle('active', !!matches);
                });
                const customRange = document.getElementById('retention-custom-range');
                if (customRange) customRange.classList.toggle('hidden', !isCustom);
                App.renderKPIs();
                App.renderRetentionStats();
            },

            onRetentionCustomChange: () => {
                App.retentionPeriodWeeks = 'custom';
                document.querySelectorAll('.retention-period-btn').forEach(b =>
                    b.classList.toggle('active', b.dataset.custom === '1'));
                const customRange = document.getElementById('retention-custom-range');
                if (customRange) customRange.classList.remove('hidden');
                App.renderKPIs();
                App.renderRetentionStats();
            },

            // Resolves the active analysis window to {since, until} Date objects.
            // Preset buttons map to trailing N weeks ending today; Custom uses the
            // date inputs (falling back to 3 months when only one is set).
            getRetentionWindow: () => {
                let until = new Date();
                let since;
                if (App.retentionPeriodWeeks === 'custom') {
                    const startVal = document.getElementById('retention-custom-start').value;
                    const endVal = document.getElementById('retention-custom-end').value;
                    const start = startVal ? new Date(startVal + 'T00:00:00') : null;
                    const end = endVal ? new Date(endVal + 'T23:59:59') : null;
                    if (start && end) { since = start; until = end; }
                    else if (start) { since = start; }
                    else if (end) { since = new Date(end.getTime() - 13 * 7 * 24 * 60 * 60 * 1000); until = end; }
                    else { since = new Date(until.getTime() - 13 * 7 * 24 * 60 * 60 * 1000); }
                } else {
                    const weeks = App.retentionPeriodWeeks || 13;
                    until.setHours(23, 59, 59, 999);
                    since = new Date(until);
                    since.setDate(since.getDate() - weeks * 7);
                    since.setHours(0, 0, 0, 0);
                }
                return { since, until };
            },

            renderRetentionStats: () => {
                const { since, until } = App.getRetentionWindow();

                // Analyze every member who trained at least once in the window
                // (any account status) — attendance frequency is the retention signal.
                const rows = DB.getMembers().map(m => {
                    const count = App.getMemberTrainingDays(m.id, since, until);
                    if (count <= 0) return null;
                    // Effective window starts at the later of the period start or the member's
                    // first training date, so brand-new members aren't penalized for joining mid-period.
                    const firstTraining = App.getMemberFirstTrainingDate(m.id);
                    const windowStart = (firstTraining && firstTraining > since) ? firstTraining : since;
                    const windowWeeks = Math.max(1, (until - windowStart) / (1000 * 60 * 60 * 24 * 7));
                    const perWeek = count / windowWeeks;
                    let segment = 'active';
                    if (perWeek < 1) segment = 'high';
                    else if (perWeek < 3) segment = 'moderate';
                    return { member: m, count, perWeek, segment };
                }).filter(Boolean);
                rows.sort((a, b) => a.perWeek - b.perWeek || a.member.lastName.localeCompare(b.member.lastName));
                App.retentionRows = rows;
                App.frequencyRows = rows;

                const total = rows.length;
                const segCount = { high: 0, moderate: 0, active: 0 };
                rows.forEach(r => segCount[r.segment]++);
                const avgPerWeek = total ? rows.reduce((s, r) => s + r.perWeek, 0) / total : 0;
                const pct = k => total ? Math.round(segCount[k] / total * 100) : 0;

                document.getElementById('retention-overview-grid').innerHTML = `
                    <div class="stat-card"><h3>Members Trained</h3><div class="value">${total}</div></div>
                    <div class="stat-card"><h3>Avg Days / Week</h3><div class="value">${avgPerWeek.toFixed(1)}</div></div>
                    <div class="stat-card"><h3>High Risk</h3><div class="value" style="color:var(--danger)">${segCount.high}<span style="font-size:1rem;"> (${pct('high')}%)</span></div></div>
                    <div class="stat-card"><h3>Moderate Risk</h3><div class="value" style="color:var(--warning)">${segCount.moderate}<span style="font-size:1rem;"> (${pct('moderate')}%)</span></div></div>
                    <div class="stat-card"><h3>Active / Healthy</h3><div class="value" style="color:var(--success)">${segCount.active}<span style="font-size:1rem;"> (${pct('active')}%)</span></div></div>
                `;

                // Show the active analysis window in the breakdown subtitle.
                const winLabel = document.getElementById('retention-window-label');
                if (winLabel) {
                    const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                    const endFmt = Utils.dateToLocalIso(until) === Utils.todayLocalIso() ? 'Today' : fmt(until);
                    winLabel.innerText = `Analysis window: ${fmt(since)} – ${endFmt}.`;
                }

                const segCards = [
                    { key: 'high', label: 'High Risk', desc: '< 1 day / week', count: segCount.high, pct: pct('high'), color: 'var(--danger)', bg: 'var(--bg-danger-soft)' },
                    { key: 'moderate', label: 'Moderate Risk', desc: '1–2 days / week', count: segCount.moderate, pct: pct('moderate'), color: 'var(--warning)', bg: 'var(--bg-warning-soft)' },
                    { key: 'active', label: 'Active / Healthy', desc: '3+ days / week', count: segCount.active, pct: pct('active'), color: 'var(--success)', bg: 'var(--bg-success-soft)' }
                ];
                document.getElementById('retention-segment-cards').innerHTML = segCards.map(s => `
                    <div class="retention-seg-card" style="--seg-color: ${s.color};">
                        <div class="retention-seg-top">
                            <span class="retention-seg-dot" style="background: ${s.color};"></span>
                            <strong>${s.label}</strong>
                            <span class="badge" style="background:${s.bg}; color:${s.color}; margin-left:auto;">${s.count}</span>
                        </div>
                        <div class="retention-seg-value">${s.pct}%</div>
                        <div class="retention-seg-desc">${s.desc}</div>
                        <div class="retention-seg-bar">
                            <div class="retention-seg-bar-fill" style="width:${s.pct}%; background: ${s.color};"></div>
                        </div>
                        <div class="retention-seg-foot">${s.count} of ${total} members trained</div>
                    </div>
                `).join('');

                App.renderRetentionTable();
            },

            setRetentionSort: (colId) => {
                if (App.retentionSortCol === colId) { App.retentionSortAsc = !App.retentionSortAsc; }
                else { App.retentionSortCol = colId; App.retentionSortAsc = true; }
                App.renderRetentionTable();
            },

            renderRetentionTable: () => {
                const filter = document.getElementById('retention-segment-filter').value;
                const rows = (App.frequencyRows || App.retentionRows || []).filter(r => filter === 'all' || r.segment === filter);
                const list = document.getElementById('retention-member-list');
                const headers = document.getElementById('retention-member-headers');
                const sortCol = App.retentionSortCol || 'perWeek';
                const sortAsc = App.retentionSortAsc !== false;
                const cols = [
                    { id: 'member', label: 'Member' },
                    { id: 'belt', label: 'Belt' },
                    { id: 'classes', label: 'Days' },
                    { id: 'perWeek', label: 'Avg / Week' },
                    { id: 'segment', label: 'Segment' }
                ];
                if (headers) {
                    headers.innerHTML = cols.map(c => {
                        const isSorted = sortCol === c.id;
                        const arrow = isSorted ? (sortAsc ? ' ↑' : ' ↓') : '';
                        return `<th class="sortable" onclick="App.setRetentionSort('${c.id}')">${c.label}${arrow}</th>`;
                    }).join('');
                }
                rows.sort((a, b) => {
                    let valA, valB;
                    let groupA = 0, groupB = 0;
                    switch (sortCol) {
                        case 'member': {
                            const keyA = Utils.sortKey(a.member.lastName || '');
                            const keyB = Utils.sortKey(b.member.lastName || '');
                            const firstA = Utils.sortKey(a.member.firstName || '');
                            const firstB = Utils.sortKey(b.member.firstName || '');
                            groupA = Utils.isGreek(a.member.lastName) ? 0 : 1;
                            groupB = Utils.isGreek(b.member.lastName) ? 0 : 1;
                            if (keyA !== keyB) { valA = keyA; valB = keyB; break; }
                            valA = firstA; valB = firstB;
                            break;
                        }
                        case 'belt': {
                            const beltOrder = { 'white': 0, 'blue': 1, 'purple': 2, 'brown': 3, 'black': 4 };
                            valA = beltOrder[(a.member.belt || 'White').split('/')[0].trim().toLowerCase()] ?? 99;
                            valB = beltOrder[(b.member.belt || 'White').split('/')[0].trim().toLowerCase()] ?? 99;
                            break;
                        }
                        case 'classes': valA = a.count; valB = b.count; break;
                        case 'segment': {
                            const order = { 'high': 0, 'moderate': 1, 'active': 2 };
                            valA = order[a.segment]; valB = order[b.segment];
                            break;
                        }
                        default: valA = a.perWeek; valB = b.perWeek;
                    }
                    if (typeof valA === 'string' && typeof valB === 'string') {
                        if (groupA !== groupB) return groupA < groupB ? -1 : 1;
                        if (valA !== valB) return sortAsc ? (valA < valB ? -1 : 1) : (valA < valB ? 1 : -1);
                        return 0;
                    }
                    if (valA < valB) return sortAsc ? -1 : 1;
                    if (valA > valB) return sortAsc ? 1 : -1;
                    return 0;
                });
                const segMeta = {
                    high: { label: 'High Risk', cls: 'badge-inactive' },
                    moderate: { label: 'Moderate Risk', cls: 'badge-warning' },
                    active: { label: 'Active', cls: 'badge-active' }
                };
                list.innerHTML = rows.map(r => {
                    const m = r.member;
                    const meta = segMeta[r.segment];
                    const barPct = Math.min(100, Math.round(r.perWeek / 6 * 100));
                    return `
                        <tr>
                            <td data-label="Member"><strong>${Utils.escapeHTML(m.firstName)} ${Utils.escapeHTML(m.lastName)}</strong></td>
                            <td data-label="Belt">${Utils.getBeltBox(m.belt)}</td>
                            <td data-label="Classes">${r.count}</td>
                            <td data-label="Avg / Week">
                                <div class="retention-freq">
                                    <div class="retention-freq-bar"><div class="retention-freq-fill" style="width:${barPct}%;"></div></div>
                                    <span class="retention-freq-val">${r.perWeek.toFixed(1)}</span>
                                </div>
                            </td>
                            <td data-label="Segment"><span class="badge ${meta.cls}">${meta.label}</span></td>
                        </tr>`;
                }).join('') || '<tr><td colspan="5" class="text-center text-gray">No members trained in this window for this segment.</td></tr>';
            },

            exportRetentionExcel: () => {
                const filter = document.getElementById('retention-segment-filter').value;
                const rows = (App.frequencyRows || App.retentionRows || []).filter(r => filter === 'all' || r.segment === filter);
                if (!rows.length) return alert('No data to export for the current segment filter.');
                const segLabels = { high: 'High Risk', moderate: 'Moderate Risk', active: 'Active / Healthy' };
                let csvContent = "data:text/csv;charset=utf-8,";
                csvContent += "Member ID,First Name,Last Name,Belt,Days,Avg / Week,Segment\n";
                const esc = (val) => {
                    let str = String(val == null ? '' : val);
                    if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return '"' + str.replace(/"/g, '""') + '"';
                    }
                    return str;
                };
                rows.forEach(r => {
                    const m = r.member;
                    csvContent += `${esc(m.id)},${esc(m.firstName)},${esc(m.lastName)},${esc(m.belt || 'White')},${esc(r.count)},${esc(r.perWeek.toFixed(1))},${esc(segLabels[r.segment])}\n`;
                });
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", `GymDesk_Retention_${Utils.todayLocalIso()}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },

            getMemberFirstTrainingDate: (memberId) => {
                const checkins = DB.getClassCheckins().filter(ci => ci.memberId === memberId && ci.entryTime);
                const visits = DB.getVisits().filter(v => v.memberId === memberId && v.entryTime);
                const dates = [
                    ...checkins.map(ci => new Date(ci.entryTime)),
                    ...visits.map(v => new Date(v.entryTime))
                ].filter(d => !isNaN(d.getTime()));
                if (!dates.length) return null;
                return new Date(Math.min(...dates.map(d => d.getTime())));
            },

            // Distinct local calendar days a member trained in the window. A member who
            // checks in for two classes in one visit counts as ONE training day, so the
            // retention frequency reflects how often they actually show up.
            getMemberTrainingDays: (memberId, sinceDate = null, untilDate = null) => {
                const visits = DB.getVisits().filter(v => v.memberId === memberId && v.entryTime);
                const checkins = DB.getClassCheckins().filter(ci => ci.memberId === memberId && ci.entryTime);
                const daySet = new Set();
                [...visits, ...checkins].forEach(r => {
                    const d = r.entryTime ? new Date(r.entryTime) : null;
                    if (!d || isNaN(d.getTime())) return;
                    if (sinceDate && d < sinceDate) return;
                    if (untilDate && d >= untilDate) return;
                    daySet.add(Utils.dateToLocalIso(d));
                });
                return daySet.size;
            },

            // --- MEMBER ATTENDANCE % (admin) ---
            // The denominator counts only class sessions that were actually available in
            // the window: not on closed dates, not in the future, and only for classes
            // whose available_from date had passed (so classes added later never penalize
            // a member who couldn't have attended them).
            buildAvailableTrainings: (since, until) => {
                const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const closedSet = Utils.buildClosedSet(until.getFullYear() + 1);
                const today = Utils.todayLocalIso();
                const sessions = [];
                const cursor = new Date(since);
                cursor.setHours(0, 0, 0, 0);
                const end = new Date(until);
                end.setHours(23, 59, 59, 999);
                const schedules = DB.getSchedules();
                while (cursor <= end) {
                    const dayIso = Utils.dateToLocalIso(cursor);
                    if (dayIso > today) break;
                    if (!closedSet.has(dayIso)) {
                        const dayName = dayNames[cursor.getDay()];
                        schedules.forEach(cls => {
                            if (cls.availableFrom && cls.availableFrom > dayIso) return;
                            (cls.slots || []).forEach(slot => {
                                if (slot.day === dayName) sessions.push({ date: dayIso, classId: cls.id, className: cls.name, slotStart: slot.start, slotEnd: slot.end });
                            });
                        });
                    }
                    cursor.setDate(cursor.getDate() + 1);
                }
                return sessions;
            },

            getMemberAttendance: (memberId, since, until, opts = {}) => {
                // Effective start: the member's first check-in in the window, so new or
                // occasional members aren't measured against sessions that predate their
                // first training (avoids discouragingly low percentages).
                let effectiveSince = since;
                if (opts.skipEffectiveStart !== true) {
                    const firstCheckin = DB.getClassCheckins()
                        .filter(ci => ci.memberId === memberId && ci.entryTime)
                        .map(ci => new Date(ci.entryTime))
                        .filter(d => !isNaN(d.getTime()) && d >= since && d < until)
                        .sort((a, b) => a - b)[0];
                    if (firstCheckin) {
                        const firstDay = new Date(firstCheckin);
                        firstDay.setHours(0, 0, 0, 0);
                        if (firstDay > since) effectiveSince = firstDay;
                    }
                }
                const availableCount = {};
                const meta = {};
                App.buildAvailableTrainings(effectiveSince, until).forEach(s => {
                    const key = `${s.date}|${s.classId}`;
                    availableCount[key] = (availableCount[key] || 0) + 1;
                    meta[s.classId] = meta[s.classId] || { name: s.className, available: 0 };
                    meta[s.classId].available++;
                });
                const attendedCount = {};
                DB.getClassCheckins().forEach(ci => {
                    if (ci.memberId !== memberId || !ci.entryTime) return;
                    const d = new Date(ci.entryTime);
                    if (isNaN(d.getTime())) return;
                    if (since && d < since) return;
                    if (until && d >= until) return;
                    const dateKey = ci.slotDate || Utils.dateToLocalIso(d);
                    const key = `${dateKey}|${ci.classId}`;
                    attendedCount[key] = (attendedCount[key] || 0) + 1;
                });
                let totalAvailable = 0, totalMatched = 0;
                Object.keys(availableCount).forEach(key => {
                    totalAvailable += availableCount[key];
                    totalMatched += Math.min(attendedCount[key] || 0, availableCount[key]);
                });
                let perClass = Object.keys(meta).map(cid => {
                    const cls = meta[cid];
                    let att = 0;
                    Object.keys(availableCount).forEach(key => {
                        if (key.split('|')[1] === cid) att += Math.min(attendedCount[key] || 0, availableCount[key]);
                    });
                    cls.classId = cid;
                    cls.attended = att;
                    cls.pct = cls.available > 0 ? Math.round(att / cls.available * 100) : null;
                    return cls;
                });
                perClass.sort((a, b) => (b.pct || 0) - (a.pct || 0) || a.name.localeCompare(b.name));
                // Member-facing view: show only classes that are public, or that the member
                // has attended at least once in the recent lookback (default 90 days). The
                // overall % is then computed over exactly those shown classes, so non-public
                // classes the member has never attended don't lower their score.
                if (opts.onlyPublicOrAttended) {
                    const lookback = opts.lookbackDays || 90;
                    const sinceLookback = new Date(until.getTime() - lookback * 24 * 3600 * 1000);
                    const attendedIds = new Set();
                    DB.getClassCheckins().forEach(ci => {
                        if (ci.memberId !== memberId || !ci.entryTime) return;
                        const d = new Date(ci.entryTime);
                        if (isNaN(d.getTime()) || d < sinceLookback || d >= until) return;
                        attendedIds.add(ci.classId);
                    });
                    const publicIds = new Set(DB.getSchedules().filter(s => s.isPublic !== false).map(s => s.id));
                    perClass = perClass.filter(c => publicIds.has(c.classId) || attendedIds.has(c.classId));
                    const shownAvailable = perClass.reduce((s, c) => s + c.available, 0);
                    const shownAttended = perClass.reduce((s, c) => s + c.attended, 0);
                    return { attended: shownAttended, available: shownAvailable, pct: shownAvailable > 0 ? Math.round(shownAttended / shownAvailable * 100) : null, perClass };
                }
                const pct = totalAvailable > 0 ? Math.round(totalMatched / totalAvailable * 100) : null;
                return { attended: totalMatched, available: totalAvailable, pct, perClass };
            },

            getAttendanceWindow: () => {
                let until = new Date();
                let since;
                if (App.attendanceDays === 'custom') {
                    const s = document.getElementById('attendance-custom-start').value;
                    const e = document.getElementById('attendance-custom-end').value;
                    since = s ? new Date(s + 'T00:00:00') : new Date(until.getTime() - 90 * 24 * 3600 * 1000);
                    if (e) { until = new Date(e + 'T23:59:59'); }
                } else {
                    const days = App.attendanceDays || 90;
                    until.setHours(23, 59, 59, 999);
                    since = new Date(until.getTime() - (days - 1) * 24 * 3600 * 1000);
                    since.setHours(0, 0, 0, 0);
                }
                return { since, until };
            },

            setMemberAttendancePeriod: (days) => {
                App.attendanceDays = days;
                const isCustom = days === 'custom';
                document.querySelectorAll('.attendance-period-btn').forEach(b => {
                    const matches = isCustom ? b.dataset.custom === '1' : parseInt(b.dataset.days, 10) === days;
                    b.classList.toggle('active', !!matches);
                });
                const range = document.getElementById('attendance-custom-range');
                if (range) range.classList.toggle('hidden', !isCustom);
                App.renderMemberAttendance();
            },

            onMemberAttendanceCustomChange: () => {
                App.attendanceDays = 'custom';
                document.querySelectorAll('.attendance-period-btn').forEach(b => b.classList.toggle('active', b.dataset.custom === '1'));
                const range = document.getElementById('attendance-custom-range');
                if (range) range.classList.remove('hidden');
                App.renderMemberAttendance();
            },

            // Positive-only emoji feedback for attendance %. Nothing below 50% so it
            // never discourages; escalates up to the sloth mascot at 98%+. Emojis and
            // colors are admin-editable (stored in settings).
            attendanceEmoji: (p) => {
                if (p == null || p < 50) return '';
                const e = STATE.attendanceEmojis || DEFAULT_ATTENDANCE_EMOJIS;
                if (p >= 98) return e[98];
                if (p >= 95) return e[95];
                if (p >= 90) return e[90];
                if (p >= 80) return e[80];
                if (p >= 70) return e[70];
                if (p >= 60) return e[60];
                return e[50];
            },
            attendanceColor: (p) => {
                if (p == null || p < 50) return '';
                const c = STATE.attendanceColors || DEFAULT_ATTENDANCE_COLORS;
                if (p >= 98) return c[98];
                if (p >= 95) return c[95];
                if (p >= 90) return c[90];
                if (p >= 80) return c[80];
                if (p >= 70) return c[70];
                if (p >= 60) return c[60];
                return c[50];
            },

            renderMemberAttendance: () => {
                const el = document.getElementById('admin-member-attendance');
                if (!el) return;
                const memberId = document.getElementById('form-original-id').value;
                if (!memberId) { el.innerHTML = ''; return; }
                const { since, until } = App.getAttendanceWindow();
                const res = App.getMemberAttendance(memberId, since, until);
                const fmt = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                const overallHtml = res.pct == null
                    ? '<div class="text-gray">No class sessions were available in this period.</div>'
                    : `<div class="text-gray" style="font-size:0.85rem;">${res.attended} attended of ${res.available} available sessions</div>`;
                const pctHtml = (p) => p == null ? '—' : `<span style="color:${App.attendanceColor(p) || 'inherit'}; font-weight:700;">${p}%</span>`;
                el.innerHTML = `
                    <div style="font-size:1.1rem; font-weight:700; margin-bottom:0.25rem;">Overall: ${pctHtml(res.pct)}</div>
                    ${overallHtml}
                    <div style="border-top:1px solid var(--gray-light); margin:0.75rem 0 0.5rem 0;"></div>
                    ${res.perClass.length ? `
                        <div style="display:grid; grid-template-columns: 1fr 72px 110px; align-items:center; gap:0.25rem 0.5rem;">
                            ${res.perClass.map(c => `
                                <strong style="overflow-wrap:anywhere; padding:0.25rem 0;">${Utils.escapeHTML(c.name)}</strong>
                                <span style="text-align:right; font-size:0.85rem; font-weight:600; padding:0.25rem 0;">${pctHtml(c.pct)}</span>
                                <span class="text-gray" style="font-size:0.8rem; text-align:center; padding:0.25rem 0;">${c.attended}/${c.available}</span>`).join('')}
                        </div>` : '<div class="text-gray" style="padding:0.5rem 0;">No class sessions available in this period.</div>'}
                    <div class="text-gray" style="font-size:0.8rem; margin-top:0.5rem;">Window: ${fmt(since)} – ${fmt(until)}. Only classes available by each date are counted.</div>`;
            },

            // Approximate a member's join date as the earliest of their first payment,
            // first class check-in, or first visit. Used by the Membership Growth KPI.
            getMemberJoinDate: (memberId) => {
                const dates = [];
                DB.getPayments().forEach(p => {
                    if (p.memberId !== memberId || !p.date) return;
                    const d = new Date(p.date + 'T12:00:00');
                    if (!isNaN(d.getTime())) dates.push(d);
                });
                DB.getClassCheckins().forEach(ci => {
                    if (ci.memberId !== memberId || !ci.entryTime) return;
                    const d = new Date(ci.entryTime);
                    if (!isNaN(d.getTime())) dates.push(d);
                });
                DB.getVisits().forEach(v => {
                    if (v.memberId !== memberId || !v.entryTime) return;
                    const d = new Date(v.entryTime);
                    if (!isNaN(d.getTime())) dates.push(d);
                });
                if (!dates.length) return null;
                return new Date(Math.min(...dates.map(d => d.getTime())));
            },

            renderKPIs: () => {
                const grid = document.getElementById('kpi-grid');
                if (!grid) return;
                const now = new Date();
                const { since: winStart, until: winEnd } = App.getRetentionWindow();
                const isCustom = App.retentionPeriodWeeks === 'custom';
                const members = DB.getMembers();
                const checkins = DB.getClassCheckins();
                const payments = DB.getPayments();
                const schedules = DB.getSchedules();
                const currency = DB.getCurrency();
                const joinMap = new Map();
                members.forEach(m => joinMap.set(m.id, App.getMemberJoinDate(m.id)));

                // ---- 1. MEMBERSHIP GROWTH (period) ----
                // Headline growth = new members joining in the window ÷ roster before the window.
                const windowNewMembers = members.filter(m => {
                    const jd = joinMap.get(m.id);
                    return jd && jd >= winStart && jd < winEnd;
                }).length;
                const rosterBeforeWindow = members.filter(m => {
                    const jd = joinMap.get(m.id);
                    return jd && jd < winStart;
                }).length;
                const growthPct = rosterBeforeWindow > 0 ? (windowNewMembers / rosterBeforeWindow) * 100 : null;

                // 6-month new-member trend (still shown for preset windows; hidden for custom).
                const monthTrend = [];
                for (let i = 5; i >= 0; i--) {
                    const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
                    const count = members.filter(m => {
                        const jd = joinMap.get(m.id);
                        return jd && jd >= s && jd < e;
                    }).length;
                    monthTrend.push({ label: s.toLocaleDateString(undefined, { month: 'short' }), count });
                }

                // ---- 2. MEMBER RETENTION (period) ----
                // Retention = (students at end of period − new students acquired during period)
                //             ÷ students at start of period × 100
                const membersWithJoin = members.filter(m => joinMap.get(m.id));
                const studentsAtStart = membersWithJoin.filter(m => joinMap.get(m.id) < winStart).length;
                const newStudents = membersWithJoin.filter(m => joinMap.get(m.id) >= winStart && joinMap.get(m.id) < winEnd).length;
                const studentsAtEnd = membersWithJoin.filter(m => joinMap.get(m.id) < winEnd).length;
                const retainedStudents = studentsAtEnd - newStudents;
                const retentionPct = studentsAtStart > 0 ? (retainedStudents / studentsAtStart) * 100 : null;

                // ---- 3. REVENUE PER MEMBER (period, normalized to monthly) ----
                const revenueThisPeriod = payments.filter(p => {
                    if (!p.date || !(parseFloat(p.amount) > 0)) return false;
                    const d = new Date(p.date + 'T12:00:00');
                    return d >= winStart && d < winEnd;
                }).reduce((s, p) => s + parseFloat(p.amount), 0);
                const activeCount = members.filter(m => App.getMemberTrainingDays(m.id, winStart, winEnd) > 0).length;
                // Normalize the window's revenue to a monthly equivalent so the KPI is
                // comparable across 4/8/13-week (and custom) windows.
                const windowDays = Math.max(1, (winEnd - winStart) / (24 * 60 * 60 * 1000));
                const monthlyRevenue = revenueThisPeriod / (windowDays / 30.44);
                const rpm = activeCount > 0 ? monthlyRevenue / activeCount : null;

                // ---- 4. CLASS ATTENDANCE (period) ----
                // Attendance rate = students who attended ÷ students enrolled in that class × 100.
                // Enrollment is approximated by the class's Max Capacity (set in Training Schedules).
                // Only classes with a capacity set are counted; closed days are skipped.
                const attStart = new Date(winStart);
                attStart.setHours(0, 0, 0, 0);
                const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const closedSet = Utils.buildClosedSet(attStart.getFullYear() + 1);
                let totalCap = 0, totalAtt = 0;
                (schedules.filter(c => c.capacity && parseInt(c.capacity, 10) > 0 && c.isPublic !== false)).forEach(cls => {
                    const cap = parseInt(cls.capacity, 10);
                    (cls.slots || []).forEach(slot => {
                        // Walk the window day by day; each occurrence of a matching slot
                        // contributes its capacity once and counts its check-ins.
                        const cursor = new Date(attStart);
                        while (cursor < winEnd) {
                            if (dayNames[cursor.getDay()] === slot.day) {
                                const dateIso = Utils.dateToLocalIso(cursor);
                                if (!closedSet.has(dateIso)) {
                                    const att = checkins.filter(ci => ci.classId === cls.id && ci.slotDate === dateIso && ci.slotStart === slot.start && ci.slotEnd === slot.end).length;
                                    totalCap += cap;
                                    totalAtt += Math.min(att, cap);
                                }
                            }
                            cursor.setDate(cursor.getDate() + 1);
                        }
                    });
                });
                const attendancePct = totalCap > 0 ? (totalAtt / totalCap) * 100 : null;

                // ---- 5. TRIAL CONVERSION (all-time) ----
                // Rate = trial participants who became paying members ÷ total trial participants × 100.
                const trialParticipants = members.filter(m => m.trialParticipant || m.trialConverted).length;
                const trialConverted = members.filter(m => m.trialConverted).length;
                const trialConvPct = trialParticipants > 0 ? (trialConverted / trialParticipants) * 100 : null;

                // ---- Render KPI cards ----
                const trendMax = Math.max(1, ...monthTrend.map(t => t.count));
                const card = (title, target, value, status, note, extra = '') => `
                    <div class="kpi-card kpi-${status}">
                        <div class="kpi-head">
                            <div class="kpi-title">${title}</div>
                            <span class="kpi-badge">${status === 'ok' ? 'On track' : status === 'warn' ? 'Below target' : status === 'info' ? 'Info' : 'Not tracked'}</span>
                        </div>
                        <div class="kpi-value">${value}</div>
                        <div class="kpi-target">${target}</div>
                        ${extra}
                        <div class="kpi-note">${note}</div>
                    </div>`;
                const winLabel = isCustom ? 'this period' : 'this month';

                grid.innerHTML =
                    card(
                        'Membership Growth',
                        isCustom ? 'Goal: 5–10% over the selected period' : 'Goal: 5–10% monthly increase',
                        growthPct != null ? `<span class="kpi-arrow">+</span>${growthPct.toFixed(1)}%` : '—',
                        growthPct != null ? (growthPct >= 5 ? 'ok' : 'warn') : 'warn',
                        `Counted: new members joined in ${winLabel} ÷ roster before it.`,
                        isCustom
                            ? `<div class="kpi-sub">${windowNewMembers} new / ${rosterBeforeWindow} before</div>`
                            : `<div class="kpi-chart">${monthTrend.map((t, idx) => `
                                <div class="kpi-chart-col" title="${t.label}: ${t.count} new">
                                    <div class="kpi-chart-bar" style="height:${Math.max(4, Math.round(t.count / trendMax * 100))}%"></div>
                                    <span class="kpi-chart-label">${t.label}</span>
                                </div>`).join('')}</div>`
                    ) +
                    card(
                        'Member Retention',
                        isCustom ? 'Goal: 95%+ over the selected period' : 'Goal: 95%+ quarterly',
                        retentionPct != null ? `${retentionPct.toFixed(0)}%` : '—',
                        retentionPct == null ? 'na' : (retentionPct >= 95 ? 'ok' : 'warn'),
                        `Counted: (students at end − new students ${isCustom ? 'in the period' : 'this quarter'}) ÷ students at start × 100.`,
                        retentionPct != null ? `<div class="kpi-sub">${retainedStudents} retained of ${studentsAtStart} at start (+${newStudents} new)</div>` : ''
                    ) +
                    card(
                        'Revenue Per Member',
                        'Goal: match market benchmark',
                        rpm != null ? `${currency}${rpm.toFixed(2)}` : '—',
                        'info',
                        `Counted: ${currency}${monthlyRevenue.toFixed(2)} monthly revenue ÷ ${activeCount} members who trained (${currency}${revenueThisPeriod.toFixed(2)} in window).`,
                        rpm != null ? `<div class="kpi-sub">${currency}${monthlyRevenue.toFixed(2)} monthly / ${activeCount} trained</div>` : ''
                    ) +
                    card(
                        'Class Attendance',
                        isCustom ? 'Goal: 70–80% over the selected period' : 'Goal: 70–80% weekly (healthy range)',
                        attendancePct != null ? `${attendancePct.toFixed(0)}%` : '—',
                        attendancePct == null ? 'na' : (attendancePct >= 70 ? 'ok' : 'warn'),
                        'Counted: students who attended ÷ students enrolled in that class × 100 (enrollment = class capacity).',
                        attendancePct != null ? `<div class="kpi-sub">${totalAtt} attended / ${totalCap} enrolled</div>`
                            : '<div class="kpi-sub">Set a Max Capacity in Training Schedules to enable this KPI.</div>'
                    ) +
                    card(
                        'Trial Conversion',
                        'Goal: 50–70% conversion',
                        trialConvPct != null ? `${trialConvPct.toFixed(0)}%` : '—',
                        trialConvPct == null ? 'na' : (trialConvPct >= 50 ? 'ok' : 'warn'),
                        'Counted: trial participants who became paying members ÷ total trial participants × 100.',
                        trialConvPct != null ? `<div class="kpi-sub">${trialConverted} converted of ${trialParticipants} trial participants</div>`
                            : '<div class="kpi-sub">Mark a plan as Trial and assign it to members to enable this KPI.</div>'
                    ) +
                    card(
                        'Member Satisfaction',
                        'Goal: 90%+ quarterly',
                        '—',
                        'na',
                        'Not tracked yet — no survey data source. Add a kiosk/member survey later to compute this.'
                    );
            },

            // --- SETTINGS ---
            sendAdminPasswordReset: () => {
                const auth = getAuth();
                if (!auth) return alert('Firebase Auth is not available.');
                // Use the signed-in admin's email — the account is identified by the
                // `admin` custom claim, not a hardcoded address (pentest F4).
                const email = App.authUser && App.authUser.email;
                if (!email) return alert('No admin email available. Please sign in to send a password reset.');
                auth.sendPasswordResetEmail(email)
                    .then(() => alert(`Password reset email sent to ${email}. Check your inbox.`))
                    .catch(err => alert('Failed to send reset email: ' + (err && err.message ? err.message : err)));
            },

            renderAdminDashboard: () => {
                const visits = DB.getVisits();
                const members = DB.getMembers();
                const validMemberIds = new Set(members.map(m => m.id));
                const now = new Date();
                const active = visits.filter(v => v.exitTime === null && v.expectedExitTime && new Date(v.expectedExitTime) > now && validMemberIds.has(v.memberId) && App.isVisitVisibleNow(v, now)).length;
                const today = Utils.todayLocalIso();
                const todayVisits = visits.filter(v => v.entryTime && Utils.dateToLocalIso(new Date(v.entryTime)) === today && validMemberIds.has(v.memberId)).length;
                const activeMem = members.filter(m => m.accountStatus === 'Active' && Utils.getDaysRemaining(m.expirationDate) >= 0).length;
                const unpaidCheckins = visits.filter(v => v.isUnpaid && validMemberIds.has(v.memberId)).length;

                const genderCounts = members.reduce((acc, m) => { const g = m.gender || 'Unspecified'; acc[g] = (acc[g] || 0) + 1; return acc; }, {});

                document.getElementById('admin-stats-grid').innerHTML = `
                    <div class="stat-card"><h3>Currently Inside</h3><div class="value">${active}</div></div>
                    <div class="stat-card"><h3>Total Visits Today</h3><div class="value">${todayVisits}</div></div>
                    <div class="stat-card"><h3>Unpaid Check-ins</h3><div class="value" style="color:${unpaidCheckins > 0 ? 'var(--danger)' : 'var(--success)'}">${unpaidCheckins}</div></div>
                    <div class="stat-card"><h3>Active Subscriptions</h3><div class="value" style="color:var(--success)">${activeMem}</div></div>
                    <div class="stat-card"><h3>Total Members</h3><div class="value">${members.length}</div></div>
                    <div class="stat-card"><h3>Genders</h3><div style="font-size:0.9rem;">${Object.entries(genderCounts).map(([k,v]) => `<div>${k}: <strong>${v}</strong></div>`).join('')}</div></div>
                `;

                App.renderAnalyticalCalendar();
            },

            renderAnalyticalCalendar: () => {
                const input = document.getElementById('export-month-picker');
                let monthStr = input ? input.value : '';
                const persisted = localStorage.getItem('gym_analytical_month');
                if (!monthStr && persisted) {
                    monthStr = persisted;
                    if (input) input.value = monthStr;
                }
                if (!monthStr) {
                    monthStr = Utils.currentMonthLocal();
                    if (input) input.value = monthStr;
                }
                localStorage.setItem('gym_analytical_month', monthStr);

                // Sync supporting UI: Today button + export section month label
                const todayBtn = document.getElementById('analytical-month-today');
                if (todayBtn) todayBtn.classList.toggle('hidden', monthStr === Utils.currentMonthLocal());
                const exportLabel = document.getElementById('export-month-label');
                if (exportLabel) {
                    exportLabel.innerText = monthStr
                        ? new Date(Number(monthStr.split('-')[0]), Number(monthStr.split('-')[1]) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                        : 'this month';
                }

                if(!monthStr) return;

                const [year, month] = monthStr.split('-').map(Number);
                const daysInMonth = new Date(year, month, 0).getDate();
                
                const visits = DB.getVisits();
                const members = DB.getMembers();
                const validMemberIds = new Set(members.map(m => m.id));

                const container = document.getElementById('analytical-calendar-container');
                let html = `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align:center;">`;
                
                // Days header (start on Sunday)
                ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => { html += `<div style="font-weight:bold; padding: 5px; background:var(--gray-light);">${d}</div>`; });

                const firstDayObj = new Date(year, month - 1, 1);
                // getDay() returns 0..6 where 0 is Sunday — with Sunday-first calendar we can use it directly
                let startDayOffset = firstDayObj.getDay(); 

                for(let i=0; i<startDayOffset; i++) { html += `<div class="analytical-cal-cell"></div>`; }

                for(let day=1; day<=daysInMonth; day++) {
                    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const dayVisits = visits.filter(v => v.entryTime && Utils.dateToLocalIso(new Date(v.entryTime)) === dateStr && validMemberIds.has(v.memberId));
                    const vCount = dayVisits.length;
                    
                        let bg = '#fff';
                        const unpaidCount = dayVisits.filter(v => v.isUnpaid).length;
                        if (unpaidCount > 0) {
                            bg = '#fee2e2';
                        } else if (vCount > 30) {
                            bg = '#86efac';
                        } else if (vCount > 15) {
                            bg = '#bbf7d0';
                        } else if (vCount > 0) {
                            bg = '#dcfce7';
                        }
 
                        html += `
                            <div class="analytical-cal-cell" style="background: ${bg}; cursor:pointer;" onclick="App.filterVisitsByDate('${dateStr}')">
                                <strong style="display:block; margin-bottom:5px;">${day}</strong>
                                <span style="font-size:0.85rem; color:var(--dark); font-weight:600;">${vCount} people</span>
                                ${unpaidCount > 0 ? `<span style="font-size:0.7rem; color:var(--danger); font-weight:600;">${unpaidCount} unpaid</span>` : ''}
                            </div>
                        `;
                }
                // Blank trailing cells so every month renders a full 6 rows (42 cells)
                // with uniform height — the calendar never shifts between months.
                const usedCells = startDayOffset + daysInMonth;
                for(let i=usedCells; i<42; i++) { html += `<div class="analytical-cal-cell"></div>`; }
                html += `</div>`;
                container.innerHTML = html;
            },

            filterVisitsByDate: (dateStr) => {
                App.switchTab('dashboard', 'log');
                document.getElementById('filter-visit-start').value = dateStr;
                document.getElementById('filter-visit-end').value = dateStr;
                document.getElementById('filter-visit-status').value = 'all';
                document.getElementById('filter-visit-sort').value = 'newest';
                App.renderVisitLog();
            },

            changeAnalyticalMonth: (delta) => {
                const input = document.getElementById('export-month-picker');
                const monthVal = (input && input.value) || localStorage.getItem('gym_analytical_month') || Utils.currentMonthLocal();
                const [year, month] = monthVal.split('-').map(Number);
                const d = new Date(year, month - 1 + delta, 1);
                input.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                localStorage.setItem('gym_analytical_month', input.value);
                App.renderAnalyticalCalendar();
            },

            goToCurrentMonth: () => {
                const input = document.getElementById('export-month-picker');
                if (!input) return;
                input.value = Utils.currentMonthLocal();
                localStorage.setItem('gym_analytical_month', input.value);
                App.renderAnalyticalCalendar();
            },

            onAnalyticalMonthChange: () => {
                App.renderAnalyticalCalendar();
            },

            exportMonthlyExcel: () => {
                const monthStr = document.getElementById('export-month-picker').value; 
                if(!monthStr) return alert("Select a month first");
                
                const visits = DB.getVisits();
                const members = DB.getMembers();
                const binMembers = DB.getBin();
                const memMap = new Map();
                members.forEach(m => memMap.set(m.id, m));
                binMembers.forEach(m => { if (!memMap.has(m.id)) memMap.set(m.id, m); });

                const header = ["Date", "Time", "Member ID", "First Name", "Last Name", "Belt", "Status"];

                // CSV escape helper: neutralize spreadsheet formulas (=, +, -, @) that
                // Excel/LibreOffice would otherwise execute when the file is opened.
                const esc = (val) => {
                    let str = String(val == null ? '' : val);
                    if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return '"' + str.replace(/"/g, '""') + '"';
                    }
                    return str;
                };

                const rows = [];
                visits.forEach(v => {
                    const visitLocalDate = v.entryTime ? Utils.dateToLocalIso(new Date(v.entryTime)) : '';
                    if (visitLocalDate.startsWith(monthStr)) {
                        const m = memMap.get(v.memberId);
                        if (m) {
                            const date = visitLocalDate;
                            const time = new Date(v.entryTime).toLocaleTimeString();
                            const status = v.isUnpaid ? 'Unpaid/Expired' : 'Paid';
                            rows.push([esc(date), esc(time), esc(m.id), esc(m.firstName), esc(m.lastName), esc(m.belt), esc(status)].join(','));
                        }
                    }
                });

                if(rows.length === 0) return alert("No valid check-ins found for this month.");

                const csv = '\uFEFF' + header.map(h => esc(h)).join(',') + '\n' + rows.join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", `GymDesk_Checkins_${monthStr}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            },

            /**
             * Returns the payment record that covers a given paid check-in visit,
             * or null if no payment record can be attributed.
             * Mirrors the reconciliation logic in reconcileMemberPaymentVisitStatus:
             * 1. Payment explicitly cleared the visit (clearedVisitIds)
             * 2. Visit falls inside a payment's applied date window (or the member's expiration window)
             * 3. Visit is covered by remaining session quota (chronological consumption)
             */
            getVisitPaidByInfo: (v) => {
                if (!v || v.isUnpaid) return null;
                const payments = DB.getPayments().filter(p => p.memberId === v.memberId);
                const member = DB.getMembers().find(m => m.id === v.memberId) || DB.getBin().find(m => m.id === v.memberId);

                // 1. Explicitly cleared by a payment record — except session-granting payments,
                // whose clearedVisitIds are legacy artifacts (they cleared debt without consuming
                // sessions); those visits are attributed via session quota instead.
                const explicit = payments.find(p => Array.isArray(p.clearedVisitIds) && p.clearedVisitIds.includes(v.id)
                    && !(p.sessionsGranted && parseInt(p.sessionsGranted, 10) > 0));
                if (explicit) return explicit;

                const entry = v.entryTime ? new Date(v.entryTime) : null;

                // 2. Covered by a payment's applied date window (newest payment wins).
                // Session-granting payments are quota-based and never create coverage windows,
                // mirroring the reconciliation engine.
                if (entry && !isNaN(entry.getTime())) {
                    const datedPays = payments.filter(p => p.appliedExpiration
                        && !(p.sessionsGranted && parseInt(p.sessionsGranted, 10) > 0)).sort((a, b) => new Date(b.date) - new Date(a.date));
                    const timePay = datedPays.find(p => {
                        const start = Utils.dayStart(p.appliedStartDate || p.date);
                        const end = Utils.dayEnd(p.appliedExpiration);
                        return start && end && !isNaN(start.getTime()) && !isNaN(end.getTime()) && entry >= start && entry <= end;
                    });
                    if (timePay) return timePay;

                    // Covered by the member's current expiration window — attribute to the payment that set it.
                    // Mirrors the reconciliation guard: session-based members (sessionsTotal without a
                    // time-based planDays) must not get visits covered by a stale expirationDate, and the
                    // membership window starts at the FIRST UNPAID DAY — visits already paid by drop-in
                    // sessions are never re-attributed to the membership.
                    const isTimeCoveredMember = member && (!member.sessionsTotal || member.planDays != null);
                    if (isTimeCoveredMember && member.expirationDate && Utils.getDaysRemaining(member.expirationDate) >= 0) {
                        const end = Utils.dayEnd(member.expirationDate);
                        if (!isNaN(end.getTime()) && entry <= end) {
                            const memberVisits = DB.getVisits().filter(x => x.memberId === member.id);
                            const firstUnpaidDay = App.computeMemberFirstUnpaidDay(member, payments, memberVisits);
                            if (firstUnpaidDay && entry >= firstUnpaidDay) {
                                const expPay = payments
                                    .filter(p => p.appliedExpiration === member.expirationDate)
                                    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                                if (expPay) return expPay;
                            }
                        }
                    }
                }

                // 3. Covered by session quota — chronological consumption across the
                // member's session payments, attributing each visit to the specific
                // payment (drop-in) that actually covered it.
                const sessionPayments = payments.filter(p => p.sessionsGranted && parseInt(p.sessionsGranted, 10) > 0)
                    .sort((a, b) => new Date(a.date) - new Date(b.date));
                if (sessionPayments.length > 0) {
                    const memberVisits = DB.getVisits()
                        .filter(x => x.memberId === v.memberId)
                        .sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
                    const coveredBy = new Map();
                    let payIdx = 0;
                    let remaining = parseInt(sessionPayments[0].sessionsGranted, 10) || 0;
                    memberVisits.forEach(x => {
                        const xEntry = x.entryTime ? new Date(x.entryTime) : null;
                        // Ignore clearedVisitIds from session-granting payments (legacy artifacts)
                        // so visits re-enter the quota walk — mirroring the reconciliation engine.
                        const xExplicit = payments.some(p => Array.isArray(p.clearedVisitIds) && p.clearedVisitIds.includes(x.id)
                            && !(p.sessionsGranted && parseInt(p.sessionsGranted, 10) > 0));
                        const xTime = xEntry && !isNaN(xEntry.getTime()) && payments.some(p => {
                            if (!p.appliedExpiration) return false;
                            // Session-granting payments never create time windows.
                            if (p.sessionsGranted && parseInt(p.sessionsGranted, 10) > 0) return false;
                            const start = Utils.dayStart(p.appliedStartDate || p.date);
                            const end = Utils.dayEnd(p.appliedExpiration);
                            return start && end && !isNaN(start.getTime()) && !isNaN(end.getTime()) && xEntry >= start && xEntry <= end;
                        });
                        if (xExplicit || xTime || x.paidOverride) return;
                        while (payIdx < sessionPayments.length && remaining <= 0) {
                            payIdx++;
                            remaining = payIdx < sessionPayments.length ? (parseInt(sessionPayments[payIdx].sessionsGranted, 10) || 0) : 0;
                        }
                        if (payIdx < sessionPayments.length && remaining > 0) {
                            remaining--;
                            coveredBy.set(x.id, sessionPayments[payIdx]);
                        }
                    });
                    if (coveredBy.has(v.id)) return coveredBy.get(v.id);
                }

                return null;
            },

            renderVisitLog: () => {
                let visits = DB.getVisits();
                const members = DB.getMembers();
                const binMembers = DB.getBin();
                const startFilter = document.getElementById('filter-visit-start').value;
                const endFilter = document.getElementById('filter-visit-end').value;
                const statusFilter = document.getElementById('filter-visit-status').value;
                const sortBy = document.getElementById('filter-visit-sort').value;

                if (startFilter) { const sd = Utils.dayStart(startFilter); if (sd) visits = visits.filter(v => v.entryTime && new Date(v.entryTime) >= sd); }
                if (endFilter) { const ed = Utils.dayEnd(endFilter); if (ed) visits = visits.filter(v => v.entryTime && new Date(v.entryTime) <= ed); }
                if (statusFilter === 'active') { visits = visits.filter(v => !v.isUnpaid); }
                if (statusFilter === 'unpaid') { visits = visits.filter(v => v.isUnpaid); }

                const memberMap = new Map();
                members.forEach(m => memberMap.set(m.id, m));
                binMembers.forEach(m => { if (!memberMap.has(m.id)) memberMap.set(m.id, m); });
                visits = visits.filter(v => memberMap.has(v.memberId));

                const nameMap = new Map();
                memberMap.forEach((m, id) => nameMap.set(id, Utils.sortKey(`${m.firstName} ${m.lastName}`)));

                if (sortBy === 'name-asc') {
                    visits.sort((a, b) => (nameMap.get(a.memberId) || '').localeCompare(nameMap.get(b.memberId) || ''));
                } else if (sortBy === 'name-desc') {
                    visits.sort((a, b) => (nameMap.get(b.memberId) || '').localeCompare(nameMap.get(a.memberId) || ''));
                } else {
                    visits.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime));
                }

                const list = document.getElementById('visit-log-list');
                let unpaidCount = 0;

                const rowsHTML = visits.map(v => {
                    const m = memberMap.get(v.memberId);
                    const isDeleted = !members.some(activeM => activeM.id === v.memberId);
                    if (v.isUnpaid) unpaidCount++;

                    const nameHtml = isDeleted
                        ? `<strong>${Utils.escapeHTML(m.firstName)} ${Utils.escapeHTML(m.lastName)}</strong> <span class="badge badge-inactive" style="font-size:0.7rem;">Deleted Member</span>`
                        : `<strong>${Utils.escapeHTML(m.firstName)} ${Utils.escapeHTML(m.lastName)}</strong>`;
                    // Member ID inside the belt-styled box; every box keeps the same fixed width
                    const idBadge = Utils.getMemberIdBadge(m);
                    // Combined Status & Payment: unpaid check-ins show "Unpaid",
                    // paid ones show the covering payment record that makes it OK
                    let statusHtml = `<span class="badge badge-inactive">Unpaid</span>`;
                    if (!v.isUnpaid) {
                        const pay = App.getVisitPaidByInfo(v);
                        if (pay) {
                            const plan = pay.planId ? DB.getPlans().find(p => p.id === pay.planId) : null;
                            const planName = plan ? ` · ${Utils.escapeHTML(plan.name)}` : '';
                            const payLabel = `<span class="badge badge-active" style="font-size:0.7rem;">Paid</span> ${DB.getCurrency()}${parseFloat(pay.amount || 0).toFixed(2)}${planName} <span class="text-gray" style="font-size:0.8rem;">(${Utils.formatDate(pay.date)})</span>`;
                            statusHtml = pay.note
                                ? `<div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">${payLabel}</div><div class="text-gray" style="font-size:0.8rem;">${Utils.escapeHTML(pay.note)}</div>`
                                : `<div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">${payLabel}</div>`;
                        } else {
                            statusHtml = `<span class="badge badge-active" style="font-size:0.7rem;">Paid</span> <span class="text-gray" style="font-size:0.8rem;">covered (no payment record)</span>`;
                        }
                    }

                    // If a specific class was chosen at check-in (kiosk or admin portal), show the
                    // class instead of the entry/exit times. Plain open-gym check-ins keep showing
                    // their entry time and duration. buildVisitClassTags safely falls back to a
                    // generic "Class" label if the class was later deleted from the schedule.
                    // Tags stack the class hours below the class name so the column stays narrow.
                    const classTags = App.buildVisitClassTags(v, false, true);
                    let entryHtml = classTags
                        ? classTags
                        : `<div>${Utils.formatTime(v.entryTime)} ${v.exitTime ? ` - ${Utils.formatTime(v.exitTime)}` : '(Inside)'}</div>
                           <div class="text-gray" style="font-size:0.8rem;">${App.calcVisitDuration(v)}</div>`;

                    return `
                    <tr${isDeleted ? ' style="opacity:0.6;"' : ''}>
                        <td data-label="Date">${Utils.formatDate(v.entryTime)}</td>
                        <td data-label="Entry & Class">${entryHtml}</td>
                        <td data-label="Member Name">${nameHtml}</td>
                        <td data-label="ID">${idBadge}</td>
                        <td data-label="Status & Payment">${statusHtml}</td>
                        <td data-label="Action" class="cell-actions">
                            ${v.isUnpaid && !isDeleted ? `<button class="btn-outline btn-small" onclick="App.openPaymentModal('${m.id}')">Add Payment</button>` : ''}
                            <button class="btn-outline btn-small" onclick="App.openVisitEditModal('${v.id}')">Edit</button>
                        </td>
                    </tr>
                `}).join('') || '<tr><td colspan="6" class="text-center text-gray">No visits found matching filters.</td></tr>';

                if (list.innerHTML !== rowsHTML) list.innerHTML = rowsHTML;

                const newHTML = `<div class="stat-card" style="padding: 1rem;"><h3>Filtered Total</h3><div class="value" style="font-size: 1.5rem;">${visits.length}</div></div>
                    <div class="stat-card" style="padding: 1rem;"><h3>Unpaid / Expired Hits</h3><div class="value" style="font-size: 1.5rem; color:var(--danger);">${unpaidCount}</div></div>`;
                const summaryEl = document.getElementById('visit-summary-grid');
                if (summaryEl.innerHTML !== newHTML) summaryEl.innerHTML = newHTML;
            },

            openVisitEditModal: (id) => {
                const visit = DB.getVisits().find(v => v.id === id);
                if (!visit) return;
                App._editingVisit = visit;
                document.getElementById('form-visit-id').value = visit.id;
                
                const entryInput = document.getElementById('form-visit-entry');
                entryInput.value = Utils.toLocalDatetimeInput(visit.entryTime);
                
                const exitInput = document.getElementById('form-visit-exit');
                exitInput.value = Utils.toLocalDatetimeInput(visit.exitTime);

                document.getElementById('form-visit-payment').value = visit.paidOverride || '';

                App.renderVisitClassPicker(visit);

                App.openModal('modal-visit');
            },

            // Build the multi-select class list for the visit's entry date, pre-checking
            // any classes already attached to this visit. Selecting classes here replaces
            // the visit's class_checkins on save (see saveVisitEdit).
            renderVisitClassPicker: (visit) => {
                const container = document.getElementById('visit-class-picker');
                const empty = document.getElementById('visit-class-picker-empty');
                if (!container) return;
                const existing = new Map(DB.getClassCheckins().filter(c => c.visitId === visit.id).map(c => [App.normalizeScheduleSlotId(c.classId, c.slotDay, c.slotStart, c.slotEnd), c]));

                let entries = [];
                const d = new Date(visit.entryTime);
                const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
                const dateIso = Utils.dateToLocalIso(d);
                (DB.getSchedules() || []).forEach(cls => {
                    (cls.slots || []).forEach(slot => {
                        if (slot.day !== dayName) return;
                        const slotId = App.normalizeScheduleSlotId(cls.id, slot.day, slot.start, slot.end);
                        entries.push({ slotId, cls, slot, checked: existing.has(slotId) });
                    });
                });
                entries.sort((a, b) => a.slot.start.localeCompare(b.slot.start) || a.cls.name.localeCompare(b.cls.name));

                if (entries.length === 0) {
                    container.innerHTML = '';
                    if (empty) empty.classList.remove('hidden');
                    return;
                }
                if (empty) empty.classList.add('hidden');
                container.innerHTML = entries.map(e => {
                    const color = e.cls.color || '#2563eb';
                    return `
                    <label class="visit-class-option${e.checked ? ' checked' : ''}" style="border-left: 4px solid ${color};">
                        <input type="checkbox" data-slot-id="${Utils.escapeHTML(e.slotId)}" data-class-id="${Utils.escapeHTML(e.cls.id)}" data-slot-day="${Utils.escapeHTML(e.slot.day)}" data-slot-start="${Utils.escapeHTML(e.slot.start)}" data-slot-end="${Utils.escapeHTML(e.slot.end)}" data-slot-date="${dateIso}" ${e.checked ? 'checked' : ''} onchange="App.toggleVisitClassOption(this)" hidden>
                        <strong>${Utils.escapeHTML(e.cls.name)}</strong>
                        <span class="text-gray" style="font-size:0.85rem;">${Utils.convertTo12Hour(e.slot.start)} - ${Utils.convertTo12Hour(e.slot.end)}</span>
                        <span class="badge badge-inside visit-class-option-badge" style="font-size:0.7rem;">${e.checked ? 'Selected' : 'Select'}</span>
                    </label>`;
                }).join('');
            },

            toggleVisitClassOption: (input) => {
                const label = input.closest('.visit-class-option');
                if (!label) return;
                label.classList.toggle('checked', input.checked);
                const badge = label.querySelector('.visit-class-option-badge');
                if (badge) badge.innerText = input.checked ? 'Selected' : 'Select';
            },

            // Re-render the class picker when the admin changes the entry date, so the
            // available classes match the new date.
            onVisitEntryChange: () => {
                const visit = App._editingVisit;
                const entryVal = document.getElementById('form-visit-entry').value;
                if (!visit || !entryVal) return;
                const pickerVisit = Object.assign({}, visit, { entryTime: new Date(entryVal).toISOString() });
                App.renderVisitClassPicker(pickerVisit);
            },

            saveVisitEdit: (e) => {
                e.preventDefault();
                const id = document.getElementById('form-visit-id').value;
                const visits = DB.getVisits();
                const v = visits.find(x => x.id === id);
                if(v) {
                    const entryVal = document.getElementById('form-visit-entry').value;
                    const exitVal = document.getElementById('form-visit-exit').value;
                    if (entryVal && exitVal && new Date(exitVal) < new Date(entryVal)) {
                        return alert('Exit time cannot be earlier than entry time.');
                    }
                    if(entryVal) {
                        v.entryTime = new Date(entryVal).toISOString();
                    }
                    if(exitVal) {
                        v.exitTime = new Date(exitVal).toISOString();
                    } else {
                        v.exitTime = null;
                        if (entryVal) {
                            const checkins = DB.getClassCheckins().filter(c => c.visitId === v.id);
                            v.expectedExitTime = App.computeExpectedExitTime(v.entryTime, checkins);
                        }
                    }
                    const payVal = document.getElementById('form-visit-payment').value;
                    if (payVal === 'paid' || payVal === 'unpaid') v.paidOverride = payVal;
                    else delete v.paidOverride;

                    // Replace the visit's classes with whatever the admin selected in the
                    // picker. Unchecking everything clears the class assignment (open gym).
                    const selected = Array.from(document.querySelectorAll('#visit-class-picker input:checked'));
                    const allCheckins = DB.getClassCheckins().filter(c => c.visitId !== v.id);
                    const prefix = Date.now();
                    const nowIso = new Date().toISOString();
                    selected.forEach((input, i) => {
                        allCheckins.push({
                            id: 'CC-' + (v.memberId || '') + '-' + prefix + '-' + (i + 1),
                            visitId: v.id,
                            memberId: v.memberId,
                            classId: input.dataset.classId,
                            slotDate: input.dataset.slotDate || null,
                            slotDay: input.dataset.slotDay || null,
                            slotStart: input.dataset.slotStart || null,
                            slotEnd: input.dataset.slotEnd || null,
                            entryTime: nowIso
                        });
                    });
                    DB.saveClassCheckins(allCheckins);
                    v.classIds = selected.map(i => i.dataset.classId);
                    if (!v.exitTime) {
                        v.expectedExitTime = App.computeExpectedExitTime(v.entryTime, selected.map(i => ({
                            classId: i.dataset.classId, slotDay: i.dataset.slotDay,
                            slotStart: i.dataset.slotStart, slotEnd: i.dataset.slotEnd
                        })), selected.length === 0);
                    }
                    DB.saveVisits(visits);
                    // Moving a visit in time can change which payment/session covers it, so
                    // re-run the reconciliation engine to keep isUnpaid flags and the member's
                    // session balance consistent.
                    if (v.memberId) App.reconcileMemberPaymentVisitStatus(v.memberId);
                    App.closeModal('modal-visit');
                    App.renderVisitLog();
                    App.renderLivePresent();
                    App.renderKioskLeaderboard();
                    if (!document.getElementById('pane-admin-dashboard').classList.contains('hidden')) {
                        App.renderAdminDashboard();
                    }
                }
            },

            deleteVisitFromModal: () => {
                if(!confirm('Permanently delete this check-in record?')) return;
                const id = document.getElementById('form-visit-id').value;
                const visits = DB.getVisits();
                const v = visits.find(x => x.id === id);
                const memberId = v ? v.memberId : null;
                const remainingVisits = visits.filter(x => x.id !== id);
                DB.saveVisits(remainingVisits);
                App.cleanupClassCheckins();
                // A deleted check-in may have consumed a session at check-in time; re-run
                // reconciliation so the consumed session is restored (or an unpaid visit is
                // removed from the member's debt) instead of silently losing the session.
                if (memberId) App.reconcileMemberPaymentVisitStatus(memberId);
                App.closeModal('modal-visit');
                App.renderVisitLog();
                App.renderLivePresent();
                App.renderKioskLeaderboard();
                if (!document.getElementById('pane-admin-dashboard').classList.contains('hidden')) {
                    App.renderAdminDashboard();
                }
            },

            searchDashboardHistory: () => {
                const q = Utils.normalizeSearch(document.getElementById('dashboard-history-search').value);
                const res = document.getElementById('dashboard-history-results');
                if(!q || q.length < 2) { res.innerHTML = ''; return; }
                const m = DB.getMembers().find(m => m.id === q || Utils.normalizeSearch(m.firstName).includes(q) || Utils.normalizeSearch(m.lastName).includes(q));
                if(m) {
                    res.innerHTML = `<div class="card" style="background:#e0f2fe; border-color:#38bdf8; margin-bottom: 1rem;">
                        <h3 style="margin:0;">Found: ${Utils.escapeHTML(m.firstName)} ${Utils.escapeHTML(m.lastName)} (${Utils.escapeHTML(m.id)})</h3>
                        <button class="btn-primary btn-small mt-1" onclick="App.renderMemberHistory('${m.id}', 'dashboard-history-container')">Load History</button>
                    </div>`;
                } else {
                    res.innerHTML = '<p class="text-gray">No member found.</p>';
                    document.getElementById('dashboard-history-container').innerHTML = '';
                }
            },

            renderAdminSettings: () => {
                document.getElementById('form-portal-name').value = DB.getPortalName();
                document.getElementById('form-currency').value = DB.getCurrency();
                document.getElementById('setting-show-class-checkins').checked = DB.getShowClassCheckins();
                const hidden = DB.getHiddenBelts();
                document.querySelectorAll('.setting-hide-belt').forEach(cb => {
                    cb.checked = hidden.includes(cb.value);
                });
            },
            
            updatePortalName: () => {
                const name = document.getElementById('form-portal-name').value.trim();
                if(!name) return;
                DB.setPortalName(name);
                document.getElementById('kiosk-title-display').innerText = name;
                alert("Portal name updated!");
            },

            updateCurrency: () => {
                const c = document.getElementById('form-currency').value;
                DB.setCurrency(c);
                App.updateUICurrency();
                alert("Currency symbol updated! Reloading schedules/plans to reflect...");
                App.renderPlans();
            },
            
            saveBeltVisibility: () => {
                const hidden = [];
                document.querySelectorAll('.setting-hide-belt:checked').forEach(cb => hidden.push(cb.value));
                DB.setHiddenBelts(hidden);
                alert("Belt visibility saved. Kiosk view updated.");
                App.renderLivePresent();
            },

            saveClassCheckinsVisibility: () => {
                const v = document.getElementById('setting-show-class-checkins').checked;
                DB.setShowClassCheckins(v);
                alert("Recorded check-ins visibility saved.");
            },

            renderMemberSettings: () => {
                const vis = DB.getMemberStatsVisibility();
                const stats = [
                    { id: 'totalTrainings', title: 'Total Trainings', desc: 'Shows the member\'s total number of recorded trainings.' },
                    { id: 'totalHours', title: 'Total Hours Trained', desc: 'Shows the member\'s total hours spent training.' },
                    { id: 'avgDay', title: 'Avg Trainings / Day', desc: 'Shows the member\'s average number of trainings per training day.' },
                    { id: 'avgWeek', title: 'Avg Trainings / Week', desc: 'Shows the member\'s average training frequency per week.' },
                    { id: 'avgDays', title: 'Avg Days / Week', desc: 'Shows the member\'s average training days per week.' },
                    { id: 'avgDaysMonth', title: 'Avg Days / Month', desc: 'Shows the member\'s average training days per month.' },
                    { id: 'avgMonth', title: 'Avg Trainings / Month', desc: 'Shows the member\'s average training frequency per month.' },
                    { id: 'rank', title: 'Leaderboard Rank', desc: 'Shows the member\'s rank on the public training leaderboard.' }
                ];
                document.getElementById('member-stats-visibility').innerHTML = stats.map(s => `
                    <div class="card mt-1" style="border-left: 4px solid var(--primary); padding: 0.75rem 1rem;">
                        <div class="flex justify-between align-center" style="gap: 1rem;">
                            <div>
                                <div class="font-bold text-gray">${s.title}</div>
                                <p class="text-gray" style="font-size: 0.85rem; margin: 0.15rem 0 0 0;">${s.desc}</p>
                            </div>
                            <label class="closed-date-toggle">
                                <input type="checkbox" data-stat-id="${s.id}" ${vis[s.id] ? 'checked' : ''}>
                                <span class="closed-date-toggle-track"></span>
                            </label>
                        </div>
                    </div>
                `).join('');
                App.renderAttendanceFeedbackConfig();
                App.renderLeaderboardMedalConfig();
            },

            // Admin editor for the leaderboard top-3 medal emojis.
            renderLeaderboardMedalConfig: () => {
                const el = document.getElementById('leaderboard-medal-config');
                if (!el) return;
                const medals = STATE.leaderboardEmojis || DEFAULT_LEADERBOARD_EMOJIS;
                const suffix = { 1: 'st', 2: 'nd', 3: 'rd' };
                el.innerHTML = [1, 2, 3].map(p => `
                    <div style="display:flex; align-items:center; gap:0.6rem; padding:0.4rem 0; flex-wrap:wrap;">
                        <span class="text-gray" style="width:64px; font-weight:600;">${p}${suffix[p]}</span>
                        <input type="text" class="search-bar" data-place="${p}" value="${Utils.escapeHTML(medals[p] || '')}" maxlength="8" style="width:84px; text-align:center;">
                        <span style="width:70px; text-align:center; font-size:1.25rem;">${Utils.escapeHTML(medals[p] || '')}</span>
                    </div>`).join('');
            },

            saveLeaderboardMedals: () => {
                const medals = Object.assign({}, DEFAULT_LEADERBOARD_EMOJIS);
                document.querySelectorAll('#leaderboard-medal-config input').forEach(inp => {
                    const place = parseInt(inp.dataset.place, 10);
                    if (place && inp.value.trim()) medals[place] = inp.value.trim();
                });
                STATE.leaderboardEmojis = medals;
                fallbackToLocal();
                saveToCloud();
                App.renderLeaderboardMedalConfig();
                App.renderKioskLeaderboard && App.renderKioskLeaderboard();
                alert('Leaderboard medals saved.');
            },

            resetLeaderboardMedals: () => {
                STATE.leaderboardEmojis = Object.assign({}, DEFAULT_LEADERBOARD_EMOJIS);
                fallbackToLocal();
                saveToCloud();
                App.renderLeaderboardMedalConfig();
                App.renderKioskLeaderboard && App.renderKioskLeaderboard();
                alert('Leaderboard medals reset to defaults.');
            },

            // Admin editor for the attendance feedback percentage colors.
            renderAttendanceFeedbackConfig: () => {
                const el = document.getElementById('attendance-feedback-config');
                if (!el) return;
                const colors = STATE.attendanceColors || DEFAULT_ATTENDANCE_COLORS;
                el.innerHTML = [50, 60, 70, 80, 90, 95, 98].map(t => `
                    <div style="display:flex; align-items:center; gap:0.6rem; padding:0.4rem 0; flex-wrap:wrap;">
                        <span class="text-gray" style="width:64px; font-weight:600;">${t}%+</span>
                        <input type="color" data-tier="${t}" data-type="color" value="${colors[t] || '#000000'}" style="width:44px; height:36px; padding:0; border:1px solid var(--gray-light); border-radius:var(--border-radius); cursor:pointer; background:var(--white);">
                        <input type="text" class="search-bar" data-tier="${t}" data-type="hex" value="${Utils.escapeHTML(colors[t] || '')}" placeholder="#RRGGBB" maxlength="7" style="width:96px; text-align:center; font-family:monospace;">
                    </div>`).join('');
            },

            saveAttendanceFeedback: () => {
                const colors = Object.assign({}, DEFAULT_ATTENDANCE_COLORS);
                const hexSet = new Set();
                document.querySelectorAll('#attendance-feedback-config input[type="text"]').forEach(inp => {
                    const tier = parseInt(inp.dataset.tier, 10);
                    if (!tier || inp.dataset.type !== 'hex') return;
                    const hex = (inp.value || '').trim();
                    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) { colors[tier] = hex; hexSet.add(tier); }
                });
                // A valid hex code wins; otherwise fall back to the color picker value.
                document.querySelectorAll('#attendance-feedback-config input[type="color"]').forEach(inp => {
                    const tier = parseInt(inp.dataset.tier, 10);
                    if (tier && !hexSet.has(tier) && inp.value) colors[tier] = inp.value;
                });
                STATE.attendanceColors = colors;
                fallbackToLocal();
                saveToCloud();
                App.renderAttendanceFeedbackConfig();
                alert('Attendance feedback saved.');
            },

            resetAttendanceFeedback: () => {
                STATE.attendanceColors = Object.assign({}, DEFAULT_ATTENDANCE_COLORS);
                fallbackToLocal();
                saveToCloud();
                App.renderAttendanceFeedbackConfig();
                alert('Attendance feedback reset to defaults.');
            },

            saveMemberStatsVisibility: () => {
                const v = {};
                document.querySelectorAll('#member-stats-visibility input[type="checkbox"]').forEach(cb => {
                    v[cb.dataset.statId] = cb.checked;
                });
                DB.setMemberStatsVisibility(v);
                alert("Member statistics visibility saved.");
            },

            // One-time repair for members that were duplicated by an ID change:
            // groups records by email (or name when no email), keeps the record
            // with the most check-in history, and rewrites every visit / class
            // check-in / payment / notification reference onto the keeper.
            repairDuplicateMembers: () => {
                if (!App.isAdminAuthed()) return alert('Only the admin can repair duplicate members.');
                const members = DB.getMembers();
                const groups = new Map();
                members.forEach(m => {
                    if (!m || !m.id) return;
                    const emailKey = (m.email || '').trim().toLowerCase();
                    const nameKey = `${(m.firstName || '').trim()}|${(m.lastName || '').trim()}`.toLowerCase();
                    const key = emailKey || nameKey;
                    if (!key) return;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(m);
                });
                const dupGroups = [...groups.values()].filter(g => g.length > 1);
                if (!dupGroups.length) return alert('No duplicate members found.');
                const summary = dupGroups.map(g => g.map(m => `${m.firstName || '?'} ${m.lastName || ''} (${m.id})`).join('  ↔  ')).join('\n');
                if (!confirm(`Found ${dupGroups.length} duplicate group(s):\n\n${summary}\n\nEach group keeps the record with the most check-in history; the rest are merged into it and removed. Continue?`)) return;

                const visits = DB.getVisits();
                const checkins = DB.getClassCheckins();
                const payments = DB.getPayments();
                const notifs = DB.getNotifications();
                const keepIds = new Set();
                let mergedCount = 0;
                dupGroups.forEach(group => {
                    const score = m => App.getMemberTrainingCount(m.id) * 10 + visits.filter(v => v.memberId === m.id).length;
                    let keep = group[0];
                    group.forEach(m => { if (score(m) > score(keep)) keep = m; });
                    keepIds.add(keep.id);
                    group.forEach(m => {
                        if (m.id === keep.id) return;
                        mergedCount++;
                        visits.forEach(v => { if (v.memberId === m.id) v.memberId = keep.id; });
                        checkins.forEach(c => { if (c.memberId === m.id) c.memberId = keep.id; });
                        payments.forEach(p => { if (p.memberId === m.id) p.memberId = keep.id; });
                        notifs.forEach(n => { if (n.memberId === m.id) n.memberId = keep.id; });
                        if (!keep.email && m.email) keep.email = m.email;
                    });
                });
                DB.saveMembers(members.filter(m => keepIds.has(m.id)));
                DB.saveVisits(visits);
                DB.saveClassCheckins(checkins);
                DB.savePayments(payments);
                DB.saveNotifications(notifs);
                App.renderMemberDirectory();
                alert(`Merged ${mergedCount} duplicate record(s) into ${dupGroups.length} keeper(s). Check the member directory and verify.`);
            },

});
