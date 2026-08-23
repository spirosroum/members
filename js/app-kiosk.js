// =====================================================================
// app-kiosk.js
// App methods: numpadPress, updateKioskInputMode, openClassDetails, cancelKioskClassSelection, showKioskAlert, kioskSubmit, openCheckinClassModal, toggleCheckinClass, cleanupClassCheckins, confirmKioskClassSelection, showKioskMessage, renderLivePresent, getLeaderboardStandings, leaderboardRankCell, renderKioskLeaderboard, kioskChartColor, getCumulativeTrainingSeries, setKioskChartRange, renderKioskChart, checkoutVisit
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
                const container = document.getElementById('kiosk-leaderboard-container');
                if (!container) return;
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
                App._kioskLeaderboardMembers = top.map(e => e.member);
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
                memberIds.forEach(member => {
                    const cins = checkins.filter(ci => ci.memberId === member.id && ci.entryTime);
                    const seen = new Set();
                    const dayCount = {};
                    const mEvents = [];
                    cins.forEach(ci => {
                        const d = new Date(ci.entryTime);
                        if (isNaN(d.getTime()) || d < since || d >= until) return;
                        const dateKey = ci.slotDate || Utils.dateToLocalIso(d);
                        const sessionKey = `${dateKey}|${ci.classId}|${ci.slotStart || ''}|${ci.slotEnd || ''}`;
                        if (seen.has(sessionKey)) return;
                        seen.add(sessionKey);
                        mEvents.push({ date: dateKey, time: ci.entryTime });
                    });
                    visits.forEach(v => {
                        if (v.memberId !== member.id || !v.entryTime || checkinVisitIds.has(v.id)) return;
                        const d = new Date(v.entryTime);
                        if (isNaN(d.getTime()) || d < since || d >= until) return;
                        const dateKey = Utils.dateToLocalIso(d);
                        mEvents.push({ date: dateKey, time: v.entryTime });
                    });
                    mEvents.sort((a, b) => new Date(a.time) - new Date(b.time));
                    const firstTimeAtCount = {};
                    const increments = [];
                    let running = 0;
                    mEvents.forEach(e => {
                        dayCount[e.date] = (dayCount[e.date] || 0) + 1;
                        running++;
                        if (!firstTimeAtCount[running]) firstTimeAtCount[running] = e.time;
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

            // Single source of truth for Crown events — the Hunt Log and the
            // chart markers both render from this. Replays every training
            // increment in chronological order:
            //  - No King exists until someone breaks away from a shared top
            //    with 4+ sessions (opening-period ties never crown anyone).
            //  - Reaching exactly the King's record -> ⚔️ challenge.
            //  - Exceeding it -> 👑 new King takes the Crown.
            //  - The King extending his own record stays King without an event.
            getCrownEvents: (series) => {
                const stream = [];
                series.forEach(s => {
                    (s.increments || []).forEach(inc => {
                        stream.push({ memberId: s.member.id, date: inc.date, ts: inc.time, count: inc.count });
                    });
                });
                if (!stream.length) return [];
                stream.sort((a, b) => new Date(a.ts) - new Date(b.ts));

                const INITIAL_KING_MIN_COUNT = 4;

                // Pass A: find the first proclamation via end-of-day snapshots.
                let kingId = null;
                let kingCount = 0;
                let proclaimDate = null;
                let record = 0;
                let prevTopIds = [];
                const countsEndOfDay = {};
                const byDate = {};
                stream.forEach(ev => { (byDate[ev.date] = byDate[ev.date] || []).push(ev); });
                Object.keys(byDate).sort().forEach(date => {
                    byDate[date].forEach(ev => { countsEndOfDay[ev.memberId] = ev.count; });
                    if (kingId !== null) return;
                    let maxC = 0;
                    const holders = [];
                    Object.keys(countsEndOfDay).forEach(id => {
                        const c = countsEndOfDay[id];
                        if (c > maxC) { maxC = c; holders.length = 0; holders.push(id); }
                        else if (c === maxC) holders.push(id);
                    });
                    const brokeAway = holders.length === 1 && maxC > record && record >= 1 &&
                        maxC >= INITIAL_KING_MIN_COUNT && prevTopIds.some(id => id !== holders[0]);
                    if (brokeAway) {
                        kingId = holders[0];
                        kingCount = maxC;
                        proclaimDate = date;
                    }
                    record = Math.max(record, maxC);
                    prevTopIds = holders;
                });
                if (kingId === null) return [];

                const events = [{
                    type: 'king',
                    memberId: kingId,
                    count: kingCount,
                    date: proclaimDate,
                    ts: ((byDate[proclaimDate] || []).find(ev => ev.memberId === kingId && ev.count === kingCount) || {}).ts || proclaimDate,
                    prevKingId: null,
                    prevKingCount: null
                }];

                // Pass B: challenges and takeovers from the proclamation onward.
                stream.forEach(ev => {
                    if (ev.date <= proclaimDate) return;
                    if (ev.memberId === kingId) { kingCount = ev.count; return; }
                    if (ev.count === kingCount) {
                        events.push({ type: 'challenge', memberId: ev.memberId, count: ev.count, date: ev.date, ts: ev.ts, prevKingId: kingId, prevKingCount: kingCount });
                    } else if (ev.count > kingCount) {
                        events.push({ type: 'king', memberId: ev.memberId, count: ev.count, date: ev.date, ts: ev.ts, prevKingId: kingId, prevKingCount: kingCount });
                        kingId = ev.memberId;
                        kingCount = ev.count;
                    }
                });
                return events;
            },

            renderHuntLog: (events, nameById) => {
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
                    const name = nameById[ev.memberId] || '?';
                    const emoji = ev.type === 'king' ? '👑' : '⚔️';
                    const action = ev.type === 'king' ? (map.huntNewKing || 'became King') : (map.huntChallenge || 'challenged the Crown');
                    let detail;
                    if (ev.type === 'king' && !ev.prevKingId) {
                        detail = (map.huntFirstKing || 'Claimed the Crown with {c} trainings.').replace('{c}', ev.count);
                    } else if (ev.type === 'king') {
                        detail = (map.huntBroke || "Broke {k}'s record with {c} trainings.")
                            .replace('{k}', nameById[ev.prevKingId] || '?').replace('{c}', ev.count);
                    } else {
                        detail = (map.huntMatched || "Matched {k}'s record of {c} trainings.")
                            .replace('{k}', nameById[ev.prevKingId] || '?').replace('{c}', ev.count);
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
            },

            setKioskChartRange: (range) => {
                App.chartRange = range;
                localStorage.setItem('kiosk_chart_range', range);
                const isCustom = range === 'custom';
                document.querySelectorAll('.kiosk-chart-range-btn').forEach(b => {
                    const matches = isCustom ? b.dataset.range === 'custom' : b.dataset.range === range;
                    b.classList.toggle('active', !!matches);
                });
                const rangeEl = document.getElementById('kiosk-chart-custom-range');
                if (rangeEl) rangeEl.classList.toggle('hidden', !isCustom);
                App.renderKioskChart();
            },

            renderKioskChart: () => {
                const canvas = document.getElementById('kiosk-training-chart');
                if (!canvas) return;
                if (typeof Chart === 'undefined') {
                    const holder = document.getElementById('kiosk-training-chart-container');
                    if (holder) holder.classList.add('hidden');
                    App.renderHuntLog && App.renderHuntLog([], {});
                    return;
                }
                const members = App._kioskLeaderboardMembers || [];
                if (!members.length) {
                    const holder = document.getElementById('kiosk-training-chart-container');
                    if (holder) holder.classList.add('hidden');
                    App.renderHuntLog && App.renderHuntLog([], {});
                    return;
                }

                const range = App.chartRange || '3m';
                const until = new Date();
                until.setHours(23, 59, 59, 999);
                let since;
                if (range === 'all') {
                    since = new Date(0);
                } else if (range === 'custom') {
                    const s = document.getElementById('kiosk-chart-custom-start').value;
                    const e = document.getElementById('kiosk-chart-custom-end').value;
                    since = s ? new Date(s + 'T00:00:00') : new Date(until.getTime() - 89 * 24 * 3600 * 1000);
                    if (e) until = new Date(e + 'T23:59:59');
                } else {
                    const days = range === '1m' ? 30 : 90;
                    since = new Date(until.getTime() - (days - 1) * 24 * 3600 * 1000);
                    since.setHours(0, 0, 0, 0);
                }

                const series = App.getCumulativeTrainingSeries(members, since, until);
                const holder = document.getElementById('kiosk-training-chart-container');
                if (holder) holder.classList.remove('hidden');
                const empty = document.getElementById('kiosk-training-chart-empty');
                if (empty) empty.classList.toggle('hidden', series.length > 0);
                if (!series.length) {
                    if (App._kioskChartInstance) { App._kioskChartInstance.destroy(); App._kioskChartInstance = null; }
                    canvas.style.display = 'none';
                    App.renderHuntLog && App.renderHuntLog([], {});
                    return;
                }
                canvas.style.display = 'block';

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
                    // A visible dot at the bottom marks the member's very first
                    // training of the period; all other points stay hidden.
                    pointRadius: labels.map((_, idx) => (idx === firstIdx[s.member.id] ? 5 : 0)),
                    pointBackgroundColor: App.kioskChartColor(s.member.id, i),
                    pointBorderWidth: 0,
                    pointHoverRadius: 4,
                    tension: 0,
                    spanGaps: true
                }));

                const map = App.KIOSK_I18N[App.currentKioskLang || 'en'] || App.KIOSK_I18N.en;
                const dateFmt = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

                // Resolve which of the given member ids hold the crown: one unless
                // all share exactly the same training history (identical count on
                // every date); otherwise the one who reached that count earliest
                // (or led longest), found by timestamp comparison and backward walk.
                const resolveKings = (ids, targetCount) => {
                    if (ids.length <= 1) return ids.slice();
                    const identical = ids.every(id => labels.map(x => countAt[id][x] ?? 0).join(',') === labels.map(x => countAt[ids[0]][x] ?? 0).join(','));
                    if (identical) return ids.slice();

                    const sMap = {};
                    series.forEach(s => { sMap[s.member.id] = s; });
                    const withTimes = ids.map(id => {
                        const s = sMap[id];
                        const t = (s && s.firstTimeAtCount && targetCount && s.firstTimeAtCount[targetCount])
                            ? new Date(s.firstTimeAtCount[targetCount]).getTime()
                            : Infinity;
                        return { id, t };
                    });
                    withTimes.sort((a, b) => a.t - b.t);
                    const minT = withTimes[0].t;
                    if (isFinite(minT)) {
                        const winners = withTimes.filter(x => x.t === minT).map(x => x.id);
                        if (winners.length === 1) return winners;
                    }

                    let candidates = ids.slice();
                    for (let idx = labels.length - 1; idx >= 0 && candidates.length > 1; idx--) {
                        const d = labels[idx];
                        const maxHere = Math.max(...candidates.map(c => countAt[c][d] ?? -Infinity));
                        candidates = candidates.filter(c => (countAt[c][d] ?? -Infinity) === maxHere);
                    }
                    return candidates;
                };

                // Crown Hunt event markers (⚔️ challenges / 👑 takeovers) share a
                // single source of truth with the Hunt Log below the chart.
                const crownEvents = App.getCrownEvents(series);
                const displayNameById = {};
                series.forEach((s, i) => { displayNameById[s.member.id] = displayNames[i]; });

                // Final king(s): the member(s) at the max final cumulative count.
                const lastDate = labels[labels.length - 1];
                const finalCounts = datasets.map(d => countAt[d._memberId][lastDate]);
                const maxFinal = Math.max(...finalCounts);
                const top = datasets.filter(d => countAt[d._memberId][lastDate] === maxFinal);
                const kingIds = new Set(resolveKings(top.map(d => d._memberId), maxFinal));
                datasets.forEach(d => {
                    if (kingIds.has(d._memberId)) d.label = '👑 ' + d.label;
                });

                const maxNameLen = Math.max(0, ...datasets.map(d => d.label.length));

                // Spread right-side labels so members tied on the same final count
                // don't stack on top of one another. The king is placed at the top
                // of its tied group so he always appears above his equals.
                const yGroups = {};
                finalCounts.forEach((c, i) => { (yGroups[c] = yGroups[c] || []).push(i); });
                const labelOffsets = {};
                Object.values(yGroups).forEach(indices => {
                    const n = indices.length;
                    indices.sort((a, b) => {
                        const ak = kingIds.has(datasets[a]._memberId) ? 0 : 1;
                        const bk = kingIds.has(datasets[b]._memberId) ? 0 : 1;
                        return ak - bk;
                    });
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
                        pts.sort((a, b) => a.x - b.x || a.y - b.y);
                        const placed = [];
                        pts.forEach(p => {
                            let off = 0;
                            while (placed.some(d => Math.abs(d.x - p.x) < 14 && Math.abs(d.y - (p.y - 8 - off)) < 15)) off += 16;
                            const y = p.y - 8 - off;
                            ctx.fillText(p.ev.type === 'king' ? '👑' : '⚔️', p.x, y);
                            placed.push({ x: p.x, y });
                            markerHits.push({ x: p.x, y, ev: p.ev });
                        });
                        ctx.restore();
                    }
                };

                if (App._kioskChartInstance) App._kioskChartInstance.destroy();
                // Make the chart tall enough to fit every member's line + labels,
                // even with 50 athletes. Top/bottom padding reserve room for the
                // staggered right-side names (and crowns) of the highest/lowest groups.
                const offs = Object.values(labelOffsets);
                const upSpread = offs.length ? Math.max(0, ...offs.map(o => -o)) : 0;
                const downSpread = offs.length ? Math.max(0, ...offs) : 0;
                const topPad = Math.max(34, upSpread + 16);
                const bottomPad = Math.max(12, downSpread + 16);
                const chartH = Math.max(280, series.length * 30 + topPad + bottomPad);
                const wrap = canvas.parentElement;
                if (wrap) wrap.style.height = chartH + 'px';
                App._kioskChartInstance = new Chart(canvas, {
                    type: 'line',
                    data: { labels, datasets },
                    plugins: [rightLabelsPlugin, eventsPlugin],
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        layout: { padding: { top: topPad, bottom: bottomPad, right: isDesktop ? maxNameLen * 6 + 14 : 0 } },
                        plugins: {
                            legend: { display: !isDesktop, position: 'bottom', labels: { boxWidth: 12, padding: 8 } },
                            tooltip: {
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
                            x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } },
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
                    const who = displayNameById[ev.memberId] || '?';
                    const emoji = ev.type === 'king' ? '👑' : '⚔️';
                    let title;
                    let detail;
                    if (ev.type === 'king' && !ev.prevKingId) {
                        title = `${who} ${map.huntNewKing || 'became King'}`;
                        detail = (map.huntFirstKing || 'Claimed the Crown with {c} trainings.').replace('{c}', ev.count);
                    } else if (ev.type === 'king') {
                        title = `${who} ${map.huntNewKing || 'became King'}`;
                        detail = (map.huntBroke || "Broke {k}'s record with {c} trainings.")
                            .replace('{k}', displayNameById[ev.prevKingId] || '?').replace('{c}', ev.count);
                    } else {
                        title = `${who} ${map.huntChallenge || 'challenged the Crown'}`;
                        detail = (map.huntMatched || "Matched {k}'s record of {c} trainings.")
                            .replace('{k}', displayNameById[ev.prevKingId] || '?').replace('{c}', ev.count);
                    }
                    tip.innerHTML = `<strong>${Utils.escapeHTML(emoji + ' ' + title)}</strong>${Utils.escapeHTML(detail)}<br>${Utils.escapeHTML(fmtFullDate(ev.date))}`;
                    tip.style.transform = 'translate(-50%, -100%)';
                    tip.style.display = 'block';
                    const rect = canvas.getBoundingClientRect();
                    tip.style.left = Math.min(Math.max(rect.left + hit.x, 8), window.innerWidth - 8 - Math.min(280, window.innerWidth)) + 'px';
                    tip.style.top = (rect.top + hit.y - 10) + 'px';
                };
                const hideTip = () => { if (tip) tip.style.display = 'none'; };
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
                    if (hit) showTip(hit); else hideTip();
                };
                canvas.onmouseleave = hideTip;

                App.renderHuntLog(crownEvents, displayNameById);
                App.renderCrownHistory && App.renderCrownHistory();
            },

            renderCrownHistory: () => {
                const container = document.getElementById('kiosk-crown-history-list');
                const section = document.getElementById('kiosk-crown-history-section');
                if (!container || !section) return;

                const members = (App._kioskLeaderboardMembers && App._kioskLeaderboardMembers.length)
                    ? App._kioskLeaderboardMembers
                    : DB.getMembers().filter(m => !m.hideFromLeaderboard);
                if (!members.length) { section.classList.add('hidden'); return; }

                const until = new Date();
                until.setHours(23, 59, 59, 999);
                const since = new Date(until.getTime() - 89 * 24 * 3600 * 1000);
                since.setHours(0, 0, 0, 0);

                const series = App.getCumulativeTrainingSeries(members, since, until);
                if (!series.length) { section.classList.add('hidden'); return; }

                const allDates = new Set();
                series.forEach(s => s.points.forEach(p => allDates.add(p.date)));
                const labels = [...allDates].sort();
                if (!labels.length) { section.classList.add('hidden'); return; }

                const calendarDates = [];
                const d = new Date(since);
                while (d <= until) {
                    calendarDates.push(Utils.dateToLocalIso(d));
                    d.setDate(d.getDate() + 1);
                }

                const pointMap = {};
                const countAt = {};
                series.forEach(s => {
                    pointMap[s.member.id] = new Map(s.points.map(p => [p.date, p.count]));
                    const pm = pointMap[s.member.id];
                    countAt[s.member.id] = {};
                    let prev = null;
                    calendarDates.forEach(date => {
                        if (pm.has(date)) prev = pm.get(date);
                        countAt[s.member.id][date] = prev;
                    });
                });

                // Resolve which of the given member ids hold the crown: one unless
                // all share exactly the same training history (identical count on
                // every date); otherwise the one who reached that count earliest
                // (or led longest), found by timestamp comparison and backward walk.
                const resolveKings = (ids, targetCount) => {
                    if (ids.length <= 1) return ids.slice();
                    const identical = ids.every(id => labels.map(x => countAt[id][x] ?? 0).join(',') === labels.map(x => countAt[ids[0]][x] ?? 0).join(','));
                    if (identical) return ids.slice();

                    const sMap = {};
                    series.forEach(s => { sMap[s.member.id] = s; });
                    const withTimes = ids.map(id => {
                        const s = sMap[id];
                        const t = (s && s.firstTimeAtCount && targetCount && s.firstTimeAtCount[targetCount])
                            ? new Date(s.firstTimeAtCount[targetCount]).getTime()
                            : Infinity;
                        return { id, t };
                    });
                    withTimes.sort((a, b) => a.t - b.t);
                    const minT = withTimes[0].t;
                    if (isFinite(minT)) {
                        const winners = withTimes.filter(x => x.t === minT).map(x => x.id);
                        if (winners.length === 1) return winners;
                    }

                    let candidates = ids.slice();
                    for (let idx = labels.length - 1; idx >= 0 && candidates.length > 1; idx--) {
                        const dateKey = labels[idx];
                        const maxHere = Math.max(...candidates.map(c => countAt[c][dateKey] ?? -Infinity));
                        candidates = candidates.filter(c => (countAt[c][dateKey] ?? -Infinity) === maxHere);
                    }
                    return candidates;
                };

                const chartCrowns = {};
                let record = 0;
                let proclaimedKings = [];

                labels.forEach(date => {
                    let maxToday = -1;
                    const holders = [];
                    series.forEach(s => {
                        const c = countAt[s.member.id][date];
                        if (c == null) return;
                        if (c > maxToday) { maxToday = c; holders.length = 0; holders.push(s.member.id); }
                        else if (c === maxToday) holders.push(s.member.id);
                    });
                    if (maxToday <= 0) return;

                    if (maxToday > record) {
                        const kings = resolveKings(holders, maxToday);
                        if (proclaimedKings.length === 0) {
                            const prevAtTop = series.filter(s => countAt[s.member.id][date] === record).map(s => s.member.id);
                            if (record >= 1 && prevAtTop.length > 0) {
                                const droppedOut = prevAtTop.filter(id => (countAt[id][date] ?? 0) < maxToday);
                                if (droppedOut.length > 0 && maxToday >= 4) {
                                    proclaimedKings = kings;
                                    chartCrowns[date] = kings;
                                }
                            }
                        } else {
                            const prevKey = proclaimedKings.slice().sort().join('|');
                            const newKey = kings.slice().sort().join('|');
                            if (prevKey !== newKey) {
                                proclaimedKings = kings;
                                chartCrowns[date] = kings;
                            }
                        }
                        record = maxToday;
                    }
                });

                const daysByMember = {};
                const memberMap = {};
                series.forEach(s => { memberMap[s.member.id] = s.member; });

                let activeKings = [];
                calendarDates.forEach(d => {
                    if (chartCrowns[d]) {
                        activeKings = chartCrowns[d];
                    }
                    activeKings.forEach(id => {
                        daysByMember[id] = (daysByMember[id] || 0) + 1;
                    });
                });

                const entries = Object.entries(daysByMember)
                    .map(([id, days]) => ({ member: memberMap[id], days }))
                    .filter(e => e.member && e.days > 0)
                    .sort((a, b) => b.days - a.days || a.member.lastName.localeCompare(b.member.lastName));

                if (!entries.length) { section.classList.add('hidden'); return; }
                section.classList.remove('hidden');

                let prevDays = null;
                let prevRank = 0;
                entries.forEach((entry, index) => {
                    if (index === 0 || entry.days !== prevDays) {
                        entry.rank = index + 1;
                    } else {
                        entry.rank = prevRank;
                    }
                    prevDays = entry.days;
                    prevRank = entry.rank;
                });

                const lang = App.currentKioskLang || 'en';
                const map = App.KIOSK_I18N[lang] || App.KIOSK_I18N.en;

                const crownNames = App.kioskDisplayNames(entries.map(x => x.member));
                container.innerHTML = `
                    <div class="kiosk-leaderboard">
                        ${entries.map((e, idx) => {
                            const dayLabel = e.days === 1 ? (map.crownHistoryDay || 'day') : (map.crownHistoryDays || 'days');
                            const textColor = ((e.member.belt || 'White').split('/')[0].trim() === 'White') ? '#000000' : '#FFFFFF';
                            return `
                                <div class="kiosk-lb-card" style="background:${Utils.getBeltColor(e.member.belt)};">
                                    <div class="kiosk-lb-rank"><span class="kiosk-lb-rank-num">${e.rank}</span></div>
                                    <strong class="kiosk-lb-name" style="color:${textColor};">${Utils.escapeHTML(crownNames[idx])}</strong>
                                    <span class="kiosk-lb-count-badge" title="${e.days} ${dayLabel}">${e.days} ${dayLabel}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
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
