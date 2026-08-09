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
                const auth = getAuth();
                if (!auth) return alert('Firebase Auth is not available.');
                const provider = new firebase.auth.GoogleAuthProvider();
                const finish = () => {
                    const member = App.getMemberByFirebaseEmail();
                    if (member) {
                        App.setMemberSession(member);
                        App.showMemberDashboardFor(member);
                    } else {
                        alert('No member is linked to this Google account yet. Enter your member ID once to link it (or ask staff to add your email).');
                        document.getElementById('member-login-id').focus();
                    }
                };
                const fail = (err) => {
                    if (!err) return;
                    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
                    if (err.code === 'auth/unauthorized-domain') return alert('This domain is not authorized for Google sign-in. Add it in Firebase Console -> Authentication -> Settings -> Authorized domains.');
                    alert(err.message || 'Google sign-in failed. Please try again.');
                };
                if (App.isTouchDevice()) {
                    auth.signInWithRedirect(provider).catch(fail);
                } else {
                    auth.signInWithPopup(provider).then(finish).catch(fail);
                }
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

            changeMemberId: () => {
                const newId = document.getElementById('member-new-id').value.trim();
                if (!newId || !/^\d{1,8}$/.test(newId)) return alert("Please enter a valid numeric ID (up to 8 digits).");
                if (newId === App.currentUser.id) return alert("This is already your ID.");
                
                const members = DB.getMembers();
                if (members.find(m => m.id === newId)) return alert("This ID is already taken by another member.");
                
                const oldId = App.currentUser.id;
                const index = members.findIndex(m => m.id === oldId);
                if (index > -1) {
                    members[index].id = newId;
                    DB.saveMembers(members);
                    // Tell the sync engine so it can move the member doc
                    // (create new docId + defer deleting the old one).
                    FSEngine.notifyRename(oldId, newId);
                    
                    const visits = DB.getVisits();
                    visits.forEach(v => { if (v.memberId === oldId) v.memberId = newId; });
                    DB.saveVisits(visits);
                    
                    // Rewrite class check-ins too, or their attendance would be orphaned
                    // (classCheckins are matched by memberId everywhere: kiosk, admin, leaderboard).
                    const checkins = DB.getClassCheckins();
                    checkins.forEach(c => { if (c.memberId === oldId) c.memberId = newId; });
                    DB.saveClassCheckins(checkins);
                    
                    App.currentUser = members[index];
                    localStorage.setItem('gym_member_session', newId);
                    alert("ID successfully updated!");
                    document.getElementById('member-new-id').value = '';
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

            // Training count used by the leaderboard and member stats.
            // Intentional: one "training" = one unique class/date/time-slot check-in,
            // NOT one check-in action. A member who checks in for two classes in a
            // single action (e.g. back-to-back classes) therefore earns TWO trainings
            // here, even though session bundles are consumed per action (see
            // confirmKioskClassSelection / confirmAdminCheckinSelection).
            // Falls back to raw visit count only when no class check-ins exist
            // (legacy data recorded before class-level check-ins).
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

                if (uniqueSessionKeys.size > 0) {
                    return uniqueSessionKeys.size;
                }

                const visits = DB.getVisits().filter(v => v.memberId === memberId
                    && (!sinceDate || new Date(v.entryTime) >= sinceDate)
                    && (!untilDate || new Date(v.entryTime) < untilDate));
                return visits.length;
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

            getMemberStatsHTML: (memberId) => {
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
                const show = (key) => App.isAdminAuthed() || DB.getMemberStatsVisibility()[key] !== false;
                const mode = App.isAdminAuthed() ? 'both' : (App.memberStatsMode === 'month' ? 'month' : 'week');
                const cards = [];
                if (show('totalTrainings')) cards.push(`
                    <div class="stat-card" style="padding: 1rem;">
                        <h3>${Utils.escapeHTML(map.memberViewTotalTrainings || 'Total Trainings')}</h3>
                        <div class="value" style="font-size: 1.5rem;">${total}</div>
                    </div>`);
                if (show('totalHours')) cards.push(`
                    <div class="stat-card" style="padding: 1rem;">
                        <h3>${Utils.escapeHTML(map.memberViewTotalHours || 'Total Hours Trained')}</h3>
                        <div class="value" style="font-size: 1.5rem;">${(App.getMemberTotalHours(memberId) / 60).toFixed(1)}</div>
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
                    if (show('avgDays')) cards.push(`
                        <div class="stat-card" style="padding: 1rem;">
                            <h3>${Utils.escapeHTML(map.memberViewAvgDaysMonth || 'Avg Days / Month')}</h3>
                            <div class="value" style="font-size: 1.5rem;">${perMonthDays}</div>
                        </div>`);
                }
                if (show('avgDay')) cards.push(`
                    <div class="stat-card" style="padding: 1rem;">
                        <h3>${Utils.escapeHTML(map.memberViewAvgDay || 'Avg Trainings / Day')}</h3>
                        <div class="value" style="font-size: 1.5rem;">${perDay}</div>
                    </div>`);
                if (show('rank')) cards.push(`
                    <div class="stat-card" style="padding: 1rem;">
                        <h3>${Utils.escapeHTML(map.memberViewRankLabel || 'Leaderboard Rank')}</h3>
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
                    // Active: if validity-based show days remaining, otherwise just show Active
                    if (hasValidity) {
                        statusText = `<span style="color:var(--success)">${Utils.escapeHTML(map.memberStatusActive || 'Active')} (${daysRemaining} ${Utils.escapeHTML(map.memberStatusDaysLeft || 'days left')})</span>`;
                    } else {
                        statusText = `<span style="color:var(--success)">${Utils.escapeHTML(map.memberStatusActive || 'Active')}</span>`;
                    }
                    if (member.sessionsTotal) {
                        const sLeft = parseInt(member.sessionsLeft) || 0;
                        statusText += ` | ${Utils.escapeHTML(map.memberSessionsLeft || 'Sessions Left')}: <strong style="color:var(--primary);">${sLeft}</strong>`;
                    }
                }

                // Determine how to display expiration: hide for session-only packages with no validity date
                let expDisplay = '';
                if (member.expirationDate) expDisplay = Utils.formatDate(member.expirationDate);
                else if (!member.sessionsTotal) expDisplay = 'N/A';
                else expDisplay = '';

                document.getElementById('member-dash-info').innerHTML = `
                    <div style="font-size: 1.25rem;"><strong>${Utils.escapeHTML(map.memberViewCurrentBelt || 'Current Belt:')}</strong> ${Utils.getBeltBadge(member.belt)}</div>
                    <div class="mt-1" style="font-size: 1.1rem;"><strong>${Utils.escapeHTML(map.memberViewAccountStatus || 'Account Status:')}</strong> ${statusText}</div>
                    <div class="text-gray mt-1">${Utils.escapeHTML(map.memberViewExpiration || 'Expiration Date:')} ${expDisplay}</div>
                `;

                const statsHTML = App.getMemberStatsHTML(member.id);
                document.getElementById('member-dash-stats').innerHTML = statsHTML || `<div class="text-gray" style="text-align:center; font-size:0.95rem; padding: 0.75rem;">${Utils.escapeHTML(map.memberViewNoStats || 'No statistics to show.')}</div>`;
                App.updateMemberStatsModeUI();
                const statsTitle = document.getElementById('member-stats-title');
                const weekBtn = document.getElementById('member-stats-mode-week');
                const monthBtn = document.getElementById('member-stats-mode-month');
                if (statsTitle) statsTitle.innerText = map.memberViewStatsTitle || 'Statistics';
                if (weekBtn) weekBtn.innerText = map.memberViewWeek || 'Week';
                if (monthBtn) monthBtn.innerText = map.memberViewMonth || 'Month';
                App.updateMemberLeaderboardToggleUI();
                App.renderMemberHistory(member.id, 'member-personal-history');

                const unpaidVisits = DB.getVisits().filter(v => v.memberId === member.id && v.isUnpaid);
                const listEl = document.getElementById('member-unpaid-visits-list');
                
                if (unpaidVisits.length === 0) {
                    listEl.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--success); font-weight: bold;">${Utils.escapeHTML(map.memberViewNoUnpaid || 'You have no unpaid trainings!')}</td></tr>`;
                } else {
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
