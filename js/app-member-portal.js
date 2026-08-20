// =====================================================================
// app-member-portal.js
// App methods: loginAsMember, changeMemberId, renderMemberHistory, getMemberTrainingCount, getMemberLeaderboardRank, getMemberStatsHTML, renderMemberDashboard, logout
// Plain script (no ES modules). Methods attach to the global App object
// created in app-core.js. Load order is fixed in index.html.
// =====================================================================
Object.assign(App, {
            // Which average granularity the member portal shows (persisted per device):
            // 'week' shows Avg ... / Week, 'month' shows Avg ... / Month.
            memberStatsMode: (localStorage.getItem('gym_member_stats_mode') || 'week'),
            memberStatsCollapsed: (localStorage.getItem('gym_member_stats_collapsed') === '1'),
            toggleMemberMenu: () => {
                const drawer = document.getElementById('member-drawer');
                const overlay = document.getElementById('member-drawer-overlay');
                if (drawer) drawer.classList.toggle('open');
                if (overlay) overlay.classList.toggle('open');
            },

            // ---------- MEMBER GOOGLE SIGN-IN ----------
            // Members link their Google account to their member record via the
            // existing "email" field. Resolution is case-insensitive.

            // The member record whose email matches the signed-in Google account (if any).
            getMemberByFirebaseEmail: () => {
                const auth = getAuth();
                if (!auth || !auth.currentUser) return null;
                const email = (auth.currentUser.email || '').trim().toLowerCase();
                if (!email) return null;
                return DB.getMembers().find(m => (m.email || '').trim().toLowerCase() === email) || null;
            },

            // Whether the current device should use the redirect flow (mobile Safari
            // frequently blocks popups) instead of a popup.
            isTouchDevice: () => {
                return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            },

            // Set the active member session (member view + mobile check-in).
            setMemberSession: (member) => {
                App.currentUser = member;
                localStorage.setItem('gym_member_session', member.id);
                App.isMobileCheckinMode = false;
            },

            // Bind a Google email to a member record. Returns {error} or {ok}.
            linkGoogleEmailToMember: (member, email) => {
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                const norm = (email || '').trim();
                if (!norm) return { error: map.mobileLinkNoEmail || 'No email provided.' };
                const existing = (member.email || '').trim().toLowerCase();
                const incoming = norm.toLowerCase();
                if (existing && existing !== incoming) {
                    return { error: (map.mobileLinkEmailMismatchPrefix || 'This member already has a different email linked (') + member.email + (map.mobileLinkEmailMismatchSuffix || '). Ask staff to update it.') };
                }
                if (existing === incoming) return { ok: true };
                const members = DB.getMembers();
                const idx = members.findIndex(m => m.id === member.id);
                if (idx === -1) return { error: map.mobileMemberRecordNotFound || 'Member record not found.' };
                members[idx].email = norm;
                DB.saveMembers(members);
                member.email = norm;
                return { ok: true };
            },

            // Show the member dashboard view for a resolved member.
            showMemberDashboardFor: (member) => {
                App.closeModal('modal-login');
                document.getElementById('view-kiosk').classList.add('hidden');
                const adminView = document.getElementById('view-admin');
                if (adminView) adminView.classList.add('hidden');
                document.getElementById('view-member').classList.remove('hidden');
                App.renderMemberDashboard();
            },

            // "Sign in with Google" button in the login modal (Member Dashboard section).
            memberGoogleLogin: () => {
                // Google sign-in is deferred during the Supabase migration. Members
                // sign in with their member ID instead.
                return alert('Google sign-in is not available yet. Enter your member ID to sign in.');
            },

            loginAsMember: async () => {
                const input = document.getElementById('member-login-id');
                const id = input.value.trim();
                let member = null;
                if (FSEngine && typeof FSEngine.whenReady === 'function' && !(FSEngine.ready.members && FSEngine.migrationResolved)) {
                    await FSEngine.whenReady('members');
                }
                if (id) {
                    member = DB.getMembers().find(m => m.id === id);
                    if (!member) return alert("Member ID not found.");
                } else {
                    // Empty ID: if a Google account is signed in, resolve by email
                    // (useful after a mobile redirect sign-in, or on reload).
                    member = App.getMemberByFirebaseEmail();
                    if (!member) return;
                }
                // If a Google account is signed in, link it to this member (one-time).
                const auth = getAuth();
                if (auth && auth.currentUser && auth.currentUser.email) {
                    const linkResult = App.linkGoogleEmailToMember(member, auth.currentUser.email);
                    if (linkResult.error) return alert(linkResult.error);
                }
                App.setMemberSession(member);
                App.closeModal('modal-login');
                document.getElementById('view-kiosk').classList.add('hidden');
                const adminView = document.getElementById('view-admin');
                if (adminView) adminView.classList.add('hidden');
                document.getElementById('view-member').classList.remove('hidden');
                input.value = '';
                App.renderMemberDashboard();
            },

            changeMemberId: async () => {
                const newId = document.getElementById('member-new-id').value.trim();
                if (!newId || !/^\d{1,8}$/.test(newId)) return alert("Please enter a valid numeric ID (up to 8 digits).");
                if (newId === App.currentUser.id) return alert("This is already your ID.");
                
                const members = DB.getMembers();
                if (members.find(m => m.id === newId)) return alert("This ID is already taken by another member.");
                
                const oldId = App.currentUser.id;
                try {
                    // Server-side rename: single UPDATE + ON UPDATE CASCADE moves the
                    // member and every visit/check-in/payment reference atomically.
                    await FSEngine.notifyRename(oldId, newId);
                    members.forEach(m => { if (m.id === oldId) m.id = newId; });
                    DB.saveMembers(members);
                    const visits = DB.getVisits();
                    visits.forEach(v => { if (v.memberId === oldId) v.memberId = newId; });
                    DB.saveVisits(visits);
                    const checkins = DB.getClassCheckins();
                    checkins.forEach(c => { if (c.memberId === oldId) c.memberId = newId; });
                    DB.saveClassCheckins(checkins);
                    const payments = DB.getPayments();
                    let payChanged = false;
                    payments.forEach(p => { if (p.memberId === oldId) { p.memberId = newId; payChanged = true; } });
                    if (payChanged) DB.savePayments(payments);
                    const notifications = DB.getNotifications();
                    let notifChanged = false;
                    notifications.forEach(n => { if (n.memberId === oldId) { n.memberId = newId; notifChanged = true; } });
                    if (notifChanged) DB.saveNotifications(notifications);
                    App.currentUser = members.find(m => m.id === newId);
                    localStorage.setItem('gym_member_session', newId);
                    alert("ID successfully updated!");
                    document.getElementById('member-new-id').value = '';
                } catch (err) {
                    alert("ID update failed: " + (err && err.message ? err.message : err));
                }
            },


            renderMemberHistory: (memberId, containerId) => {
                const visits = DB.getVisits().filter(v => v.memberId === memberId).sort((a,b) => new Date(b.entryTime) - new Date(a.entryTime));
                const container = document.getElementById(containerId);
                if (container) container.dataset.memberId = memberId;
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                const noHistoryText = containerId === 'member-personal-history' ? (map.memberViewNoHistory || 'No history found.') : 'No history found.';
                const dateHeader = containerId === 'member-personal-history' ? (map.memberViewHistoryDate || 'Date') : 'Date';
                const entryHeader = containerId === 'member-personal-history' ? (map.memberViewHistoryEntry || 'Entry') : 'Entry';
                const durationHeader = containerId === 'member-personal-history' ? (map.memberViewHistoryDuration || 'Duration') : 'Duration';
                const statusHeader = containerId === 'member-personal-history' ? (map.memberViewHistoryStatus || 'Status') : 'Status';

                if (visits.length === 0) {
                    container.innerHTML = `<p class="text-gray" style="text-align:center; padding: 1rem;">${Utils.escapeHTML(noHistoryText)}</p>`;
                } else {
                    container.innerHTML = `<div class="table-responsive mobile-cards" style="border:none;">
                        <table style="width: 100%;">
                            <thead><tr><th>${Utils.escapeHTML(dateHeader)}</th><th>${Utils.escapeHTML(entryHeader)}</th><th>${Utils.escapeHTML(durationHeader)}</th><th>${Utils.escapeHTML(statusHeader)}</th></tr></thead>
                            <tbody>
                                ${visits.map(v => `
                                    <tr>
                                        <td data-label="${Utils.escapeHTML(dateHeader)}">${Utils.formatDate(v.entryTime)}</td>
                                        <td data-label="${Utils.escapeHTML(entryHeader)}">${Utils.formatTime(v.entryTime)}</td>
                                        <td data-label="${Utils.escapeHTML(durationHeader)}">${App.calcVisitDuration(v)}</td>
                                        <td data-label="${Utils.escapeHTML(statusHeader)}">${v.isUnpaid ? `<span class="badge badge-inactive">${Utils.escapeHTML(map.memberViewStatusUnpaid || 'Unpaid')}</span>` : `<span class="badge badge-active">${Utils.escapeHTML(map.memberViewStatusPaid || 'Paid')}</span>`}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>`;
                }
            },

            // Training count used by the member stats (Total Trainings, averages).
            // Counts only actual class sessions (unique class/date/time-slot check-ins).
            // Open-gym visits (no class selected) are intentionally excluded here — they
            // appear only on the leaderboard via getMemberLeaderboardCount.
            getMemberTrainingCount: (memberId, sinceDate = null, untilDate = null) => {
                const checkins = DB.getClassCheckins().filter(ci => ci.memberId === memberId && ci.entryTime);
                let filtered = checkins;
                if (sinceDate) filtered = filtered.filter(ci => new Date(ci.entryTime) >= sinceDate);
                if (untilDate) filtered = filtered.filter(ci => new Date(ci.entryTime) < untilDate);

                const uniqueSessionKeys = new Set();
                filtered.forEach(ci => {
                    const dateKey = ci.slotDate || (ci.entryTime ? Utils.dateToLocalIso(new Date(ci.entryTime)) : '');
                    const sessionKey = `${dateKey}|${ci.classId}|${ci.slotStart || ''}|${ci.slotEnd || ''}`;
                    uniqueSessionKeys.add(sessionKey);
                });

                return uniqueSessionKeys.size;
            },

            // Leaderboard count = class sessions + open-gym visits (a visit with no class
            // check-in). This is what ranks members on the leaderboard; Total Trainings in
            // the member stats deliberately excludes open gym.
            getMemberLeaderboardCount: (memberId, sinceDate = null) => {
                const classCount = App.getMemberTrainingCount(memberId, sinceDate);
                const checkinVisitIds = new Set(DB.getClassCheckins()
                    .filter(c => c.memberId === memberId)
                    .map(c => c.visitId));
                const visits = DB.getVisits().filter(v => v.memberId === memberId
                    && (!sinceDate || new Date(v.entryTime) >= sinceDate));
                const openGym = visits.filter(v => !checkinVisitIds.has(v.id)).length;
                return classCount + openGym;
            },

            getMemberLeaderboardRank: (memberId) => {
                const entry = App.getLeaderboardStandings().find(e => e.member.id === memberId);
                return entry ? entry.rank : null;
            },

            // Total minutes trained: sums the duration of each unique class session
            // (date/class/slot), falling back to visit entry→exit duration for legacy
            // records logged before class-level check-ins. Mirrors getMemberTrainingCount
            // so "Total Hours Trained" counts the same sessions as "Total Trainings".
            getMemberTotalHours: (memberId) => {
                const checkins = DB.getClassCheckins().filter(ci => ci.memberId === memberId && ci.entryTime);
                if (checkins.length > 0) {
                    const seen = new Set();
                    let totalMins = 0;
                    checkins.forEach(ci => {
                        const dateKey = ci.slotDate || (ci.entryTime ? Utils.dateToLocalIso(new Date(ci.entryTime)) : '');
                        const key = `${dateKey}|${ci.classId}|${ci.slotStart || ''}|${ci.slotEnd || ''}`;
                        if (seen.has(key)) return;
                        seen.add(key);
                        let mins = 60;
                        if (ci.slotStart && ci.slotEnd) {
                            const [sh, sm] = ci.slotStart.split(':').map(Number);
                            const [eh, em] = ci.slotEnd.split(':').map(Number);
                            const dur = (eh * 60 + em) - (sh * 60 + sm);
                            if (dur > 0 && dur < 24 * 60) mins = dur;
                        }
                        totalMins += mins;
                    });
                    return totalMins;
                }
                return DB.getVisits().filter(v => v.memberId === memberId && v.entryTime && v.exitTime)
                    .reduce((s, v) => s + Math.max(0, Math.round((new Date(v.exitTime) - new Date(v.entryTime)) / 60000)), 0);
            },

            getMemberStatsHTML: (memberId, opts = {}) => {
                const visits = DB.getVisits().filter(v => v.memberId === memberId);
                const checkins = DB.getClassCheckins().filter(ci => ci.memberId === memberId && ci.entryTime);
                const total = App.getMemberTrainingCount(memberId);
                let perWeek = 0;
                let perMonth = 0;
                let perWeekDays = 0;
                let perMonthDays = 0;
                let perDay = '0';
                const lang = App.currentKioskLang || 'en';
                const map = App.isAdminAuthed() ? App.KIOSK_I18N.en : (App.KIOSK_I18N[lang] || App.KIOSK_I18N.en);
                const rank = App.getMemberLeaderboardRank(memberId);
                const rankDisplay = rank ? `#${rank}` : (map.memberViewRankUnranked || 'Unranked');
                
                if (total > 0) {
                    const allDates = [
                        ...visits.map(v => new Date(v.entryTime)),
                        ...checkins.map(ci => new Date(ci.entryTime))
                    ];
                    const firstDate = new Date(Math.min(...allDates.map(date => date.getTime())));
                    const now = new Date();
                    const weeks = Math.max(1, (now - firstDate) / (1000 * 60 * 60 * 24 * 7));
                    const months = Math.max(1, (now - firstDate) / (1000 * 60 * 60 * 24 * 30));
                    perWeek = (total / weeks).toFixed(1);
                    perMonth = (total / months).toFixed(1);
                    // Distinct training DAYS (local calendar date) across visits and
                    // class check-ins, so two trainings in the same day count as one day.
                    const daySet = new Set(allDates.map(d => Utils.dateToLocalIso(d)));
                    perWeekDays = (daySet.size / weeks).toFixed(1);
                    perMonthDays = (daySet.size / months).toFixed(1);
                    perDay = (total / daySet.size).toFixed(1);
                }

                // Admins (member modal) always see every stat; the member portal
                // respects the visibility toggles AND the Week/Month mode switcher
                // (which decides whether the averages are shown per week or per month).
                // memberView forces member-facing behavior even if an admin is signed in
                // on the same browser.
                const show = (key) => {
                    if (opts.memberView) return DB.getMemberStatsVisibility()[key] !== false;
                    return App.isAdminAuthed() || DB.getMemberStatsVisibility()[key] !== false;
                };
                const mode = (opts.memberView || !App.isAdminAuthed()) ? (App.memberStatsMode === 'month' ? 'month' : 'week') : 'both';
                const cards = [];
                if (show('totalTrainings')) cards.push(`
                    <div class="stat-card" style="padding: 1rem;">
                        <h3>${Utils.escapeHTML(map.memberViewTotalTrainings || 'Total Trainings')}</h3>
                        <div class="value" style="font-size: 1.5rem;">${total}</div>
                    </div>`);
                if (show('totalHours')) cards.push(`
                    <div class="stat-card" style="padding: 1rem;">
                        <h3>${Utils.escapeHTML(map.memberViewTotalHours || 'Total Hours Trained')}</h3>
                        <div class="value" style="font-size: 1.5rem;">${Utils.formatDurationMins(App.getMemberTotalHours(memberId))}</div>
                    </div>`);
                if (mode === 'week' || mode === 'both') {
                    if (show('avgWeek')) cards.push(`
                        <div class="stat-card" style="padding: 1rem;">
                            <h3>${Utils.escapeHTML(map.memberViewAvgWeek || 'Avg Trainings / Week')}</h3>
                            <div class="value" style="font-size: 1.5rem;">${perWeek}</div>
                        </div>`);
                    if (show('avgDays')) cards.push(`
                        <div class="stat-card" style="padding: 1rem;">
                            <h3>${Utils.escapeHTML(map.memberViewAvgDays || 'Avg Days / Week')}</h3>
                            <div class="value" style="font-size: 1.5rem;">${perWeekDays}</div>
                        </div>`);
                }
                if (mode === 'month' || mode === 'both') {
                    if (show('avgMonth')) cards.push(`
                        <div class="stat-card" style="padding: 1rem;">
                            <h3>${Utils.escapeHTML(map.memberViewAvgMonth || 'Avg Trainings / Month')}</h3>
                            <div class="value" style="font-size: 1.5rem;">${perMonth}</div>
                        </div>`);
                }
                if (show('avgDay')) cards.push(`
                    <div class="stat-card" style="padding: 1rem;">
                        <h3>${Utils.escapeHTML(map.memberViewAvgDay || 'Avg Trainings / Day')}</h3>
                        <div class="value" style="font-size: 1.5rem;">${perDay}</div>
                    </div>`);
                if (show('avgDaysMonth')) cards.push(`
                    <div class="stat-card" style="padding: 1rem;">
                        <h3>${Utils.escapeHTML(map.memberViewAvgDaysMonth || 'Avg Days / Month')}</h3>
                        <div class="value" style="font-size: 1.5rem;">${perMonthDays}</div>
                    </div>`);
                if (!opts.separateRank && show('rank')) cards.push(`
                    <div class="stat-card stat-card-rank" style="padding: 1rem;">
                        <h3>${Utils.escapeHTML((map.memberViewRankLabel || 'Leaderboard Rank') + (map.memberViewRank90d || ' (last 90 days)'))}</h3>
                        <div class="value" style="font-size: 1.5rem;">${Utils.escapeHTML(rankDisplay)}</div>
                    </div>`);
                return cards.join('');
            },

            setMemberStatsMode: (mode) => {
                App.memberStatsMode = mode === 'month' ? 'month' : 'week';
                localStorage.setItem('gym_member_stats_mode', App.memberStatsMode);
                App.updateMemberStatsModeUI();
                if (App.currentUser) App.renderMemberDashboard();
            },

            updateMemberStatsModeUI: () => {
                const weekBtn = document.getElementById('member-stats-mode-week');
                const monthBtn = document.getElementById('member-stats-mode-month');
                const isMonth = App.memberStatsMode === 'month';
                if (weekBtn) weekBtn.classList.toggle('active', !isMonth);
                if (monthBtn) monthBtn.classList.toggle('active', isMonth);
            },

            toggleHideFromLeaderboard: (checked) => {
                const member = App.currentUser;
                if (!member) return;
                const members = DB.getMembers();
                const index = members.findIndex(m => m.id === member.id);
                if (index === -1) return;
                members[index].hideFromLeaderboard = !!checked;
                DB.saveMembers(members);
                App.currentUser = members[index];
                App.updateMemberLeaderboardToggleUI();
                App.renderKioskLeaderboard();
            },

            updateMemberLeaderboardToggleUI: () => {
                const member = App.currentUser;
                const checkbox = document.getElementById('member-hide-lb-toggle');
                if (!checkbox || !member) return;
                const hidden = !!member.hideFromLeaderboard;
                checkbox.checked = hidden;
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                const label = document.getElementById('member-hide-lb-label');
                if (label) label.innerText = hidden ? (map.memberHideLbHidden || 'Hidden') : (map.memberHideLbVisible || 'Visible');
            },

            renderMemberDashboard: () => {
                const member = App.currentUser;
                if (!member) return;

                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;

                document.getElementById('member-dash-title').innerText = `${map.memberViewWelcome || 'Welcome'}, ${member.firstName}!`;

                const hasValidity = !!member.expirationDate;
                const daysRemaining = hasValidity ? Utils.getDaysRemaining(member.expirationDate) : null;
                const isFrozen = member.accountStatus === 'Frozen';
                const isCancelled = member.accountStatus === 'Cancelled';
                const isInactive = member.accountStatus === 'Inactive';

                // Expiration countdown banner: only for currently-valid memberships ending
                // within 7 days (expired members already get the red status line instead).
                const expiryBanner = document.getElementById('member-expiry-banner');
                if (expiryBanner) {
                    const showBanner = hasValidity && daysRemaining >= 0 && daysRemaining <= 7
                        && !isFrozen && !isCancelled && !isInactive;
                    expiryBanner.classList.toggle('hidden', !showBanner);
                    if (showBanner) {
                        expiryBanner.innerHTML = `⏳ ${Utils.escapeHTML(map.memberExpiryBanner || 'Your membership expires in')} <strong>${daysRemaining}</strong> ${Utils.escapeHTML(map.memberStatusDaysLeft || 'days left')} (${Utils.formatDate(member.expirationDate)}).`;
                    }
                }
                
                let statusText = '';
                if (isFrozen) {
                    statusText = `<span style="color:var(--warning)">${Utils.escapeHTML(map.memberStatusFrozen || 'Frozen')}</span>`;
                } else if (isCancelled) {
                    statusText = `<span style="color:var(--danger)">${Utils.escapeHTML(map.memberStatusCancelled || 'Cancelled')}</span>`;
                } else if (isInactive) {
                    statusText = `<span style="color:var(--danger)">${Utils.escapeHTML(map.memberStatusInactive || 'Inactive')}</span>`;
                } else if (hasValidity && Utils.getDaysRemaining(member.expirationDate) < 0) {
                    statusText = `<span style="color:var(--danger)">${Utils.escapeHTML(map.memberStatusExpired || 'Expired')}</span>`;
                } else {
                    // Active — days remaining shown on the Expiration Date line instead.
                    statusText = `<span style="color:var(--success)">${Utils.escapeHTML(map.memberStatusActive || 'Active')}</span>`;
                }

                // Expiration shown with the same aesthetics as the Account Status line.
                let expText;
                if (member.expirationDate) {
                    const days = Utils.getDaysRemaining(member.expirationDate);
                    if (days >= 0) {
                        expText = `<span style="color:var(--success)">${Utils.formatDate(member.expirationDate)} (${days} ${Utils.escapeHTML(map.memberStatusDaysLeft || 'days left')})</span>`;
                    } else {
                        expText = `<span style="color:var(--danger)">${Utils.formatDate(member.expirationDate)} (${Utils.escapeHTML(map.memberStatusExpired || 'expired')})</span>`;
                    }
                } else if (!member.sessionsTotal) {
                    expText = `<span class="text-gray">N/A</span>`;
                } else {
                    expText = '<span class="text-gray">—</span>';
                }

                // Session-based members: their remaining bundle as its own info line with a
                // progress bar (ledger-granted total), matching the other info lines instead
                // of living inside the Training Stats stat grid.
                let sessionsLine = '';
                if (member.sessionsTotal) {
                    const sLeft = parseInt(member.sessionsLeft, 10) || 0;
                    const sTotal = DB.getPayments()
                        .filter(p => p.memberId === member.id && p.sessionsGranted && parseInt(p.sessionsGranted, 10) > 0)
                        .reduce((s, p) => s + parseInt(p.sessionsGranted, 10), 0);
                    const sPct = sTotal > 0 ? Math.round(sLeft / sTotal * 100) : (sLeft > 0 ? 100 : 0);
                    const sColor = sPct > 50 ? 'var(--success)' : sPct > 20 ? 'var(--warning)' : 'var(--danger)';
                    sessionsLine = `
                        <div class="mt-1" style="font-size:1.1rem;">
                            <strong>${Utils.escapeHTML(map.memberSessionsLeft || 'Sessions Left')}:</strong>
                            <span style="font-weight:800; color:var(--dark);">${sLeft}</span>${sTotal > 0 ? `<span class="text-gray" style="font-size:0.9rem;"> / ${sTotal}</span>` : ''}
                            <div class="attendance-bar" style="max-width:280px;"><div class="attendance-bar-fill" style="width:${sPct}%; background:${sColor};"></div></div>
                        </div>`;
                }

                document.getElementById('member-dash-info-lines').innerHTML = `
                    <div style="font-size:1.1rem; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;"><strong>${Utils.escapeHTML(map.memberViewCurrentBelt || 'Current Belt:')}</strong> ${Utils.getBeltBadge(member.belt)}</div>
                    <div class="mt-1" style="font-size:1.1rem;"><strong>${Utils.escapeHTML(map.memberViewMemberId || 'Member ID:')}</strong> <span class="text-gray" style="font-size:0.95rem;">${Utils.escapeHTML(member.id)}</span></div>
                    <div class="mt-1" style="font-size:1.1rem;"><strong>${Utils.escapeHTML(map.memberViewAccountStatus || 'Account Status:')}</strong> ${statusText}</div>
                    <div class="mt-1" style="font-size:1.1rem;"><strong>${Utils.escapeHTML(map.memberViewExpiration || 'Expiration Date:')}</strong> ${expText}</div>
                    ${sessionsLine}
                `;

                let statsHTML = '';
                try { statsHTML = App.getMemberStatsHTML(member.id, { separateRank: false, memberView: true }); } catch (e) { console.warn('member stats render failed', e); }
                document.getElementById('member-dash-stats').innerHTML = statsHTML || `<div class="text-gray" style="text-align:center; font-size:0.95rem; padding: 0.75rem;">${Utils.escapeHTML(map.memberViewNoStats || 'No statistics to show.')}</div>`;
                App.updateMemberStatsModeUI();
                App.updateMemberLeaderboardToggleUI();
                try { App.renderMemberHistory(member.id, 'member-personal-history'); } catch (e) { console.warn('member history render failed', e); }
                try { App.renderMemberAttendancePortal(); } catch (e) { console.warn('member attendance render failed', e); }

                const unpaidVisits = DB.getVisits().filter(v => v.memberId === member.id && v.isUnpaid);
                const unpaidCard = document.getElementById('member-unpaid-card');
                if (unpaidCard) unpaidCard.classList.toggle('hidden', unpaidVisits.length === 0);
                const listEl = document.getElementById('member-unpaid-visits-list');

                if (unpaidVisits.length > 0) {
                    const dateHeader = map.memberUnpaidDateHeader || 'Date';
                    const entryHeader = map.memberUnpaidEntryHeader || 'Entry Time';
                    const durationHeader = map.memberUnpaidDurationHeader || 'Duration';
                    listEl.innerHTML = unpaidVisits.sort((a,b) => new Date(b.entryTime) - new Date(a.entryTime)).map(v => `
                        <tr>
                            <td data-label="${Utils.escapeHTML(dateHeader)}">${Utils.formatDate(v.entryTime)}</td>
                            <td data-label="${Utils.escapeHTML(entryHeader)}">${Utils.formatTime(v.entryTime)}</td>
                            <td data-label="${Utils.escapeHTML(durationHeader)}">${App.calcVisitDuration(v)}</td>
                        </tr>
                    `).join('');
                }
            },

            // Member-facing attendance: fixed 90-day window, showing only classes that are
            // public or that the member has attended at least once in the last 90 days.
            renderMemberAttendancePortal: () => {
                const el = document.getElementById('member-dash-attendance');
                if (!el) return;
                const member = App.currentUser;
                if (!member) return;
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;

                const titleEl = document.getElementById('member-attendance-title');
                if (titleEl) titleEl.innerText = map.memberViewAttendanceTitle || 'My Attendance';
                const subEl = document.getElementById('member-attendance-sub');
                if (subEl) subEl.innerText = map.memberViewAttendanceWindow || 'Last 90 days';

                const until = new Date();
                until.setHours(23, 59, 59, 999);
                const since = new Date(until.getTime() - 89 * 24 * 3600 * 1000);
                since.setHours(0, 0, 0, 0);
                let res;
                try {
                    res = App.getMemberAttendance(member.id, since, until, { onlyPublicOrAttended: true, lookbackDays: 90 });
                } catch (e) {
                    console.warn('member attendance compute failed', e);
                    el.innerHTML = `<div class="text-gray">${Utils.escapeHTML(map.memberViewNoAttendance || 'No class sessions available in this period.')}</div>`;
                    return;
                }

                if (res.pct == null) {
                    el.innerHTML = `<div class="text-gray">${Utils.escapeHTML(map.memberViewNoAttendance || 'No class sessions available in this period.')}</div>`;
                    return;
                }
                // Positive-only feedback: an emoji + colored percentage per tier (nothing
                // below 50% so it never discourages), up to the sloth mascot at 98%+.
                const overallLabel = map.memberViewAttendanceOverall || 'Overall';
                const overallColor = App.attendanceColor(res.pct);

                // Best class = the highest-%. class with a real positive score (>= 50%);
                // a 0% "best class" is meaningless, so below the feedback threshold the
                // highlight is skipped entirely. Streak = consecutive weeks (Mon-based)
                // with at least one training inside the window.
                const bestClass = res.perClass.find(c => !c.notAttending && c.pct != null && c.pct >= 50) || null;
                const weekSet = new Set();
                DB.getClassCheckins().forEach(ci => {
                    if (ci.memberId !== member.id || !ci.entryTime) return;
                    const d = new Date(ci.entryTime);
                    if (isNaN(d.getTime()) || d < since || d >= until) return;
                    const wk = new Date(d);
                    wk.setHours(0, 0, 0, 0);
                    wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7));
                    weekSet.add(wk.toISOString());
                });
                let streak = 0;
                const sortedWeeks = [...weekSet].sort((a, b) => new Date(b) - new Date(a));
                if (sortedWeeks.length) {
                    const last = new Date(sortedWeeks[0]);
                    const thisWeek = new Date();
                    thisWeek.setHours(0, 0, 0, 0);
                    thisWeek.setDate(thisWeek.getDate() - ((thisWeek.getDay() + 6) % 7));
                    const current = new Date(thisWeek.toISOString());
                    // Count back from the latest attended week. If the current week has no
                    // training yet, start from the previous week so the streak isn't reset.
                    let anchor = last < current ? last : current;
                    const anchorSet = new Set(sortedWeeks.map(s => new Date(s).toISOString()));
                    while (anchorSet.has(anchor.toISOString())) {
                        streak++;
                        anchor.setDate(anchor.getDate() - 7);
                    }
                }
                let highlightsHTML = '';
                if (bestClass) {
                    const bc = App.attendanceColor(bestClass.pct) || 'var(--primary)';
                    highlightsHTML += `
                        <div class="att-highlight">
                            <span><strong>${Utils.escapeHTML(map.memberViewBestClass || 'Best Class')}:</strong> ${Utils.escapeHTML(bestClass.name)} <span style="color:${bc}; font-weight:800;">${bestClass.pct}%</span></span>
                        </div>`;
                }
                if (streak >= 2) {
                    highlightsHTML += `
                        <div class="att-highlight">
                            <span><strong>${Utils.escapeHTML(map.memberViewStreak || 'Streak')}:</strong> ${streak} ${streak === 1 ? (Utils.escapeHTML(map.memberViewStreakWeek || 'week')) : (Utils.escapeHTML(map.memberViewStreakWeeks || 'weeks'))}</span>
                        </div>`;
                }

                el.innerHTML = `
                    <div class="member-attendance-overview">
                        <div class="text-gray" style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:0.25rem;">${Utils.escapeHTML(overallLabel)}</div>
                        <div class="member-attendance-big">${App.attendanceEmoji(res.pct) ? `<span style="margin-right:0.4rem;">${Utils.escapeHTML(App.attendanceEmoji(res.pct))}</span>` : ''}${res.pct}%</div>
                        <div class="attendance-bar"><div class="attendance-bar-fill" style="width:${res.pct}%; ${overallColor ? `background:${overallColor};` : 'background:var(--gray);'}"></div></div>
                        <div class="member-attendance-sessions">${res.attended} / ${res.available} ${Utils.escapeHTML(map.memberViewAttendanceSessions || 'sessions')}</div>
                    </div>
                    ${highlightsHTML ? `<div class="member-attendance-highlights">${highlightsHTML}</div>` : ''}
                    ${res.perClass.length ? `
                        <div class="member-attendance-classes">
                            ${res.perClass.map(c => {
                                if (c.notAttending) {
                                    return `
                                    <div class="att-class-row att-class-not-attending">
                                        <strong class="att-class-name">${Utils.escapeHTML(c.name)}</strong>
                                        <div class="att-class-bar"></div>
                                        <span class="att-class-pct text-gray" style="font-style:italic;">${Utils.escapeHTML(map.memberViewNotAttending || 'Not attending')}</span>
                                    </div>`;
                                }
                                const cc = App.attendanceColor(c.pct);
                                return `
                                <div class="att-class-row">
                                    <strong class="att-class-name">${Utils.escapeHTML(c.name)}</strong>
                                    <div class="att-class-bar">${c.pct != null ? `<div class="att-class-fill" style="width:${c.pct}%; ${cc ? `background:${cc};` : 'background:var(--gray);'}"></div>` : ''}</div>
                                    <span class="att-class-pct" style="color:${c.pct != null ? (cc || 'inherit') : 'inherit'};">${c.pct == null ? '—' : c.pct + '%'}</span>
                                    <span class="att-class-emoji">${App.attendanceEmoji(c.pct)}</span>
                                </div>`;
                            }).join('')}
                        </div>` : `<div class="text-gray" style="text-align:center; padding:1rem 0;">${Utils.escapeHTML(map.memberViewNoAttendance || 'No class sessions available in this period.')}</div>`}
                `;
            },

            logout: () => {
                const memberDrawer = document.getElementById('member-drawer');
                const memberOverlay = document.getElementById('member-drawer-overlay');
                if (memberDrawer) memberDrawer.classList.remove('open');
                if (memberOverlay) memberOverlay.classList.remove('open');
                App.currentUser = null;
                App.isMobileCheckinMode = false;
                localStorage.removeItem('gym_member_session');
                // Sign out of Firebase admin session (if any) — onAuthStateChanged
                // will fire and lock/remove the admin view.
                const auth = getAuth();
                if (auth && auth.currentUser) {
                    auth.signOut().catch(err => console.warn('Admin sign-out failed', err));
                }
                document.getElementById('member-login-id').value = '';
                document.querySelectorAll('.app-container').forEach(el => el.classList.add('hidden'));
                document.getElementById('view-kiosk').classList.remove('hidden');
                App.renderLivePresent();
                App.renderKioskLeaderboard();
                App.renderCalendarView('kiosk-schedule-container', false);
                // Ensure any saved broadcast checkin notice is rendered on kiosk after admin locks system
                App.renderCheckinNotice();
                document.getElementById('kiosk-id-input').focus();
            },


});
