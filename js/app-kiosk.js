// =====================================================================
// app-kiosk.js
// App methods: numpadPress, updateKioskInputMode, openClassDetails, cancelKioskClassSelection, showKioskAlert, kioskSubmit, openCheckinClassModal, toggleCheckinClass, cleanupClassCheckins, confirmKioskClassSelection, showKioskMessage, renderLivePresent, getLeaderboardStandings, leaderboardRankCell, renderKioskLeaderboard, kioskChartColor, getCumulativeTrainingSeries, setKioskChartRange, renderKioskChart, checkoutVisit, setBountyLeaderboardDate, bountyLbDateNav
// Plain script (no ES modules). Methods attach to the global App object
// created in app-core.js. Load order is fixed in index.html.
// =====================================================================
Object.assign(App, {
            toggleKioskMenu: () => {
                const drawer = document.getElementById('kiosk-drawer');
                const overlay = document.getElementById('kiosk-drawer-overlay');
                if (drawer) drawer.classList.toggle('open');
                if (overlay) overlay.classList.toggle('open');
            },

            numpadPress: (val) => {
                const input = document.getElementById('kiosk-id-input');
                if (val === 'clear') { input.value = ''; }
                else if (val === 'back') { input.value = input.value.slice(0, -1); }
                else { if(input.value.length < 8) input.value += val; }
                input.focus();
            },
 
            updateKioskInputMode: () => {
                const input = document.getElementById('kiosk-id-input');
                if (!input) return;
 
                const isSmallLayout = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
                const useOnScreenKeys = isSmallLayout;
 
                if (useOnScreenKeys) {
                    input.setAttribute('readonly', 'readonly');
                    input.setAttribute('inputmode', 'none');
                } else {
                    input.removeAttribute('readonly');
                    input.setAttribute('inputmode', 'numeric');
                }
            },
 
            openClassDetails: (classId, slotDay, slotStart, slotEnd) => {
                const cls = DB.getSchedules().find(c => c.id === classId);
                if (!cls) return;
                const content = document.getElementById('class-details-content');
                if (!content) return;
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                const scheduleDate = App.getWeekdayDateForCurrentWeek(slotDay);
                const scheduleDateStr = scheduleDate ? Utils.dateToLocalIso(scheduleDate) : null;
                const displayDate = scheduleDateStr ? Utils.formatDateLocalized(scheduleDateStr, lang) : null;
                const activeMembers = DB.getMembers();
                const activeMemberIds = new Set(activeMembers.map(m => m.id));
                const checkins = DB.getClassCheckins().filter(checkin => {
                    if (checkin.classId !== classId) return false;
                    // Exclude check-ins from deleted members
                    if (!activeMemberIds.has(checkin.memberId)) return false;
                    if (!scheduleDateStr) return true;

                    const checkinDate = checkin.slotDate || (checkin.entryTime ? Utils.dateToLocalIso(new Date(checkin.entryTime)) : null);
                    if (checkinDate !== scheduleDateStr) return false;

                    if (slotStart && slotEnd) {
                        if (checkin.slotStart && checkin.slotStart !== slotStart) return false;
                        if (checkin.slotEnd && checkin.slotEnd !== slotEnd) return false;

                        if (!checkin.slotStart || !checkin.slotEnd) {
                            const entryTime = checkin.entryTime ? new Date(checkin.entryTime) : null;
                            if (entryTime) {
                                const [startHour, startMin] = slotStart.split(':').map(Number);
                                const [endHour, endMin] = slotEnd.split(':').map(Number);
                                const slotStartDate = new Date(scheduleDateStr + 'T' + slotStart + ':00');
                                const slotEndDate = new Date(scheduleDateStr + 'T' + slotEnd + ':00');
                                if (entryTime < slotStartDate || entryTime > slotEndDate) return false;
                            }
                        }
                    }

                    return true;
                });
                const recentCheckins = [...checkins].sort((a,b) => new Date(b.entryTime) - new Date(a.entryTime)).slice(0, 5);
                const slotDayLabel = App.currentKioskLang && App.KIOSK_I18N[App.currentKioskLang]
                    ? App.KIOSK_I18N[App.currentKioskLang].days[slotDay] || slotDay
                    : slotDay;

                content.innerHTML = `
                    <div class="card plan-card public-class-card cursor-pointer" onclick="App.togglePublicClassDetails(this)" style="margin-bottom: 1rem; border: 1px solid var(--gray-light); border-left: 6px solid ${cls.color || '#2563eb'}; transition: 0.2s ease;">
                        <div class="public-card-head flex justify-between align-center" style="gap: 0.75rem;">
                            <h3 style="margin: 0; color: ${cls.color || '#2563eb'};">${Utils.escapeHTML(cls.name)}</h3>
                            <span class="text-gray public-class-expand-label" style="font-size: 0.8rem; flex-shrink: 0;">${Utils.escapeHTML(map.classExpandDetails || 'View schedule & details')} ▸</span>
                        </div>
                        <div class="text-gray mt-1" style="font-size: 0.85rem; overflow-wrap: anywhere; word-break: break-word;">${Utils.escapeHTML(slotDayLabel)}${displayDate ? ` • ${Utils.escapeHTML(displayDate)}` : ''}${slotStart ? ` • ${Utils.escapeHTML(Utils.convertTo12Hour(slotStart))} - ${Utils.escapeHTML(Utils.convertTo12Hour(slotEnd))}` : ''}</div>
                        <div class="public-class-details hidden mt-1" style="border-top: 1px solid var(--gray-light); padding-top: 0.75rem;">
                            ${cls.description
                                ? `<p class="text-gray" style="margin-top: 0; font-size: 0.95rem; overflow-wrap: anywhere; word-break: break-word;">${Utils.escapeHTML(cls.description)}</p>`
                                : `<p class="text-gray" style="margin-top: 0; font-size: 0.95rem; font-style: italic;">${Utils.escapeHTML(map.classDetailsNoDescription || 'No description available.')}</p>`}
                            ${cls.practitioners ? `<p style="margin:0 0 0.75rem 0; overflow-wrap: anywhere; word-break: break-word;"><strong>${Utils.escapeHTML(map.classDetailsPractitionersLabel || 'Practitioners / Members:')}</strong> ${Utils.escapeHTML(cls.practitioners)}</p>` : ''}
                            ${cls.requirements ? `<p style="margin:0 0 0.75rem 0; overflow-wrap: anywhere; word-break: break-word;"><strong>${Utils.escapeHTML(map.classDetailsRequirementsLabel || 'Requirements:')}</strong> ${Utils.escapeHTML(cls.requirements)}</p>` : ''}
                            <div style="margin-top: 0.5rem;">
                                <div class="text-gray" style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.25rem;">${Utils.escapeHTML(map.classScheduleLabel || 'Schedule:')}</div>
                                ${cls.slots.map(slot => {
                                    const slotDayLabelI18n = App.currentKioskLang && App.KIOSK_I18N[App.currentKioskLang]
                                        ? App.KIOSK_I18N[App.currentKioskLang].days[slot.day] || slot.day
                                        : slot.day;
                                    return `<div class="public-class-slot-row">
                                        <span class="badge" style="background: var(--light); color: var(--dark); min-width: 92px; justify-content: flex-start;">${Utils.escapeHTML(slotDayLabelI18n)}</span>
                                        <span class="slot-time">${Utils.escapeHTML(Utils.convertTo12Hour(slot.start))} - ${Utils.escapeHTML(Utils.convertTo12Hour(slot.end))}</span>
                                    </div>`;
                                }).join('')}
                            </div>
                            ${DB.getShowClassCheckins() ? `<div style="margin-top: 0.75rem; border-top: 1px solid var(--gray-light); padding-top: 0.75rem;" onclick="event.stopPropagation()">
                                <details style="cursor: pointer;">
                                    <summary style="font-weight: bold; outline: none; margin-bottom: 0.5rem;">${Utils.escapeHTML(map.classDetailsRecordedCheckins || 'Recorded Check-ins:')} <span class="badge" style="background: var(--gray); color: white;">${checkins.length}</span></summary>
                                    ${recentCheckins.length ? `<div class="text-gray" style="margin-top:0.5rem; font-size:0.95rem; padding-left: 1rem;"><strong>${Utils.escapeHTML(map.classDetailsRecentLabel || 'Recent:')}</strong><br> ${recentCheckins.map(checkin => {
                                        const member = DB.getMembers().find(m => m.id === checkin.memberId);
                                        const name = member ? `${Utils.escapeHTML(member.firstName)} ${Utils.escapeHTML(member.lastName)}` : Utils.escapeHTML(map.classDetailsUnknownMember || 'Unknown');
                                        return `• ${name}`;
                                    }).join('<br>')}</div>` : `<div class="text-gray" style="margin-top:0.5rem; font-size:0.95rem; padding-left: 1rem;">${Utils.escapeHTML(map.classDetailsNoCheckins || 'No recorded check-ins yet.')}</div>`}
                                </details>
                            </div>` : ''}
                        </div>
                    </div>
                `;
                App.openModal('modal-class-details');
            },

            cancelKioskClassSelection: () => {
                App.pendingCheckinMember = null;
                App.closeModal('modal-checkin-classes');
                App.showKioskMessage('Check-in cancelled. Enter your ID again to start over.', 'warning');
            },

            // PUBLIC PLANS UI (Filter by visibility)
            showKioskAlert: (title, msg, color) => {
                document.getElementById('kiosk-alert-title').innerText = title;
                document.getElementById('kiosk-alert-title').style.color = color;
                document.getElementById('kiosk-alert-msg').innerText = msg;
                App.openModal('modal-kiosk-alert');
                
                setTimeout(() => { 
                    if (!document.getElementById('modal-kiosk-alert').classList.contains('hidden')) {
                        App.closeModal('modal-kiosk-alert');
                    }
                }, 5000);
            },

            kioskSubmit: async () => {
                const input = document.getElementById('kiosk-id-input');
                const id = input.value.trim();
                if (!id) return;
                input.value = ''; input.focus();

                // Fresh clients (incognito, cleared cache) load members from the
                // cloud on boot — wait for the first snapshot instead of failing
                // the lookup against an empty local state.
                if (FSEngine && typeof FSEngine.whenReadyAll === 'function') {
                    App.showKioskMessage('Loading member list…', 'warning');
                    await FSEngine.whenReadyAll(['members', 'schedules', 'classCheckins']);
                }

                const member = DB.getMembers().find(m => m.id === id);
                if (!member) return App.showKioskMessage('Invalid ID. Member not found.', 'danger');
                if (member.accountStatus === 'Frozen') {
                    App.addNotification('Frozen Check-in Attempt', `${member.firstName} ${member.lastName} attempted to check in, but account is frozen.`, 'warning', member.id);
                    return App.showKioskMessage('Account is Frozen. Please see staff.', 'warning');
                }
                if (member.accountStatus === 'Cancelled') {
                    App.addNotification('Cancelled Check-in Attempt', `${member.firstName} ${member.lastName} attempted to check in, but account is cancelled.`, 'warning', member.id);
                    return App.showKioskMessage('Account is Cancelled. Please see staff.', 'warning');
                }

                // Inactive members are allowed to check in; their visit will be marked unpaid
                // and they will receive a post-check-in alert to see staff.

                // Determine unpaid/expired state using plan metadata
                const planDays = member.planDays != null ? parseInt(member.planDays, 10) : null;
                const daysRemaining = Utils.getDaysRemaining(member.expirationDate);
                // Default membership alert
                let membershipAlert = '';

                // Decide whether this visit should be marked unpaid by default
                const isUnpaidVisit = App.computeVisitUnpaid(member);

                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;

                // If the member is session-based (no planDays) but has zero sessions left, show a sessions warning instead of treating as unpaid for presentation
                if (member.sessionsTotal && (parseInt(member.sessionsLeft) || 0) <= 0) {
                    membershipAlert = map.kioskAlertSessions || 'Attention: You have used all your plan sessions. Please renew.';
                }

                if (planDays && daysRemaining >= 0 && daysRemaining <= 2) {
                    membershipAlert = (map.kioskAlertExpiring || 'Note: Your membership is about to end in ') + daysRemaining + (map.kioskAlertExpiringDays || ' days.');
                }

                App.pendingCheckinMember = { member, isUnpaidVisit, membershipAlert };
                App.openCheckinClassModal();
            },

            openCheckinClassModal: () => {
                const modal = document.getElementById('modal-checkin-classes');
                const content = document.getElementById('checkin-classes-content');
                const note = document.getElementById('checkin-classes-note');
                if (!modal || !content || !note || !App.pendingCheckinMember) return;
   
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                const noClassesText = map.checkinNoClassesText || 'There are no classes scheduled at this time. Confirm check-in to continue.';
                const noteText = map.checkinClassesNote || 'Select the class(es) you are attending before confirming your check-in.';
                const fallbackCheckinNotice = map.checkinFallbackNotice || 'Your check-in will still be recorded for gym access.';
                const selectText = map.checkinSelectButton || 'Select';
                const selectedText = map.checkinSelectedButton || 'Selected';
                const openGymSummary = map.checkinOpenGymSummary || 'Not taking a class today?';
                const openGymHint = map.checkinOpenGymHint || 'You can still check in for open gym time without selecting a class.';
                const openGymButton = map.checkinOpenGymButton || 'Check In Without a Class (Open Gym)';
   
                const member = App.pendingCheckinMember.member;
                const todayDate = new Date();
                const todayIso = Utils.dateToLocalIso(todayDate);
                const todayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][todayDate.getDay()];
                const schedules = (DB.getSchedules() || []).filter(cls => cls.isPublic !== false);
                const todaySlotEntries = [];
                const alreadyCheckedInSlotIds = new Set(DB.getClassCheckins()
                    .filter(checkin => checkin.memberId === member.id && checkin.slotDate === todayIso)
                    .map(checkin => App.normalizeScheduleSlotId(checkin.classId, checkin.slotDay, checkin.slotStart, checkin.slotEnd)));
   
                schedules.forEach(cls => {
                    (cls.slots || []).forEach(slot => {
                        if (slot.day !== todayName) return;
                        const slotId = App.normalizeScheduleSlotId(cls.id, slot.day, slot.start, slot.end);
                        todaySlotEntries.push({ ...cls, slot, slotId, alreadyCheckedIn: alreadyCheckedInSlotIds.has(slotId) });
                    });
                });
   
                if (todaySlotEntries.length === 0) {
                    content.innerHTML = `<p class="text-gray" style="padding: 1rem 0;">${Utils.escapeHTML(noClassesText)}</p>`;
                    note.innerText = fallbackCheckinNotice;
                } else {
                    const sorted = todaySlotEntries.sort((a, b) => {
                        if (a.slot.start !== b.slot.start) return a.slot.start.localeCompare(b.slot.start);
                        return a.name.localeCompare(b.name);
                    });
                    const availableCount = sorted.filter(entry => !entry.alreadyCheckedIn).length;
                    content.innerHTML = `<div class="checkin-class-grid">${sorted.map(entry => {
                        const dayLabel = App.currentKioskLang && App.KIOSK_I18N[App.currentKioskLang]
                            ? App.KIOSK_I18N[App.currentKioskLang].days[entry.slot.day] || entry.slot.day
                            : entry.slot.day;
                        const dateDisplay = Utils.formatDateLocalized(todayIso, lang);
                        const timeDisplay = `${Utils.convertTo12Hour(entry.slot.start)} - ${Utils.convertTo12Hour(entry.slot.end)}`;
                        const cardClass = `checkin-class-card${entry.alreadyCheckedIn ? ' disabled' : ''}`;
                        const actionText = entry.alreadyCheckedIn ? (map.checkinAlreadyCheckedInBadge || 'Already Checked In') : selectText;
                        const actionStyle = entry.alreadyCheckedIn ? 'background: #fde2e2; color: var(--danger);' : '';
                        const onclickAttr = entry.alreadyCheckedIn ? '' : `onclick="App.toggleCheckinClass('${entry.slotId}')"`;
                        return `
                            <div id="checkin-class-card-${entry.slotId}" class="${cardClass}" ${onclickAttr} style="border-left: 6px solid ${entry.color || '#2563eb'};">
                                <input type="checkbox" name="checkin-class" value="${entry.slotId}" data-class-id="${Utils.escapeHTML(entry.id)}" data-slot-day="${Utils.escapeHTML(entry.slot.day)}" data-slot-start="${Utils.escapeHTML(entry.slot.start)}" data-slot-end="${Utils.escapeHTML(entry.slot.end)}" data-slot-date="${todayIso}" ${entry.alreadyCheckedIn ? 'disabled' : ''} hidden>
                                <div style="display:flex; justify-content:space-between; align-items:center; gap: 0.75rem; flex-wrap: wrap;">
                                    <strong>${Utils.escapeHTML(entry.name)}</strong>
                                    <span class="badge badge-inside checkin-class-action-badge" style="font-size:0.8rem; ${actionStyle}">${Utils.escapeHTML(actionText)}</span>
                                </div>
                                <div class="text-gray" style="font-size:0.95rem; margin-top:0.5rem; overflow-wrap: anywhere; word-break: break-word;">${Utils.escapeHTML(dayLabel)} • ${Utils.escapeHTML(dateDisplay)}</div>
                                <div class="text-gray" style="font-size:0.95rem;">${Utils.escapeHTML(timeDisplay)}</div>
                            </div>
                        `;
                    }).join('')}</div>`;
                    note.innerText = availableCount > 0 ? noteText : (map.checkinAlreadyCheckedInText || 'You have already checked into all classes scheduled for today. Please ask staff for assistance.');
                }

                // Hidden menu: allow checking in without choosing a class (open gym),
                // shown both when there are classes to pick from and when none are scheduled.
                const openMenu = document.getElementById('checkin-classes-open-menu');
                if (openMenu) {
                    openMenu.classList.remove('hidden');
                    openMenu.innerHTML = `
                        <details class="checkin-open-details">
                            <summary class="checkin-open-summary">${Utils.escapeHTML(openGymSummary)}</summary>
                            <div class="checkin-open-body">
                                <p class="text-gray">${Utils.escapeHTML(openGymHint)}</p>
                                <button class="btn-outline w-full" style="font-weight:600;" onclick="App.confirmCheckin(true)">${Utils.escapeHTML(openGymButton)}</button>
                            </div>
                        </details>`;
                }
   
                App.openModal('modal-checkin-classes');
            },

            kioskCheckinWithoutClass: () => {
                App.confirmCheckin(true);
            },
 
            toggleCheckinClass: (slotId) => {
                const card = document.getElementById(`checkin-class-card-${slotId}`);
                const input = card ? card.querySelector('input[name="checkin-class"]') : null;
                if (!input) return;
                input.checked = !input.checked;
                card.classList.toggle('selected', input.checked);
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                const selectText = map.checkinSelectButton || 'Select';
                const selectedText = map.checkinSelectedButton || 'Selected';
                const badge = card.querySelector('.checkin-class-action-badge');
                if (badge) badge.innerText = input.checked ? selectedText : selectText;
            },

            cleanupClassCheckins: () => {
                const visits = DB.getVisits();
                const validVisitIds = new Set(visits.map(v => v.id));
                const filteredCheckins = DB.getClassCheckins().filter(checkin => validVisitIds.has(checkin.visitId));
                if (filteredCheckins.length !== DB.getClassCheckins().length) {
                    DB.saveClassCheckins(filteredCheckins);
                }
            },
 
            confirmKioskClassSelection: async (skipClassRequired = false) => {
                if (!App.pendingCheckinMember) return App.closeModal('modal-checkin-classes');

                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;

                const allInputs = Array.from(document.querySelectorAll('#checkin-classes-content input[name="checkin-class"]'));
                const selectedInputs = allInputs.filter(input => input.checked);
                const selectedClasses = selectedInputs.map(input => ({
                    slotKey: input.value,
                    classId: input.dataset.classId,
                    slotDay: input.dataset.slotDay,
                    slotStart: input.dataset.slotStart,
                    slotEnd: input.dataset.slotEnd,
                    slotDate: input.dataset.slotDate
                }));
                const availableSlotKeys = new Set(allInputs.map(input => input.value));
                const uniqueSelectionKeys = new Set();
                const validSelections = [];
                selectedClasses.forEach(selection => {
                    const key = `${selection.classId}|${selection.slotDate}|${selection.slotStart}|${selection.slotEnd}`;
                    if (!uniqueSelectionKeys.has(key) && availableSlotKeys.has(selection.slotKey)) {
                        uniqueSelectionKeys.add(key);
                        validSelections.push(selection);
                    }
                });
                const availableInputs = allInputs.filter(input => !input.disabled);
                // Block only when classes were listed but every one is already checked in.
                // When no classes are scheduled at all, allow the check-in to proceed as an open-gym visit.
                if (allInputs.length > 0 && availableInputs.length === 0 && !skipClassRequired) {
                    return App.showKioskMessage(map.checkinAlreadyCheckedInText || 'You have already checked into all classes scheduled for today. Please ask staff for assistance.', 'warning');
                }
   
                if (availableSlotKeys.size > 0 && validSelections.length === 0 && !skipClassRequired) {
                    return App.showKioskMessage(map.checkinSelectAtLeastOne || 'Please select at least one class to continue.', 'danger');
                }
 
                const member = App.pendingCheckinMember.member;
                const membershipAlert = App.pendingCheckinMember.membershipAlert;
                App.pendingCheckinMember = null;
                App.closeModal('modal-checkin-classes');

                const entryIso = new Date().toISOString();
                const selections = validSelections.map(s => ({
                    classId: s.classId,
                    slotDate: s.slotDate,
                    slotDay: s.slotDay,
                    slotStart: s.slotStart,
                    slotEnd: s.slotEnd
                }));

                try {
                    const rows = await FSEngine.checkIn({ p_member_id: member.id, p_class_selections: selections, p_entry_time: entryIso });
                    const res = (rows && rows[0]) || null;
                    await FSEngine.reloadCheckinData();
                    App.renderLivePresent();
                    App.renderKioskLeaderboard();
                    if (res && res.rejected) {
                        if (res.reason === 'already_checked_in') {
                            App.showKioskMessage(map.checkinAlreadyCheckedInText || 'You have already checked into this class.', 'warning');
                        } else {
                            App.showKioskMessage(map.checkinBlockedText || 'Check-in is not allowed for this account.', 'danger');
                        }
                        return false;
                    }
                    if (res && res.is_unpaid) {
                        App.showKioskAlert(map.kioskAlertMembershipTitle || 'Membership Alert', membershipAlert || map.kioskAlertExpired || 'Attention: Your membership has expired or you are out of sessions. Please see staff.', 'var(--danger)');
                    } else if (membershipAlert) {
                        App.showKioskAlert(map.noticeTitle || 'Membership Notice', membershipAlert, 'var(--warning)');
                    }
                    return true;
                } catch (err) {
                    console.error('check-in failed', err);
                    App.showKioskMessage(err && err.message ? err.message : 'Check-in failed. Please try again.', 'danger');
                    return false;
                }
            },

            showKioskMessage: (text, type) => {
                const el = document.getElementById('kiosk-message');
                el.innerText = text;
                el.className = `kiosk-msg ${type}`;
                clearTimeout(App.kioskMsgTimer);
                App.kioskMsgTimer = setTimeout(() => { el.className = 'kiosk-msg hidden'; el.innerText = ''; }, 3500);
                const m = document.getElementById('mobile-checkin-msg');
                if (m) {
                    m.innerText = text;
                    m.className = `kiosk-msg ${type}`;
                    clearTimeout(App.mobileMsgTimer);
                    App.mobileMsgTimer = setTimeout(() => { m.className = 'kiosk-msg hidden'; m.innerText = ''; }, 3500);
                }
            },

            // Build small class tags (name + time range) for a visit's class check-ins.
            // Each class checked into for the visit is shown with its own check-in/out
            // time range so multi-class visits display every class correctly.
            // When `stacked` is true, the time range renders below the class name
            // instead of beside it (used in narrow table columns).
            buildVisitClassTags: (visit, small = false, stacked = false) => {
                if (!visit || !visit.id) return '';
                const schedules = DB.getSchedules() || [];
                // Only render tags for classes that still exist. Check-ins whose class was
                // deleted keep their row but are skipped here, so the caller falls back to
                // showing the raw entry/exit time (open-gym style) instead of a generic
                // "Class" label.
                const checkins = DB.getClassCheckins()
                    .filter(c => c.visitId === visit.id)
                    .filter(c => schedules.some(s => s.id === c.classId));
                if (checkins.length === 0) return '';
                const sizeStyle = small ? ' font-size:0.72rem; padding:0.15rem 0.5rem;' : ' font-size:0.8rem; padding:0.3rem 0.6rem;';
                const layoutStyle = stacked ? ' flex-direction: column; align-items: flex-start; gap: 0.15rem;' : '';
                return `<div class="kiosk-class-tags">${checkins.map(c => {
                    const cls = schedules.find(s => s.id === c.classId);
                    const name = cls ? cls.name : 'Class';
                    const color = (cls && cls.color) || '#2563eb';
                    const time = `${Utils.convertTo12Hour(c.slotStart)} - ${Utils.convertTo12Hour(c.slotEnd)}`;
                    return `<span class="kiosk-class-tag" style="${sizeStyle}${layoutStyle} border-left: 3px solid ${color};">
                        <strong>${Utils.escapeHTML(name)}</strong>
                        <small>${Utils.escapeHTML(time)}</small>
                    </span>`;
                }).join('')}</div>`;
            },

            renderLivePresent: () => {
                const members = DB.getMembers();
                const now = new Date();
                const activeVisits = DB.getVisits().filter(v => v.exitTime === null && v.expectedExitTime && new Date(v.expectedExitTime) > now && members.some(m => m.id === v.memberId) && App.isVisitVisibleNow(v, now));
                const hiddenBelts = DB.getHiddenBelts();
                
                const countEls = [document.getElementById('kiosk-present-count'), document.getElementById('live-present-count')];
                countEls.forEach(el => { if(el) el.innerText = activeVisits.length; });
                
                const generateRow = (visit, isKiosk) => {
                    const m = members.find(m => m.id === visit.memberId);
                    if(!m) return '';

                    // Member-level state
                    const isMemberExpired = m.expirationDate ? Utils.getDaysRemaining(m.expirationDate) < 0 : true;
                    const isOutOfSessions = m.sessionsTotal && parseInt(m.sessionsLeft) <= 0;
                    const isFrozen = m.accountStatus === 'Frozen';

                    // Visit-level payment state should drive the unpaid indicator
                    const isUnpaidVisit = !!visit.isUnpaid;

                    // Badge displayed in admin/live list (Frozen > Unpaid Visit > Out of Sessions)
                    let expiredTag = '';
                    if (isFrozen) expiredTag = `<span class="badge badge-frozen" style="font-size: 0.65rem;">FROZEN</span>`;
                    else if (isUnpaidVisit) expiredTag = `<span class="badge badge-inactive" style="font-size: 0.65rem;">Needs Renew</span>`;
                    else if (isOutOfSessions) expiredTag = `<span class="badge badge-warning" style="font-size: 0.65rem;">No sessions left</span>`;

                    if (isKiosk) {
                        const rawBeltStr = (m.belt || 'White').split('/')[0].trim();
                        if(hiddenBelts.includes(rawBeltStr)) return '';

                        // Full-card belt color fill with contrasting text
                        const beltBg = Utils.getBeltColor(m.belt);
                        const textColor = rawBeltStr === 'White' ? '#000000' : '#FFFFFF';

                        // Red dot now reflects visit-level unpaid status only
                        const expiredDot = isUnpaidVisit ? `<span title="Membership unpaid for this visit" style="display:inline-block; width:10px; height:10px; border-radius:50%; background:var(--danger); margin-right:8px; vertical-align:middle;"></span>` : '';
                        // If the visit is paid but the member has no sessions left, show a subtle warning (yellow dot)
                        const sessionsDot = (!isUnpaidVisit && isOutOfSessions) ? `<span title="Member has no sessions left after this" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#f59e0b; margin-right:6px; vertical-align:middle;"></span>` : '';

                        return `<tr><td style="background:${beltBg}; color:${textColor}; border-radius:8px; padding-left:0.5rem; padding-right:0.5rem; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);">
                            <div class="flex-col gap-1">
                                <div class="kiosk-present-name-row">
                                    <span class="kiosk-present-name" style="color:${textColor};">${expiredDot}${sessionsDot}${Utils.escapeHTML(m.firstName)} ${Utils.escapeHTML(m.lastName)}</span>
                                    ${App.buildVisitClassTags(visit)}
                                </div>
                                <span style="font-size: 0.9rem; color:${textColor}; opacity:0.8;">${Utils.formatTime(visit.entryTime)}</span>
                            </div>
                        </td></tr>`;
                    } else {
                        // Admin list: row background indicates unpaid visit or frozen status
                        let rowBg = '';
                        if (isFrozen) rowBg = 'background: #fffbeb;';
                        else if (isUnpaidVisit) rowBg = 'background: #fef2f2;';

                        return `<tr style="${rowBg}">
                            <td data-label="Name">
                                <div class="admin-present-name-cell">
                                    <strong>${Utils.escapeHTML(m.firstName)} ${Utils.escapeHTML(m.lastName)}</strong>
                                    ${App.buildVisitClassTags(visit, true)}
                                </div>
                            </td>
                            <td data-label="ID" class="text-gray" style="font-size:0.85rem;">${Utils.escapeHTML(m.id)}</td>
                            <td data-label="Belt">${Utils.getBeltBadge(m.belt)}</td>
                            <td data-label="Entry & Duration">
                                <div>${Utils.formatTime(visit.entryTime)}</div>
                                <div class="text-gray" style="font-size:0.8rem;">${Utils.calcDuration(visit.entryTime, null)} inside</div>
                            </td>
                            <td data-label="Status">${isUnpaidVisit ? '<span class="badge badge-inactive">Needs Renew</span>' : (isOutOfSessions ? '<span class="badge badge-warning">No sessions left</span>' : '<span class="badge badge-active">OK</span>')}</td>
                            <td data-label="Action" class="cell-actions">
                                <button class="btn-primary btn-small" onclick="App.checkoutVisit('${visit.id}')">Checkout</button>
                            </td>
                        </tr>`;
                    }
                };

                const kioskList = document.getElementById('kiosk-present-list');
                const adminList = document.getElementById('live-present-list');
                
                if (kioskList) kioskList.innerHTML = activeVisits.map(v => generateRow(v, true)).join('');
                if (adminList) adminList.innerHTML = activeVisits.map(v => generateRow(v, false)).join('') || '<tr><td colspan="6" class="text-center text-gray">No members currently inside.</td></tr>';
            },

            getLeaderboardStandings: () => {
                const threeMonthsAgo = new Date();
                threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                const standings = DB.getMembers()
                    .filter(member => !member.hideFromLeaderboard)
                    .map(member => ({
                        member,
                        count: App.getMemberLeaderboardCount(member.id, threeMonthsAgo)
                    }))
                    .filter(entry => entry.count > 0)
                    .sort((a, b) => b.count - a.count || a.member.lastName.localeCompare(b.member.lastName));
                let prevCount = null;
                let prevRank = 0;
                standings.forEach((entry, index) => {
                    if (index === 0 || entry.count !== prevCount) {
                        entry.rank = index + 1;
                    } else {
                        entry.rank = prevRank;
                    }
                    prevCount = entry.count;
                    prevRank = entry.rank;
                });
                return standings;
            },

            leaderboardRankCell: (rank, isLast) => {
                // Ranks with a configured medal show the medal emoji (no rank number).
                // Only the last displayed rank gets the "last" emoji (default poop);
                // everyone else falls back to their rank number.
                const m = STATE.leaderboardEmojis || DEFAULT_LEADERBOARD_EMOJIS;
                if (m[rank]) return `<span class="kiosk-lb-rank-num">${Utils.escapeHTML(m[rank])}</span>`;
                if (isLast && m.last) return `<span class="kiosk-lb-rank-num">${Utils.escapeHTML(m.last)}</span>`;
                return `<span class="kiosk-lb-rank-num">${rank}</span>`;
            },

            // First names only; when two members share a first name, abbreviate the
            // last name through its first consonant with a trailing dot («Νίκος Π.»),
            // extending letter-by-letter only as far as needed to stay unique.
            kioskDisplayNames: (members) => {
                const vowels = 'aeiouyαεηιουωϊϋάέήίόύώ';
                const isVowel = ch => vowels.includes(ch.toLowerCase());
                const list = members.map(m => ({ first: (m.firstName || '').trim(), last: (m.lastName || '').trim() }));
                return list.map((m, i) => {
                    let name = m.first || m.last || '';
                    if (m.first && m.last) {
                        const rivals = list.filter((x, j) => j !== i && x.first === m.first);
                        if (rivals.length) {
                            let k = 0;
                            while (k < m.last.length && isVowel(m.last[k])) k++;
                            k = Math.min(k + 1, m.last.length);
                            while (k < m.last.length && rivals.some(r => r.last.slice(0, k) === m.last.slice(0, k))) k++;
                            name = m.first + ' ' + m.last.slice(0, k) + (k < m.last.length ? '.' : '');
                        }
                    }
                    return name;
                });
            },

            renderKioskLeaderboard: () => {
                const standings = App.getLeaderboardStandings();
                const size = DB.getLeaderboardSize();
                // size 0 means "show everyone" (no limit).
                let top = size > 0 ? standings.slice(0, size) : standings.slice();
                if (size > 0 && top.length > 0) {
                    const lastRank = top[top.length - 1].rank;
                    top = top.concat(standings.slice(size).filter(entry => entry.rank === lastRank));
                }
                App._kioskLeaderboardMembers = top.map(e => e.member);
                const container = document.getElementById('kiosk-leaderboard-container');
                if (!container) {
                    App.renderKioskChart && App.renderKioskChart();
                    return;
                }
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;

                if (top.length === 0) {
                    container.innerHTML = `<p class="text-gray" style="padding: 1rem 0; text-align:center;">${Utils.escapeHTML(map.leaderboardNoTrainings || 'No trainings recorded in the last 3 months yet.')}</p>`;
                    return;
                }
                const badge = document.getElementById('kiosk-leaderboard-badge');
                if (badge) badge.innerText = size > 0 ? `Top ${size}` : (map.leaderboardAllBadge || 'Everyone');

                const groups = [];
                top.forEach(entry => {
                    const last = groups[groups.length - 1];
                    if (last && last.rank === entry.rank) {
                        last.members.push(entry);
                    } else {
                        groups.push({ rank: entry.rank, members: [entry] });
                    }
                });
                const lastRank = top.length ? top[top.length - 1].rank : null;
                const displayNames = App.kioskDisplayNames(top.map(e => e.member));

                container.innerHTML = `
                    <div class="kiosk-leaderboard">
                        ${top.map((entry, idx) => {
                            const textColor = ((entry.member.belt || 'White').split('/')[0].trim() === 'White') ? '#000000' : '#FFFFFF';
                            return `
                                <div class="kiosk-lb-card" style="background:${Utils.getBeltColor(entry.member.belt)};">
                                    <div class="kiosk-lb-rank">${App.leaderboardRankCell(entry.rank, entry.rank === lastRank)}</div>
                                    <strong class="kiosk-lb-name" style="color:${textColor};">${Utils.escapeHTML(displayNames[idx])}</strong>
                                    <span class="kiosk-lb-count-badge" title="${entry.count} trainings">${entry.count}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
                App.renderKioskChart && App.renderKioskChart();
            },

            // Crown Bounty leaderboard for the current period, scoped to any
            // date via the built-in picker (+/- day arrows): neutral
            // (belt-free) cards with belt-colored accent bars. Each position
            // has a single holder; only members whose entire workout history
            // is exactly identical share a position, and matching a holder's
            // score never takes their spot (position = players ahead + 1).
            // 👑 goes to the identical-history holders of the top group; 💩
            // marks the very last place. Only members with at least one
            // workout appear. ▲/▼ compare yesterday's position under the same
            // rules: climbing shows green, being displaced shows red,
            // holding steady shows nothing. FLIP slide animation on reorder.
            renderBountyLeaderboard: () => {
                const container = document.getElementById('bounty-leaderboard-container');
                const section = document.getElementById('bounty-leaderboard-section');
                if (!container || !section) return;
                const allMembers = DB.getMembers();
                const members = allMembers.filter(m => !m.hideFromLeaderboard);
                const knownIds = new Set(allMembers.map(m => m.id));
                DB.getClassCheckins().forEach(ci => {
                    if (ci.entryTime && !knownIds.has(ci.memberId)) {
                        knownIds.add(ci.memberId);
                        members.push({ id: ci.memberId, firstName: '', lastName: String(ci.memberId) });
                    }
                });
                const checkinVisitIds = new Set(DB.getClassCheckins().map(c => c.visitId));
                DB.getVisits().forEach(v => {
                    if (v.entryTime && !checkinVisitIds.has(v.id) && !knownIds.has(v.memberId)) {
                        knownIds.add(v.memberId);
                        members.push({ id: v.memberId, firstName: '', lastName: String(v.memberId) });
                    }
                });
                if (!members.length) { section.classList.add('hidden'); return; }
                const bp = App.getViewedBountyPeriod();
                const since = new Date(bp.start.getTime());
                since.setHours(0, 0, 0, 0);
                const todayIso = Utils.dateToLocalIso(new Date());
                const minIso = Utils.dateToLocalIso(since);
                const periodLast = new Date(bp.endExcl.getTime() - 86400000);
                const maxIso = Utils.dateToLocalIso(periodLast < new Date() ? periodLast : new Date());

                let selIso = App._bountyLbDate || maxIso;
                if (selIso > maxIso || selIso < minIso) { selIso = maxIso; App._bountyLbDate = selIso; }
                const dateInput = document.getElementById('bounty-leaderboard-date');
                if (dateInput) {
                    dateInput.min = minIso;
                    dateInput.max = maxIso;
                    if (dateInput.value !== selIso) dateInput.value = selIso;
                }

                const until = new Date(selIso + 'T23:59:59.999');
                const series = App.getCumulativeTrainingSeries(members, since, until);
                const active = App.rankPeriodSeries(series, selIso);
                const ptsKeyOf = (pts) => pts.map(pt => pt.date + '=' + pt.count).join('|');
                const countAtSeries = (s, iso) => {
                    if (!s || !s.points.length) return 0;
                    let c = 0;
                    for (let i = 0; i < s.points.length; i++) {
                        if (s.points[i].date <= iso) c = s.points[i].count; else break;
                    }
                    return c;
                };

                const refDate = new Date(selIso + 'T00:00:00');
                refDate.setDate(refDate.getDate() - 1);
                const refIso = refDate < since ? minIso : Utils.dateToLocalIso(refDate);

                // ▲/▼ compare the member's PLACE against yesterday's, using
                // the exact same grouping rules (single holders; shared only
                // for identical histories): climbing shows ▲ green, being
                // displaced shows ▼ red, holding steady shows nothing.
                const refPlaces = {};
                if (refIso !== selIso) {
                    const firstTsAt = (e, c) => (e.firstTimeAtCount && e.firstTimeAtCount[c]) ? new Date(e.firstTimeAtCount[c]).getTime() : Infinity;
                    const refEntries = active.map(e => ({
                        id: e.id,
                        member: e.member,
                        c: countAtSeries(e.series, refIso),
                        ts: firstTsAt(e, countAtSeries(e.series, refIso)),
                        points: e.points.filter(pt => pt.date <= refIso)
                    }))
                        .filter(x => x.c > 0)
                        .sort((a, b) => {
                            if (b.c !== a.c) return b.c - a.c;
                            if (a.ts !== b.ts) return a.ts - b.ts;
                            const fa = a.points.length ? new Date(a.points[0].date + 'T00:00:00').getTime() : Infinity;
                            const fb = b.points.length ? new Date(b.points[0].date + 'T00:00:00').getTime() : Infinity;
                            if (fa !== fb) return fa - fb;
                            const na = ((a.member.lastName || '') + ' ' + (a.member.firstName || '')).localeCompare((b.member.lastName || '') + ' ' + (b.member.firstName || ''));
                            if (na !== 0) return na;
                            return String(a.id).localeCompare(String(b.id));
                        });
                    const refGroupPlace = {};
                    refEntries.forEach((x, i) => {
                        const k = ptsKeyOf(x.points);
                        if (refGroupPlace[k] != null) {
                            refPlaces[x.id] = refGroupPlace[k];
                        } else {
                            refPlaces[x.id] = i + 1;
                            refGroupPlace[k] = i + 1;
                        }
                    });
                }

                const prevTops = {};
                container.querySelectorAll('.kiosk-lb-card[data-member-id]').forEach(el => {
                    prevTops[el.getAttribute('data-member-id')] = el.getBoundingClientRect().top;
                });

                section.classList.remove('hidden');
                if (!active.length) {
                    const lang = App.currentKioskLang || 'en';
                    const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                    container.innerHTML = `<p class="text-gray" style="padding: 1rem 0; text-align:center;">${Utils.escapeHTML(map.bountyLeaderboardNoTrainings || 'No trainings recorded for this date.')}</p>`;
                    return;
                }
                const displayNames = App.kioskDisplayNames(active.map(e => e.member));
                const lastPlace = active[active.length - 1].place;

                container.innerHTML = `
                    <div class="kiosk-leaderboard">
                        ${active.map((entry, idx) => {
                            const refPlace = refPlaces[entry.member.id];
                            let nameColor = 'var(--dark)';
                            let arrow = '';
                            if (refIso !== selIso && refPlace != null && refPlace !== entry.place) {
                                if (entry.place < refPlace) { arrow = ' ▲'; nameColor = '#16a34a'; }
                                else { arrow = ' ▼'; nameColor = '#dc2626'; }
                            }
                            const rankCell = (entry.crown || entry.place === 1)
                                ? '<span class="kiosk-lb-rank-num">👑</span>'
                                : App.leaderboardRankCell(entry.place, entry.place === lastPlace);
                            return `
                                <div class="kiosk-lb-card bounty-lb-card" data-member-id="${Utils.escapeHTML(entry.member.id)}">
                                    <span class="bounty-belt-bar" style="background:${Utils.getBeltColor(entry.member.belt)};" title="${Utils.escapeHTML((entry.member.belt || 'White').split('/')[0])} belt"></span>
                                    <div class="kiosk-lb-rank">${rankCell}</div>
                                    <strong class="kiosk-lb-name" style="color:${nameColor};">${Utils.escapeHTML(displayNames[idx])}<span style="color:${nameColor};">${arrow}</span></strong>
                                    <span class="kiosk-lb-count-badge" title="${entry.count} trainings">${entry.count}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
                container.querySelectorAll('.kiosk-lb-card[data-member-id]').forEach(el => {
                    const oldTop = prevTops[el.getAttribute('data-member-id')];
                    if (oldTop == null) return;
                    const dy = oldTop - el.getBoundingClientRect().top;
                    if (!dy) return;
                    el.style.transition = 'none';
                    el.style.transform = `translateY(${dy}px)`;
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            el.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
                            el.style.transform = '';
                            setTimeout(() => { el.style.transition = ''; }, 550);
                        });
                    });
                });
            },

            setBountyLeaderboardDate: (value) => {
                App._bountyLbDate = value || null;
                App.renderBountyLeaderboard();
            },

            bountyLbDateNav: (dir) => {
                const bp = App.getViewedBountyPeriod();
                const minDate = new Date(bp.start.getTime());
                minDate.setHours(0, 0, 0, 0);
                const minIso = Utils.dateToLocalIso(minDate);
                const periodLast = new Date(bp.endExcl.getTime() - 86400000);
                const maxIso = Utils.dateToLocalIso(periodLast < new Date() ? periodLast : new Date());
                const dateInput = document.getElementById('bounty-leaderboard-date');
                const base = App._bountyLbDate || (dateInput && dateInput.value) || maxIso;
                const d = new Date(base + 'T00:00:00');
                if (isNaN(d.getTime())) return;
                d.setDate(d.getDate() + dir);
                const iso = Utils.dateToLocalIso(d);
                if (iso < minIso || iso > maxIso) return;
                App._bountyLbDate = iso;
                App.renderBountyLeaderboard();
            },

            // Deterministic per-member color from a distinct palette (stable across
            // renders/devices). Cycle past the palette length, re-hashing the id.
            kioskChartColor: (memberId, index) => {
                const palette = [
                    '#0ea5e9', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6',
                    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
                    '#14b8a6', '#a855f7', '#22c55e', '#ef4444', '#3b82f6'
                ];
                if (index != null) return palette[index % palette.length];
                let h = 0;
                const s = String(memberId);
                for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
                return palette[h % palette.length];
            },

            // Per-member cumulative training series over [since, until].
            // Counting rule mirrors getMemberLeaderboardCount: one point per class
            // check-in (date/class/slot) plus one per open-gym visit (visit with no
            // class check-in). Returns [{ member, points: [{ date, count }] }].
            getCumulativeTrainingSeries: (memberIds, since, until) => {
                const checkins = DB.getClassCheckins();
                const checkinVisitIds = new Set(checkins.map(c => c.visitId));
                const visits = DB.getVisits();

                const result = [];
                // Bounds are enforced on the effective session date alone:
                // attendance entered days later (entryTime = save moment,
                // slotDate = the real class day) must still count for the day
                // it belongs to, on every historical view.
                const sinceIso = Utils.dateToLocalIso(since);
                const untilIso = Utils.dateToLocalIso(until);
                const inWindow = (dateKey) => !!dateKey && dateKey >= sinceIso && dateKey <= untilIso;
                memberIds.forEach(member => {
                    const cins = checkins.filter(ci => ci.memberId === member.id && ci.entryTime);
                    const seen = new Set();
                    const dayCount = {};
                    const mEvents = [];
                    cins.forEach(ci => {
                        const d = new Date(ci.entryTime);
                        const dateKey = ci.slotDate || (isNaN(d.getTime()) ? '' : Utils.dateToLocalIso(d));
                        if (!inWindow(dateKey)) return;
                        const sessionKey = `${dateKey}|${ci.classId}|${ci.slotStart || ''}|${ci.slotEnd || ''}`;
                        if (seen.has(sessionKey)) return;
                        seen.add(sessionKey);
                        mEvents.push({ date: dateKey, time: ci.entryTime });
                    });
                    visits.forEach(v => {
                        if (v.memberId !== member.id || !v.entryTime || checkinVisitIds.has(v.id)) return;
                        const d = new Date(v.entryTime);
                        const dateKey = isNaN(d.getTime()) ? '' : Utils.dateToLocalIso(d);
                        if (!inWindow(dateKey)) return;
                        mEvents.push({ date: dateKey, time: v.entryTime });
                    });
                    mEvents.sort((a, b) => {
                        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
                        return new Date(a.time) - new Date(b.time);
                    });
                    const firstTimeAtCount = {};
                    const increments = [];
                    let running = 0;
                    // Seniority timestamps anchor the wall-clock time-of-day to
                    // the SESSION date, so a backfilled entry (entered days
                    // later) keeps the seniority of the day it belongs to.
                    const anchoredTs = (e) => {
                        const base = new Date(e.date + 'T00:00:00').getTime();
                        const t = new Date(e.time);
                        if (isNaN(t.getTime())) return base;
                        return base + (t.getTime() - new Date(Utils.dateToLocalIso(t) + 'T00:00:00').getTime());
                    };
                    mEvents.forEach(e => {
                        dayCount[e.date] = (dayCount[e.date] || 0) + 1;
                        running++;
                        if (!firstTimeAtCount[running]) firstTimeAtCount[running] = anchoredTs(e);
                        increments.push({ date: e.date, time: e.time, count: running });
                    });
                    const dates = Object.keys(dayCount).sort();
                    let cum = 0;
                    const points = dates.map(date => {
                        cum += dayCount[date];
                        return { date, count: cum };
                    });
                    if (points.length) result.push({ member, points, firstTimeAtCount, increments });
                });
                return result;
            },

            // Shared ranking engine for every period standings view (Bounty
            // Leaderboard, period rankings modal): count desc; ties broken by
            // who reached the score first (session-anchored), then first
            // training date, then name/id. One holder per position; only
            // members whose entire history is exactly identical share a place.
            // e.crown marks the reigning group (top count + identical to the
            // earliest top holder).
            rankPeriodSeries: (series, selIso) => {
                const countAt = (s, iso) => {
                    if (!s || !s.points.length) return 0;
                    let c = 0;
                    for (let i = 0; i < s.points.length; i++) {
                        if (s.points[i].date <= iso) c = s.points[i].count; else break;
                    }
                    return c;
                };
                const firstTs = (e) => (e.firstTimeAtCount && e.firstTimeAtCount[e.count]) ? new Date(e.firstTimeAtCount[e.count]).getTime() : Infinity;
                const ptsKeyOf = (pts) => pts.map(pt => pt.date + '=' + pt.count).join('|');
                const entries = series.map(s => ({ member: s.member, id: s.member.id, count: countAt(s, selIso), series: s, points: (s && s.points) ? s.points : [], firstTimeAtCount: s ? s.firstTimeAtCount : null }));
                const active = entries.filter(e => e.count > 0);
                active.sort((a, b) => {
                    if (b.count !== a.count) return b.count - a.count;
                    const ta = firstTs(a);
                    const tb = firstTs(b);
                    if (ta !== tb) return ta - tb;
                    const fa = a.points.length ? new Date(a.points[0].date + 'T00:00:00').getTime() : Infinity;
                    const fb = b.points.length ? new Date(b.points[0].date + 'T00:00:00').getTime() : Infinity;
                    if (fa !== fb) return fa - fb;
                    const na = ((a.member.lastName || '') + ' ' + (a.member.firstName || '')).localeCompare((b.member.lastName || '') + ' ' + (b.member.firstName || ''));
                    if (na !== 0) return na;
                    return String(a.id).localeCompare(String(b.id));
                });
                const groupPlace = {};
                active.forEach((e, i) => {
                    const k = ptsKeyOf(e.points);
                    if (groupPlace[k] != null) {
                        e.place = groupPlace[k];
                    } else {
                        e.place = i + 1;
                        groupPlace[k] = e.place;
                    }
                });
                active.sort((a, b) => a.place - b.place);
                const topCount = active.reduce((m, e) => Math.max(m, e.count), 0);
                const topMembers = active.filter(e => e.count === topCount);
                const primaryTop = topMembers.reduce((b, e) => (firstTs(e) < firstTs(b) ? e : b), topMembers[0]);
                const kingSet = new Set(topMembers
                    .filter(e => ptsKeyOf(e.points) === ptsKeyOf(primaryTop.points))
                    .map(e => e.member.id));
                active.forEach(e => { e.crown = kingSet.has(e.member.id); });
                return active;
            },

            // Single source of truth for Crown events — the Hunt Log and the
            // chart markers both render from this. Replays every training
            // increment in chronological order:
            //  - The Crown is claimable from the very first workout; everyone
            //    tied at the end-of-day top claims it, and only members with
            //    exactly identical training histories keep sharing it.
            //  - A rival matching the record issues a ⚔️ challenge (once per
            //    reign); exceeding it steals the Crown 👑.
            //  - The King group extending its record after any challenge is a
            //    🛡️ defense; pulling ahead alone reduces the number of kings
            //    and emits a 👑 sole-hold event.
            getCrownEvents: (series) => {
                const stream = [];
                series.forEach(s => {
                    (s.increments || []).forEach(inc => {
                        stream.push({ memberId: s.member.id, date: inc.date, ts: inc.time, count: inc.count });
                    });
                });
                if (!stream.length) return [];
                stream.sort((a, b) => new Date(a.ts) - new Date(b.ts));

                // Two members share the Crown only while their training
                // histories are identical (same cumulative count on every date
                // up to `limit`).
                const ptMap = {};
                series.forEach(s => { ptMap[s.member.id] = s.points; });
                const countOn = (id, date) => {
                    const pts = ptMap[id];
                    let c = null;
                    for (let i = 0; i < pts.length && pts[i].date <= date; i++) c = pts[i].count;
                    return c;
                };
                const identicalThrough = (a, b, limit) => {
                    const dates = new Set();
                    ptMap[a].forEach(p => { if (p.date <= limit) dates.add(p.date); });
                    ptMap[b].forEach(p => { if (p.date <= limit) dates.add(p.date); });
                    for (const d of dates) {
                        if (countOn(a, d) !== countOn(b, d)) return false;
                    }
                    return true;
                };

                // Pass A: proclamation on the first active day. Everyone tied
                // at the end-of-day top claims the Crown together — but only
                // those with histories identical to the earliest claimant keep
                // sharing it; the rest fall away as their histories diverge.
                const sMap = {};
                series.forEach(s => { sMap[s.member.id] = s; });
                let kingId = null;
                let kingCount = 0;
                let proclaimDate = null;
                let coBreakers = [];
                const countsEndOfDay = {};
                const byDate = {};
                stream.forEach(ev => { (byDate[ev.date] = byDate[ev.date] || []).push(ev); });
                for (const date of Object.keys(byDate).sort()) {
                    byDate[date].forEach(ev => { countsEndOfDay[ev.memberId] = ev.count; });
                    let maxC = 0;
                    const holders = [];
                    Object.keys(countsEndOfDay).forEach(id => {
                        const c = countsEndOfDay[id];
                        if (c > maxC) { maxC = c; holders.length = 0; holders.push(id); }
                        else if (c === maxC) holders.push(id);
                    });
                    if (maxC < 1) continue;
                    const tsOf = id => {
                        const s = sMap[id];
                        const t = (s && s.firstTimeAtCount && s.firstTimeAtCount[maxC]) || null;
                        return t ? new Date(t).getTime() : Infinity;
                    };
                    let best = null;
                    let bestT = Infinity;
                    holders.forEach(id => {
                        const t = tsOf(id);
                        if (t < bestT) { bestT = t; best = id; }
                    });
                    kingId = best;
                    kingCount = maxC;
                    proclaimDate = date;
                    coBreakers = holders.filter(id => id !== best && identicalThrough(id, best, date));
                    break;
                }
                if (kingId === null) return [];

                const events = [{
                    type: 'king',
                    memberId: kingId,
                    alsoIds: coBreakers,
                    count: kingCount,
                    date: proclaimDate,
                    ts: ((byDate[proclaimDate] || []).find(ev => ev.memberId === kingId && ev.count === kingCount) || {}).ts || proclaimDate,
                    prevKingId: null,
                    prevKingCount: null
                }];

                // Pass B: challenges and takeovers from the proclamation onward.
                // Co-kings with identical histories extending the record are
                // silent — unless a challenge happened since the last defense,
                // which turns the extension into a 🛡️ defense. A rival reaching
                // exactly the record issues ONE ⚔️ challenge per reign; exceeding
                // it steals the Crown 👑. When co-kings' histories diverge
                // because one pulls ahead alone, the number of kings is reduced
                // and a 👑 "sole hold" event marks the moment.
                let kingGroup = [kingId].concat(coBreakers);
                const challengedInReign = new Set();
                const reignChallengers = [];
                let reignChallenged = false;
                let coronation = { date: proclaimDate, memberId: kingId };
                let lastActivity = proclaimDate;
                const latestCounts = {};
                stream.forEach(ev => {
                    latestCounts[ev.memberId] = ev.count;
                    if (ev.date > lastActivity) lastActivity = ev.date;
                    if (ev.date <= proclaimDate) return;
                    if (kingGroup.includes(ev.memberId) || identicalThrough(ev.memberId, kingId, ev.date)) {
                        if (ev.count > kingCount) {
                            if (reignChallenged && reignChallengers.length > 0) {
                                events.push({ type: 'defense', memberId: ev.memberId, alsoIds: kingGroup.filter(i => i !== ev.memberId), count: ev.count, date: ev.date, ts: ev.ts, challengerIds: reignChallengers.slice(), challengerCount: kingCount });
                                reignChallengers.length = 0;
                                reignChallenged = false;
                                challengedInReign.clear();
                            }
                            const dropped = kingGroup.filter(id => id !== ev.memberId && (latestCounts[id] ?? 0) === kingCount);
                            if (dropped.length > 0 && !identicalThrough(ev.memberId, dropped[0], ev.date)) {
                                events.push({ type: 'consolidate', memberId: ev.memberId, alsoIds: [], count: ev.count, date: ev.date, ts: ev.ts, prevKingIds: dropped.slice(), prevKingCount: kingCount });
                            }
                            kingCount = ev.count;
                        }
                        return;
                    }
                    if (ev.count === kingCount) {
                        if (!challengedInReign.has(ev.memberId)) {
                            challengedInReign.add(ev.memberId);
                            reignChallengers.push(ev.memberId);
                            reignChallenged = true;
                            events.push({ type: 'challenge', memberId: ev.memberId, count: ev.count, date: ev.date, ts: ev.ts, prevKingId: kingId, prevKingIds: kingGroup.slice(), prevKingCount: kingCount });
                        }
                    } else if (ev.count > kingCount) {
                        events.push({ type: 'king', memberId: ev.memberId, count: ev.count, date: ev.date, ts: ev.ts, prevKingId: kingId, prevKingIds: kingGroup.slice(), prevKingCount: kingCount });
                        kingId = ev.memberId;
                        kingCount = ev.count;
                        kingGroup = [ev.memberId];
                        reignChallengers.length = 0;
                        reignChallenged = false;
                        challengedInReign.clear();
                        coronation = { date: ev.date, memberId: ev.memberId };
                    }
                });

                kingGroup = kingGroup.filter(id => (latestCounts[id] ?? 0) >= kingCount && identicalThrough(id, kingId, lastActivity));

                let defenses = 0;
                for (let i = events.length - 1; i >= 0; i--) {
                    if (events[i].type === 'king') break;
                    if (events[i].type === 'defense') defenses++;
                }
                const alsoNow = kingGroup.filter(id => id !== kingId);
                const todayMid = new Date();
                todayMid.setHours(0, 0, 0, 0);
                const throneDays = coronation && coronation.date ? Math.max(1, Math.round((todayMid - new Date(coronation.date + 'T00:00:00')) / 86400000) + 1) : 0;
                return {
                    events,
                    counts: latestCounts,
                    currentKing: kingId !== null ? {
                        id: kingId,
                        alsoIds: alsoNow,
                        points: latestCounts[kingId] != null ? latestCounts[kingId] : kingCount,
                        daysOnThrone: throneDays,
                        defenses
                    } : null
                };
            },

            renderHuntLog: (events, nameById, ctx) => {
                const container = document.getElementById('hunt-log-list');
                const section = document.getElementById('hunt-log-section');
                if (!container || !section) return;
                if (!events || !events.length) { section.classList.add('hidden'); return; }
                section.classList.remove('hidden');

                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;

                const locale = lang === 'el' ? 'el-GR' : undefined;
                const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

                container.innerHTML = events.slice().reverse().map(ev => {
                    const name = [ev.memberId].concat(ev.alsoIds || []).map(id => nameById[id] || '?').join(' & ');
                    const prevNames = (ev.prevKingIds && ev.prevKingIds.length ? ev.prevKingIds : [ev.prevKingId])
                        .map(id => nameById[id] || '?').join(' & ');
                    const chalNames = (ev.challengerIds || []).map(id => nameById[id] || '?').join(' & ');
                    const emoji = ev.type === 'king' || ev.type === 'consolidate' ? '👑' : (ev.type === 'defense' ? '🛡️' : '⚔️');
                    let action;
                    let detail;
                    if (ev.type === 'king') {
                        action = ev.prevKingId ? (map.huntStoleCrown || 'Stole the Crown') : (map.huntNewKing || 'became King');
                        if (!ev.prevKingId) {
                            detail = (map.huntFirstKing || 'Claimed the Crown with {c} trainings.').replace('{c}', ev.count);
                        } else {
                            detail = (map.huntBroke || "Broke {k}'s record with {c} trainings.")
                                .replace('{k}', prevNames).replace('{c}', ev.count);
                        }
                    } else if (ev.type === 'consolidate') {
                        action = map.huntTookThrone || 'took the Throne alone';
                        detail = (map.huntBrokeAway || 'Broke away from {k}.').replace('{k}', prevNames);
                    } else if (ev.type === 'defense') {
                        action = map.huntDefense || 'defended the Crown';
                        detail = (map.huntHeldOff || 'Held off the challenge ({k}) with {c} trainings.')
                            .replace('{k}', chalNames).replace('{c}', ev.count);
                    } else {
                        action = map.huntChallenge || 'challenged the Crown';
                        detail = (map.huntMatched || "Matched {k}'s record of {c} trainings.")
                            .replace('{k}', prevNames).replace('{c}', ev.count);
                    }
                    return `
                        <div style="display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0; border-bottom:1px solid var(--gray-light);">
                            <span style="font-size:1.2rem; flex-shrink:0;">${emoji}</span>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:700;">${Utils.escapeHTML(name)} ${Utils.escapeHTML(action)}</div>
                                <div class="text-gray" style="font-size:0.82rem;">${Utils.escapeHTML(detail)} · ${Utils.escapeHTML(fmtDate(ev.date))}</div>
                            </div>
                        </div>
                    `;
                }).join('');

                const rows = container.children;
                if (rows.length > 5 && rows[0]) {
                    const top0 = rows[0].getBoundingClientRect().top;
                    container.style.maxHeight = Math.ceil(rows[5].getBoundingClientRect().top - top0) + 'px';
                } else {
                    container.style.maxHeight = 'none';
                }
            },

            renderCurrentKingBar: (info, nameById) => {
                const bar = document.getElementById('king-info-bar');
                if (!bar) return;
                if (!info || !info.id) { bar.classList.add('hidden'); return; }
                bar.classList.remove('hidden');
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                const names = [info.id].concat(info.alsoIds || []).map(id => (nameById && nameById[id]) || '?').join(' & ');
                const stat = (label, value) => `<span class="text-gray" style="font-size:0.9rem; white-space:nowrap;">${Utils.escapeHTML(label)}: <strong style="color:var(--dark);">${Utils.escapeHTML(String(value))}</strong></span>`;
                bar.innerHTML = `
                    <span style="font-size:1.05rem;">👑 <span class="text-gray" style="font-weight:600; font-size:0.95rem;">${Utils.escapeHTML(map.kingInfoTitle || 'Current Crown Holder')}:</span> <strong>${Utils.escapeHTML(names)}</strong></span>
                    ${stat(map.kingStatPoints || 'Trainings', info.points)}
                    ${stat(map.kingStatDays || 'Throne Streak', info.daysOnThrone)}
                    ${stat(map.kingStatDefenses || 'Crown Defenses', info.defenses)}
                `;
            },

            // Crown Bounty periods (4 months each): Nov–Feb, Mar–Jun, Jul–Oct.
            // The Crown Holder on the final day of a period wins that period.
            renderPeriodWinners: () => {
                const list = document.getElementById('period-winners-list');
                const section = document.getElementById('period-winners-section');
                if (!list || !section) return;
                const members = DB.getMembers().filter(m => !m.hideFromLeaderboard);
                const until = new Date();
                until.setHours(23, 59, 59, 999);
                const series = App.getCumulativeTrainingSeries(members, new Date(0), until);
                const result = App.getCrownEvents(series);
                const kingEvents = result.events.filter(e => e.type === 'king');
                if (!kingEvents.length) { section.classList.add('hidden'); return; }
                const nameById = {};
                const allNames = App.kioskDisplayNames(members);
                members.forEach((m, i) => { nameById[m.id] = allNames[i]; });

                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                const loc = lang === 'el' ? 'el-GR' : undefined;
                const iso = d => Utils.dateToLocalIso(d);
                const todayMid = new Date();
                todayMid.setHours(0, 0, 0, 0);
                const firstActivity = (() => {
                    let min = null;
                series.forEach(s => {
                    if (s.points.length && (!min || s.points[0].date < min)) min = s.points[0].date;
                });
                    return min;
                })();
                if (!firstActivity) { section.classList.add('hidden'); return; }

                const periods = [];
                const startYear = parseInt(firstActivity.slice(0, 4), 10) - 1;
                const endYear = todayMid.getFullYear() + 1;
                for (let y = startYear; y <= endYear; y++) {
                    periods.push({ n: 2, start: new Date(y, 10, 1), end: new Date(y + 1, 2, 1) });
                    periods.push({ n: 3, start: new Date(y + 1, 2, 1), end: new Date(y + 1, 6, 1) });
                    periods.push({ n: 1, start: new Date(y + 1, 6, 1), end: new Date(y + 1, 10, 1) });
                }
                App._bountyPeriodsCache = periods;
                const monthFmt = d => d.toLocaleDateString(loc, { month: 'short', year: 'numeric' });
                const rows = [];
                let evIdx = 0;
                let lastHolder = null;
                periods.forEach(p => {
                    const endExcl = new Date(p.end.getTime() - 1);
                    const endIso = iso(endExcl);
                    if (endExcl < new Date(firstActivity + 'T00:00:00')) return;
                    if (p.start > todayMid) return;
                    while (evIdx < kingEvents.length && kingEvents[evIdx].date <= endIso) {
                        lastHolder = kingEvents[evIdx];
                        evIdx++;
                    }
                    const ongoing = endExcl >= todayMid;
                    if (ongoing && !lastHolder) return;
                    if (!lastHolder) return;
                    const label = `${Utils.escapeHTML(map.periodWord || 'Period')} ${p.n} · ${monthFmt(p.start)} – ${monthFmt(new Date(endExcl))}`;
                    let rightSide;
                    if (ongoing) {
                        const daysLeft = Math.max(0, Math.ceil((p.end.getTime() - todayMid.getTime()) / 86400000));
                        rightSide = `⏳ ${daysLeft} ${Utils.escapeHTML(map.periodDaysLeft || 'days left')}`;
                    } else {
                        const names = [lastHolder.memberId].concat(lastHolder.alsoIds || []).map(id => nameById[id] || '?').join(' & ');
                        rightSide = `👑 ${Utils.escapeHTML(names)}`;
                    }
                    rows.push(`
                        <div onclick="App.openPeriodRankings('${iso(p.start)}')" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:0.75rem; padding:0.6rem 0.5rem; margin:0 -0.5rem; border-bottom:1px solid var(--gray-light); flex-wrap:wrap; border-radius:8px;" onmouseover="this.style.background='var(--gray-light)'" onmouseout="this.style.background='transparent'">
                            <span class="text-gray" style="font-size:0.9rem;">${label}${ongoing ? ` · ${Utils.escapeHTML(map.periodOngoing || 'ongoing')}` : ''}</span>
                            <span style="font-weight:700;">${rightSide} <span aria-hidden="true">›</span></span>
                        </div>
                    `);
                });
                if (!rows.length) { section.classList.add('hidden'); return; }
                section.classList.remove('hidden');
                list.innerHTML = rows.reverse().join('');
                const pr = list.children;
                if (pr.length > 3 && pr[0]) {
                    const top0 = pr[0].getBoundingClientRect().top;
                    list.style.maxHeight = Math.ceil(pr[3].getBoundingClientRect().top - top0) + 'px';
                } else {
                    list.style.maxHeight = 'none';
                }
            },

            // Period rankings modal — the final standings of a finished
            // period, or the standings so far for the ongoing one.
            openPeriodRankings: (startIso) => {
                const list = document.getElementById('period-rankings-list');
                const sub = document.getElementById('period-rankings-sub');
                if (!list || !sub) return;
                const p = (App._bountyPeriodsCache || []).find(x => Utils.dateToLocalIso(x.start) === startIso);
                if (!p) return;
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                const loc = lang === 'el' ? 'el-GR' : undefined;
                const monthFmt = d => d.toLocaleDateString(loc, { month: 'short', year: 'numeric' });
                const todayMid = new Date();
                todayMid.setHours(0, 0, 0, 0);
                const lastDay = new Date(p.end.getTime() - 86400000);
                const finished = lastDay < todayMid;
                const endDay = finished ? lastDay : todayMid;

                const allMembers = DB.getMembers();
                const members = allMembers.filter(m => !m.hideFromLeaderboard);
                const knownIds = new Set(allMembers.map(m => m.id));
                DB.getClassCheckins().forEach(ci => {
                    if (ci.entryTime && !knownIds.has(ci.memberId)) {
                        knownIds.add(ci.memberId);
                        members.push({ id: ci.memberId, firstName: '', lastName: String(ci.memberId) });
                    }
                });
                const checkinVisitIds = new Set(DB.getClassCheckins().map(c => c.visitId));
                DB.getVisits().forEach(v => {
                    if (v.entryTime && !checkinVisitIds.has(v.id) && !knownIds.has(v.memberId)) {
                        knownIds.add(v.memberId);
                        members.push({ id: v.memberId, firstName: '', lastName: String(v.memberId) });
                    }
                });

                const series = App.getCumulativeTrainingSeries(members, p.start, endDay);
                const active = App.rankPeriodSeries(series, Utils.dateToLocalIso(endDay));
                sub.innerText = `${map.periodWord || 'Period'} ${p.n} · ${monthFmt(p.start)} – ${monthFmt(lastDay)}${finished ? '' : ` · ${map.periodOngoing || 'ongoing'}`}`;
                if (!active.length) {
                    list.innerHTML = `<p class="text-gray" style="padding: 1rem 0; text-align:center;">${Utils.escapeHTML(map.bountyLeaderboardNoTrainings || 'No trainings recorded for this date.')}</p>`;
                } else {
                    const displayNames = App.kioskDisplayNames(active.map(e => e.member));
                    const lastPlace = active[active.length - 1].place;
                    list.innerHTML = `
                        <div class="kiosk-leaderboard">
                            ${active.map((entry, idx) => {
                                const rankCell = (entry.crown || entry.place === 1)
                                    ? '<span class="kiosk-lb-rank-num">👑</span>'
                                    : App.leaderboardRankCell(entry.place, entry.place === lastPlace);
                                return `
                                    <div class="kiosk-lb-card bounty-lb-card" data-member-id="${Utils.escapeHTML(entry.member.id)}">
                                        <div class="kiosk-lb-rank">${rankCell}</div>
                                        <strong class="kiosk-lb-name" style="color:var(--dark);">${Utils.escapeHTML(displayNames[idx])}</strong>
                                        <span class="kiosk-lb-count-badge" title="${entry.count} trainings">${entry.count}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                }
                App.openModal('modal-period-rankings');
            },

            setKioskChartRange: (range) => {
                App.chartRange = 'period';
                localStorage.setItem('kiosk_chart_range', 'period');
                document.querySelectorAll('.kiosk-chart-range-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.range === 'period');
                });
                App._bountyViewOffset = 0;
                App._bountyLbDate = null;
                App._kioskChartFp = null;
                App.renderKioskChart(true);
            },

            // Crown Bounty periods (4 months each): Jul–Oct = P1, Nov–Feb =
            // P2, Mar–Jun = P3. offset walks back in whole periods (0 = the
            // running one). endExcl is a true exclusive boundary (the first
            // day of the next period).
            getBountyPeriod: (offset) => {
                const now = new Date();
                const y = now.getFullYear();
                const m = now.getMonth();
                const baseMonth = (m >= 6 && m <= 9) ? 6 : (m >= 10 || m <= 1) ? 10 : 2;
                const off = parseInt(offset, 10) || 0;
                const start = new Date(y, baseMonth + off * 4, 1);
                const sm = start.getMonth();
                const n = Math.floor(((sm + 12 - 6) % 12) / 4) + 1;
                const endExcl = new Date(start.getFullYear(), sm + 4, 1);
                return { n, start, endExcl };
            },

            getCurrentBountyPeriod: () => App.getBountyPeriod(0),

            getViewedBountyPeriod: () => App.getBountyPeriod(-(parseInt(App._bountyViewOffset, 10) || 0)),

            // ‹ › period navigation. dir -1 = older period (hidden unless it
            // has recorded sessions), dir +1 = newer (hidden at the current).
            bountyPeriodNav: (dir) => {
                const cur = parseInt(App._bountyViewOffset, 10) || 0;
                const off = cur + (dir === -1 ? 1 : -1);
                if (off < 0 || off === cur) return;
                App._bountyViewOffset = off;
                App._bountyLbDate = null;
                App._kioskChartFp = null;
                App.renderKioskChart(true);
            },

            updateBountyPeriodNav: () => {
                const prevBtn = document.getElementById('bounty-prev-period');
                const nextBtn = document.getElementById('bounty-next-period');
                const off = parseInt(App._bountyViewOffset, 10) || 0;
                let prevHas = false;
                try {
                    const prev = App.getBountyPeriod(-(off + 1));
                    const members = DB.getMembers().filter(m => !m.hideFromLeaderboard);
                    const series = App.getCumulativeTrainingSeries(members, prev.start, new Date(prev.endExcl.getTime() - 1));
                    prevHas = series.length > 0;
                } catch (e) {}
                if (prevBtn) prevBtn.classList.toggle('hidden', !prevHas);
                if (nextBtn) nextBtn.classList.toggle('hidden', off === 0);
            },

            renderBountyCountdown: () => {
                const el = document.getElementById('bounty-countdown');
                if (!el) return;
                const off = parseInt(App._bountyViewOffset, 10) || 0;
                if (off !== 0) {
                    el.classList.add('hidden');
                    return;
                }
                el.classList.remove('hidden');
                try { App.tickBountyCountdown(); } catch (e) {}
                if (!App._countdownTimer) {
                    App._countdownTimer = setInterval(() => { try { App.tickBountyCountdown(); } catch (e) {} }, 1000);
                }
            },

            tickBountyCountdown: () => {
                const el = document.getElementById('bounty-countdown');
                if (!el || el.classList.contains('hidden')) return;
                const p = App.getCurrentBountyPeriod();
                const diff = Math.max(0, p.endExcl.getTime() - Date.now());
                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;
                const ud = map.cdUnitD || 'd';
                const uh = map.cdUnitH || 'h';
                const um = map.cdUnitM || 'm';
                const us = map.cdUnitS || 's';
                const pad2 = x => String(x).padStart(2, '0');
                const d = Math.floor(diff / 86400000);
                const h = Math.floor(diff / 3600000) % 24;
                const min = Math.floor(diff / 60000) % 60;
                const sec = Math.floor(diff / 1000) % 60;
                const seg = (v, u) => `<span style="color:#fde68a; padding:0 0.15rem;">${v}</span><span style="opacity:0.85;">${Utils.escapeHTML(u)}</span>`;
                el.innerHTML = `⚔️ ${seg(d, ud)} ${seg(pad2(h), uh)} ${seg(pad2(min), um)} ${seg(pad2(sec), us)} ${Utils.escapeHTML(map.bountyCountdownText || 'until the Crown Bounty ends!')} ⚔️`;
            },

            renderKioskChart: (force) => {
                const canvas = document.getElementById('kiosk-training-chart');
                if (!canvas) return;
                if (typeof Chart === 'undefined') {
                    const holder = document.getElementById('kiosk-training-chart-container');
                    if (holder) holder.classList.add('hidden');
                    App.renderHuntLog && App.renderHuntLog([], {});
                    App.renderCurrentKingBar && App.renderCurrentKingBar(null);
                    return;
                }
                const members = App._kioskLeaderboardMembers || [];
                if (!members.length) {
                    const holder = document.getElementById('kiosk-training-chart-container');
                    if (holder) holder.classList.add('hidden');
                    App.renderHuntLog && App.renderHuntLog([], {});
                    App.renderCurrentKingBar && App.renderCurrentKingBar(null);
                    return;
                }

                const range = 'period';
                const todayEnd = new Date();
                todayEnd.setHours(23, 59, 59, 999);
                const vp = App.getViewedBountyPeriod();
                let since = new Date(vp.start.getTime());
                since.setHours(0, 0, 0, 0);
                const until = vp.endExcl > todayEnd ? todayEnd : new Date(vp.endExcl.getTime() - 1);

                const series = App.getCumulativeTrainingSeries(members, since, until);

                // Skip the full chart rebuild when nothing visible changed —
                // realtime visit pings (e.g. the auto-checkout cron) would
                // otherwise re-create the chart every few seconds.
                const scrollProbe = canvas.parentElement ? canvas.parentElement.parentElement : null;
                const fp = [App.currentKioskLang, range, since ? since.getTime() : '', until.getTime(), window.innerWidth,
                    scrollProbe ? scrollProbe.clientWidth : 0,
                    series.map(s => s.member.id + ':' + s.points.map(p => p.date + '=' + p.count).join(';')).join('|')].join('~');
                if (!force && fp === App._kioskChartFp) return;
                App._kioskChartFp = fp;

                const holder = document.getElementById('kiosk-training-chart-container');
                if (holder) holder.classList.remove('hidden');
                const empty = document.getElementById('kiosk-training-chart-empty');
                if (empty) empty.classList.toggle('hidden', series.length > 0);
                if (!series.length) {
                    if (App._kioskChartInstance) { App._kioskChartInstance.destroy(); App._kioskChartInstance = null; }
                    canvas.style.display = 'none';
                    App.renderHuntLog && App.renderHuntLog([], {});
                    App.renderCurrentKingBar && App.renderCurrentKingBar(null);
                    return;
                }
                canvas.style.display = 'block';

                // Draw order: lowest-ranked lines first, so higher-ranked
                // members' lines always render on top of lower ones.
                series.sort((a, b) => {
                    const ca = a.points.length ? a.points[a.points.length - 1].count : 0;
                    const cb = b.points.length ? b.points[b.points.length - 1].count : 0;
                    if (ca !== cb) return ca - cb;
                    return String(a.member.id).localeCompare(String(b.member.id));
                });

                const allDates = new Set();
                series.forEach(s => s.points.forEach(p => allDates.add(p.date)));
                const labels = [...allDates].sort();

                // Two timelines per member:
                //  - lineData: for rendering — null before first training and between
                //    trainings (spanGaps draws straight connectors between sessions),
                //    then the final count flat from the last training to the far right.
                //  - countAt: carry-forward cumulative for every date (tooltip + king).
                const pointMap = {};
                const countAt = {};
                const lineData = {};
                const firstIdx = {};
                series.forEach(s => {
                    pointMap[s.member.id] = new Map(s.points.map(p => [p.date, p.count]));
                    const pm = pointMap[s.member.id];
                    const trainDates = labels.filter(d => pm.has(d));
                    const fIdx = trainDates.length ? labels.indexOf(trainDates[0]) : -1;
                    const lIdx = trainDates.length ? labels.indexOf(trainDates[trainDates.length - 1]) : -1;
                    const finalCount = trainDates.length ? pm.get(trainDates[trainDates.length - 1]) : null;
                    firstIdx[s.member.id] = fIdx;
                    countAt[s.member.id] = {};
                    lineData[s.member.id] = [];
                    let prev = null;
                    labels.forEach((date, idx) => {
                        if (pm.has(date)) {
                            prev = pm.get(date);
                            countAt[s.member.id][date] = prev;
                            lineData[s.member.id][idx] = prev;
                        } else {
                            countAt[s.member.id][date] = prev;
                            lineData[s.member.id][idx] = (lIdx >= 0 && idx > lIdx) ? finalCount : null;
                        }
                    });
                });

                // Current king(s): the member(s) at the max final cumulative count.
                // Only one holds the crown; it is shared only by members with exactly
                // the same training history (identical count on every date).
                const isDesktop = window.innerWidth >= 768;
                const displayNames = App.kioskDisplayNames(series.map(s => s.member));
                const datasets = series.map((s, i) => ({
                    label: displayNames[i],
                    _memberId: s.member.id,
                    data: lineData[s.member.id],
                    borderColor: App.kioskChartColor(s.member.id, i),
                    backgroundColor: App.kioskChartColor(s.member.id, i),
                    borderWidth: 2,
                    // A visible dot marks every training: bigger for the member's
                    // very first training of the period, small for the rest.
                    pointRadius: labels.map((l, idx) => (pointMap[s.member.id].has(l) ? (idx === firstIdx[s.member.id] ? 5 : 3.5) : 0)),
                    pointBackgroundColor: App.kioskChartColor(s.member.id, i),
                    pointBorderWidth: 0,
                    pointHoverRadius: 4,
                    tension: 0,
                    spanGaps: true
                }));

                const map = App.KIOSK_I18N[App.currentKioskLang || 'en'] || App.KIOSK_I18N.en;
                const tickLocale = (App.currentKioskLang === 'el') ? 'el-GR' : undefined;
                const dateFmt = d => new Date(d + 'T12:00:00').toLocaleDateString(tickLocale, { day: 'numeric', month: 'short', year: 'numeric' });
                const periodLabel = document.getElementById('kiosk-chart-period');
                if (periodLabel) {
                    const lastDay = new Date(vp.endExcl.getTime() - 1);
                    periodLabel.innerText = `${map.periodWord || 'Period'} ${vp.n} · ${vp.start.toLocaleDateString(tickLocale, { month: 'short', year: 'numeric' })} – ${lastDay.toLocaleDateString(tickLocale, { month: 'short', year: 'numeric' })}`;
                }

                // Crown Hunt event markers (⚔️ challenges / 👑 takeovers / 🛡️
                // defenses) share a single source of truth with the Hunt Log.
                const crownResult = App.getCrownEvents(series);
                const crownEvents = crownResult.events;
                const displayNameById = {};
                series.forEach((s, i) => { displayNameById[s.member.id] = displayNames[i]; });

                // Final king(s): everyone tied at the top final count whose
                // training history is exactly identical to the earliest top
                // holder — matching the Crown Bounty Leaderboard.
                const lastDate = labels[labels.length - 1];
                const finalCounts = datasets.map(d => countAt[d._memberId][lastDate]);
                const maxFinal = Math.max(...finalCounts);
                const ptsKeyOf = (id) => {
                    const s = series.find(x => x.member.id === id);
                    return s ? s.points.map(p => p.date + '=' + p.count).join('|') : '';
                };
                const tiedIds = datasets
                    .filter(d => countAt[d._memberId][lastDate] === maxFinal)
                    .map(d => d._memberId);
                const tsOfCount = (id, c) => {
                    const s = series.find(x => x.member.id === id);
                    const t = (s && s.firstTimeAtCount && s.firstTimeAtCount[c]) || null;
                    return t ? new Date(t).getTime() : Infinity;
                };
                const primaryId = tiedIds.reduce((b, id) => (tsOfCount(id, maxFinal) < tsOfCount(b, maxFinal) ? id : b), tiedIds[0]);
                const kingIds = new Set(tiedIds.filter(id => ptsKeyOf(id) === ptsKeyOf(primaryId)));
                datasets.forEach(d => {
                    if (kingIds.has(d._memberId)) d.label = '👑 ' + d.label;
                });

                const maxNameLen = Math.max(0, ...datasets.map(d => d.label.length));

                // Spread right-side labels so members tied on the same final count
                // don't stack on top of one another. Tied names are ordered by
                // leaderboard ranking (count desc, earlier reach first), so the
                // right side reads top-to-bottom in exact ranking order.
                const rankOfMember = {};
                series.slice().sort((a, b) => {
                    const ca = a.points.length ? a.points[a.points.length - 1].count : 0;
                    const cb = b.points.length ? b.points[b.points.length - 1].count : 0;
                    if (ca !== cb) return cb - ca;
                    const ta = (a.firstTimeAtCount && a.firstTimeAtCount[ca]) ? new Date(a.firstTimeAtCount[ca]).getTime() : Infinity;
                    const tb = (b.firstTimeAtCount && b.firstTimeAtCount[cb]) ? new Date(b.firstTimeAtCount[cb]).getTime() : Infinity;
                    return ta - tb;
                }).forEach((s, i) => { rankOfMember[s.member.id] = i + 1; });
                const yGroups = {};
                finalCounts.forEach((c, i) => { (yGroups[c] = yGroups[c] || []).push(i); });
                const labelOffsets = {};
                Object.values(yGroups).forEach(indices => {
                    const n = indices.length;
                    indices.sort((a, b) => rankOfMember[datasets[a]._memberId] - rankOfMember[datasets[b]._memberId]);
                    indices.forEach((i, k) => { labelOffsets[i] = (k - (n - 1) / 2) * 14; });
                });

                // Draw each athlete's name at the far right, aligned with their
                // line's final value (PC only). On mobile the bottom legend is used.
                const rightLabelsPlugin = {
                    id: 'kioskRightLabels',
                    afterDatasetsDraw(chart) {
                        if (!isDesktop) return;
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.font = '600 11px system-ui, sans-serif';
                        ctx.textBaseline = 'middle';
                        ctx.textAlign = 'left';
                        chart.data.datasets.forEach((ds, di) => {
                            const meta = chart.getDatasetMeta(di);
                            if (!meta.visible) return;
                            const lastPt = meta.data[meta.data.length - 1];
                            if (!lastPt || !isFinite(lastPt.x) || !isFinite(lastPt.y)) return;
                            ctx.fillStyle = ds.borderColor;
                            ctx.fillText(ds.label, chart.chartArea.right + 6, lastPt.y + (labelOffsets[di] || 0));
                        });
                        ctx.restore();
                    }
                };

                // Hunt event markers (⚔️/👑) drawn above the exact data point that
                // triggered each event, with vertical offsets when they overlap.
                // Positions come from the chart scales, so they follow resizes.
                const markerHits = [];
                const eventsPlugin = {
                    id: 'kioskEventMarkers',
                    afterDatasetsDraw(chart) {
                        markerHits.length = 0;
                        if (!crownEvents.length) return;
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.font = '15px system-ui, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        const pts = [];
                        crownEvents.forEach(ev => {
                            const di = datasets.findIndex(ds => ds._memberId === ev.memberId);
                            if (di < 0) return;
                            const meta = chart.getDatasetMeta(di);
                            if (!meta || !meta.visible) return;
                            const idx = labels.indexOf(ev.date);
                            if (idx < 0) return;
                            const pt = meta.data[idx];
                            if (!pt || !isFinite(pt.x) || !isFinite(pt.y)) return;
                            pts.push({ x: pt.x, y: pt.y, ev });
                        });
                        // Cluster markers by horizontal proximity, then stack
                        // each cluster top-down: 👑 kings highest, then 🛡️
                        // defenses, then ⚔️ challenges — so a new king's emoji
                        // never renders below a shield on the same day.
                        const typeWeight = (t) => ({ king: 2, consolidate: 2, defense: 1, challenge: 0 }[t] ?? 0);
                        const clusters = [];
                        pts.forEach(p => {
                            const c = clusters.find(list => list.some(q => Math.abs(q.x - p.x) < 14));
                            if (c) c.push(p); else clusters.push([p]);
                        });
                        const placed = [];
                        clusters.forEach(cluster => {
                            cluster.sort((a, b) => (typeWeight(b.ev.type) - typeWeight(a.ev.type)) || (a.y - b.y));
                            const topRef = Math.min(...cluster.map(p => p.y));
                            cluster.forEach((p, i) => {
                                let y = topRef - 8 - i * 16;
                                while (placed.some(d => Math.abs(d.x - p.x) < 14 && Math.abs(d.y - y) < 15)) y -= 16;
                                const evEmoji = p.ev.type === 'king' || p.ev.type === 'consolidate' ? '👑' : (p.ev.type === 'defense' ? '🛡️' : '⚔️');
                                ctx.fillText(evEmoji, p.x, y);
                                placed.push({ x: p.x, y });
                                markerHits.push({ x: p.x, y, ev: p.ev });
                            });
                        });
                        ctx.restore();
                    }
                };

                if (App._kioskChartInstance) App._kioskChartInstance.destroy();
                // Make the chart tall enough to fit every member's line + labels,
                // even with 50 athletes. Top/bottom padding reserve room for the
                // staggered right-side names (and crowns) of the highest/lowest
                // groups, plus headroom so stacked event markers are never clipped.
                const offs = Object.values(labelOffsets);
                const upSpread = offs.length ? Math.max(0, ...offs.map(o => -o)) : 0;
                const downSpread = offs.length ? Math.max(0, ...offs) : 0;
                const evPerDate = {};
                crownEvents.forEach(ev => { evPerDate[ev.date] = (evPerDate[ev.date] || 0) + 1; });
                const maxStack = Object.keys(evPerDate).length ? Math.max(...Object.values(evPerDate)) : 0;
                const markerHeadroom = maxStack > 1 ? 30 + 16 * (maxStack - 1) : 0;
                const topPad = Math.max(34, upSpread + 16, markerHeadroom);
                const bottomPad = Math.max(18, downSpread + 16);
                const chartH = Math.max(280, series.length * 30 + topPad + bottomPad);
                const wrap = canvas.parentElement;
                if (wrap) wrap.style.height = chartH + 'px';
                const scrollBox = wrap ? wrap.parentElement : null;
                if (scrollBox && scrollBox.id === 'kiosk-chart-scroll') {
                    const avail = scrollBox.clientWidth || 600;
                    wrap.style.width = Math.max(avail, labels.length * 45) + 'px';
                    scrollBox.style.height = chartH + 'px';
                }
                App._kioskChartInstance = new Chart(canvas, {
                    type: 'line',
                    data: { labels, datasets },
                    plugins: [rightLabelsPlugin, eventsPlugin],
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        // Never clip datasets to the chart area — training dots on
                        // the bottom axis line would otherwise be half-hidden.
                        clip: false,
                        interaction: { mode: 'index', intersect: false },
                        layout: { padding: { top: topPad, bottom: bottomPad, right: isDesktop ? maxNameLen * 6 + 14 : 0 } },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                enabled: isDesktop,
                                filter: item => {
                                    const d = datasets.find(x => x._memberId === item.dataset._memberId);
                                    const v = d && countAt[d._memberId][item.label];
                                    return v != null;
                                },
                                callbacks: {
                                    title: items => items.length ? dateFmt(items[0].label) : '',
                                    label: ctx => {
                                        const v = countAt[ctx.dataset._memberId][ctx.label];
                                        return ` ${ctx.dataset.label}: ${v} ${map.chartTooltipTrainings || 'trainings'}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                ticks: {
                                    maxRotation: 0,
                                    autoSkip: true,
                                    maxTicksLimit: 10,
                                    callback: function(value) {
                                        const raw = this.getLabelForValue(value);
                                        const d = new Date(raw + 'T12:00:00');
                                        if (isNaN(d.getTime())) return raw;
                                        if (d.getMonth() === 0) return d.toLocaleDateString(tickLocale, { day: 'numeric', month: 'short', year: 'numeric' });
                                        return d.toLocaleDateString(tickLocale, { day: 'numeric', month: 'short' });
                                    }
                                },
                                grid: { display: false }
                            },
                            y: { min: 1, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,0.06)' } }
                        }
                    }
                });

                let tip = document.getElementById('kiosk-marker-tip');
                if (!tip) {
                    tip = document.createElement('div');
                    tip.id = 'kiosk-marker-tip';
                    document.body.appendChild(tip);
                }
                const locale = (App.currentKioskLang === 'el') ? 'el-GR' : undefined;
                const fmtFullDate = d => new Date(d + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
                const showTip = hit => {
                    const ev = hit.ev;
                    const who = [ev.memberId].concat(ev.alsoIds || []).map(id => displayNameById[id] || '?').join(' & ');
                    const prevNames = (ev.prevKingIds && ev.prevKingIds.length ? ev.prevKingIds : [ev.prevKingId])
                        .map(id => displayNameById[id] || '?').join(' & ');
                    const chalNames = (ev.challengerIds || []).map(id => displayNameById[id] || '?').join(' & ');
                    let emoji;
                    let title;
                    let detail;
                    if (ev.type === 'king') {
                        emoji = '👑';
                        title = `${who} ${ev.prevKingId ? (map.huntStoleCrown || 'Stole the Crown') : (map.huntNewKing || 'became King')}`;
                        if (!ev.prevKingId) {
                            detail = (map.huntFirstKing || 'Claimed the Crown with {c} trainings.').replace('{c}', ev.count);
                        } else {
                            detail = (map.huntBroke || "Broke {k}'s record with {c} trainings.")
                                .replace('{k}', prevNames).replace('{c}', ev.count);
                        }
                    } else if (ev.type === 'consolidate') {
                        emoji = '👑';
                        title = `${who} ${map.huntTookThrone || 'took the Throne alone'}`;
                        detail = (map.huntBrokeAway || 'Broke away from {k}.').replace('{k}', prevNames);
                    } else if (ev.type === 'defense') {
                        emoji = '🛡️';
                        title = `${who} ${map.huntDefense || 'defended the Crown'}`;
                        detail = (map.huntHeldOff || 'Held off the challenge ({k}) with {c} trainings.')
                            .replace('{k}', chalNames).replace('{c}', ev.count);
                    } else {
                        emoji = '⚔️';
                        title = `${who} ${map.huntChallenge || 'challenged the Crown'}`;
                        detail = (map.huntMatched || "Matched {k}'s record of {c} trainings.")
                            .replace('{k}', prevNames).replace('{c}', ev.count);
                    }
                    tip.innerHTML = `<strong>${Utils.escapeHTML(emoji + ' ' + title)}</strong>${Utils.escapeHTML(detail)}<br>${Utils.escapeHTML(fmtFullDate(ev.date))}`;
                    tip.style.transform = 'translate(-50%, -100%)';
                    tip.style.display = 'block';
                    const rect = canvas.getBoundingClientRect();
                    tip.style.left = Math.min(Math.max(rect.left + hit.x, 8), window.innerWidth - 8 - Math.min(280, window.innerWidth)) + 'px';
                    tip.style.top = (rect.top + hit.y - 10) + 'px';
                };
                const hideTip = () => { if (tip) tip.style.display = 'none'; };
                let lg = document.getElementById('kiosk-chart-legend');
                if (!lg) {
                    lg = document.createElement('div');
                    lg.id = 'kiosk-chart-legend';
                    wrap.appendChild(lg);
                }
                lg.innerHTML = datasets.map(ds => `
                    <div style="display:flex; align-items:center; gap:0.45rem; min-width:0;">
                        <span style="width:13px; height:13px; border-radius:4px; background:${ds.borderColor}; flex-shrink:0;"></span>
                        <span style="color:var(--dark); overflow-wrap:anywhere;">${Utils.escapeHTML(ds.label.replace('👑 ', ''))}</span>
                    </div>`).join('');
                lg.style.display = 'none';
                canvas.onmousemove = e => {
                    const rect = canvas.getBoundingClientRect();
                    const mx = e.clientX - rect.left;
                    const my = e.clientY - rect.top;
                    const hit = markerHits.find(h => Math.abs(h.x - mx) <= 11 && my >= h.y - 18 && my <= h.y + 6);
                    if (hit) showTip(hit); else hideTip();
                };
                canvas.onclick = e => {
                    const rect = canvas.getBoundingClientRect();
                    const mx = e.clientX - rect.left;
                    const my = e.clientY - rect.top;
                    const hit = markerHits.find(h => Math.abs(h.x - mx) <= 14 && my >= h.y - 22 && my <= h.y + 8);
                    if (hit) { showTip(hit); return; }
                    hideTip();
                    if (!isDesktop) {
                        const show = lg.style.display === 'none';
                        lg.style.display = show ? 'grid' : 'none';
                    }
                };
                canvas.onmouseleave = () => { hideTip(); };

                App.renderHuntLog(crownEvents, displayNameById, crownResult);
                const kingBarInfo = crownResult.currentKing
                    ? Object.assign({}, crownResult.currentKing, {
                        alsoIds: [...kingIds].filter(id => id !== crownResult.currentKing.id)
                    })
                    : null;
                App.renderCurrentKingBar(kingBarInfo, displayNameById);
                App.renderPeriodWinners && App.renderPeriodWinners();
                App.renderBountyLeaderboard && App.renderBountyLeaderboard();
                App.updateBountyPeriodNav();
                App.renderBountyCountdown();
            },

            checkoutVisit: (visitId) => {
                const visits = DB.getVisits();
                const visit = visits.find(v => v.id === visitId);
                if (visit && !visit.exitTime) {
                    visit.exitTime = new Date().toISOString();
                    DB.saveVisits(visits);
                    App.renderLivePresent();
                    const dashboardPane = document.getElementById('pane-admin-dashboard');
                    if (dashboardPane && !dashboardPane.classList.contains('hidden')) App.renderAdminDashboard();
                }
            },

});
