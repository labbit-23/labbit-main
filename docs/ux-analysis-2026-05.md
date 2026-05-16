# Labbit UX/UI Analysis — May 2026

## 1. Executive Summary

The platform is technically capable but suffers from **desktop-first thinking applied to field workers**. Visit Executives (Phlebos) and Logistics staff operate entirely on phones, often in low-connectivity environments with time pressure. The current UI was designed for desktop admin workflows and adapted to mobile via Chakra breakpoints — not designed mobile-first. This gap is the root cause of poor adoption and inconsistent status updates.

**Core diagnosis:**
- Visit Executives have too many decisions to make before they can update a status. The UI asks them to navigate tabs, identify the right card, and choose from a list. In the field, they need zero-friction taps.
- Logistics staff face a `window.prompt()` for entering lot references — a jarring browser dialog that breaks the native feel entirely.
- Neither role has meaningful accountability visibility — they don't see *why* updating matters (patient waiting, admin blocked).

---

## 2. Visit Executive (Phlebo) — Deep Dive

### Who they are and how they work
Visit Executives are phlebotomists doing 3–8 home visits per day. They travel between patient homes, carry sample kits, and need to:
1. Know where to go next
2. Confirm arrival (status: in_progress)
3. Confirm sample collected (sample_picked)
4. Confirm sample dropped at lab (sample_dropped)
5. Occasionally self-assign unassigned visits

They work on **phones**, **on the road**, often with **intermittent connectivity**.

### Current UX flow (what they actually see)
1. Login → `/phlebo` → 3 Tabs: **Active Visits | Visit Actions | Patient Search**
2. Active Visits tab shows 5–6 sections stacked vertically: Recommended / Tomorrow Snapshot / Action Required / Closed / Post-Collection Pending / Unassigned
3. To update a status: find the card → tap the "Quick Action" button (e.g., "Start visit") on the card, OR tap the card to open VisitDetailTab → find the correct button there
4. For overrides or abnormal flow: must go to VisitDetailTab → use the dropdown with optgroup + separate confirm-tick button

### UX Problems — Visit Executives

#### P0 — Critical barriers to adoption

**A. Too many sections = cognitive overload**
The dashboard has 6 stacked sections. A phlebo with 5 visits assigned sees: 1 Recommended card + their same visits again in "Action Required" + potentially in "Closed" later. They see duplicate information and don't know which section to trust. The mental model is fragmented.

**Fix:** Single chronological timeline view — "Your Day" — sorted by appointment slot, with a single clear "Next Action" button per visit. No section headers needed.

**B. Tab navigation adds friction**
"Active Visits" and "Visit Actions" are separate tabs. The patient search is also separate. Visit Executives regularly need to look up a patient while on a visit. Switching tabs loses their place.

**Fix:** Collapse to a single scrollable view. Patient search becomes a floating action button (FAB) or a persistent search bar at top.

**C. Status update is 2 steps when it should be 1**
Card shows "Start travel" button → tapping goes to VisitDetailTab where the real "Start Visit" / override controls live. The quick-action buttons on cards advance one status, but the detail tab is a completely different screen. This inconsistency confuses executives who aren't sure which is "the real update."

**Fix:** One tap on the card's primary button = done, with a brief undo toast (3 seconds). No navigation required for standard flow. Detail view available via a secondary tap, not the default path.

**D. No "what do I do right now?" focus state**
The Recommended Visit card is buried among other sections and not visually dominant. Executives in a rush scroll past it.

**Fix:** The top 1/3 of the screen should always be the single active visit the exec should be working on now. No scrolling needed to find it. Full-screen card with large address, time, and ONE big button.

**E. No patient location → navigation handoff**
Address exists in the visit. No "Open in Maps" / "Navigate" button is surfaced in the phlebo view. Executives likely copy the address manually or call the patient.

**Fix:** A "Navigate" button that opens the address in Google Maps / Apple Maps via deep link. One tap from the visit card.

#### P1 — Significant friction

**F. Gate Location capture is buried**
"Save Gate Location" is on the VisitDetailTab — a secondary screen. Executives likely don't know it exists or don't bother navigating to it.

**Fix:** When exec taps "I've arrived" (in_progress), prompt for gate location inline — a one-tap "Use my current location" confirmation, not a buried button.

**G. No offline queue / retry**
In poor connectivity areas, status updates silently fail. There's no offline queue. The exec assumes the update went through. Admin sees stale status.

**Fix:** Background sync with local draft queue. Show a small "syncing…" / "saved offline" indicator.

**H. No context on why urgency matters**
Executives don't see that patient is waiting or admin is blocked. If the status doesn't update, they don't feel consequences.

**Fix:** Subtle but visible patient context on each card — e.g., "Patient notified 45 min ago" or "Slot ends in 30 min". Creates natural accountability.

**I. window.confirm for force-assign conflict**
Browser `window.confirm()` dialogs are jarring on mobile, look like security alerts, and break immersion. Used in 4+ places.

**Fix:** Replace with Chakra AlertDialog (already available in the stack).

**J. "Unassigned Visits" section placement**
Unassigned visits appear at the *bottom* of the dashboard. Executives who need to self-claim a visit have to scroll past their entire active caseload.

**Fix:** If there are unassigned visits, surface a single dismissible banner at the top: "2 unassigned visits need someone — claim one."

#### P2 — Polish & usability

**K. Dark/light theme is dashboard-local**
Admin and Phlebo have separate theme preferences stored separately in localStorage. No global preference.

**L. No progress indicator for the day**
Executives don't see "3 of 6 visits completed". A simple progress strip would motivate completion.

**M. The "Visit Actions" tab purpose is unclear**
From the code it appears to be `VisitDetailTab` — a detail view for a selected visit. But it's a permanent tab even when no visit is selected. This is confusing.

**N. Geolocation permission is never explicitly requested**
The gate-location feature uses `navigator.geolocation` but there's no upfront permission request or graceful fallback UI when denied.

---

## 3. Logistics — Deep Dive

### Who they are and how they work
Logistics staff travel between collection centres to pick up sample lots and drop them at the lab. They:
1. See pending pickups across all centres
2. Mark samples as picked up (with a lot reference number)
3. Mark samples as dropped at the lab

They work on **phones**, **in vehicles**, under **time pressure** to preserve sample integrity.

### Current UX flow
1. Login → `/collection-centre` → 2 Tabs: **Pickup History | Request Pickup**
2. Pickup History shows a filtered list with "Mark Picked Up" / "Mark Dropped" buttons
3. "Mark Picked Up" triggers `window.prompt("Enter lot reference (optional)")` — a browser dialog

### UX Problems — Logistics

#### P0 — Critical barriers

**A. window.prompt for lot reference is unacceptable**
`window.prompt()` is a blocking browser dialog. On mobile Chrome/Safari it:
- Looks like a phishing alert
- Has no visual design
- Can't be pre-filled or auto-suggested
- Blocks the UI thread

This alone likely causes executives to abandon the flow and update verbally or via WhatsApp instead.

**Fix:** Inline lot-reference input on the card — a small text field that appears inline when "Mark Picked Up" is tapped. Auto-dismiss after 30 seconds with "no reference" if not filled. Or even better: make lot reference a separate optional step with a "Add reference later" option.

**B. No visual centre grouping or routing order**
The pickup list is a flat list filtered by status. Logistics staff visiting 4 centres in a day have no sense of sequence or priority. They need to mentally reorder their route.

**Fix:** Group pickups by collection centre. Show centre address. Allow logistics to set a visit order for the day. Optional: route optimisation suggestion based on centre addresses.

**C. No "what's pending at this centre" quick summary**
When a logistics exec arrives at a centre, they want to know immediately: how many lots to pick up, what tests. Currently they have to scan the list manually.

**Fix:** Per-centre summary card: "Sunrise Diagnostics — 3 lots pending since 9:00 AM". One tap to see all.

#### P1 — Significant friction

**D. "Request Pickup" tab confusion**
The second tab lets logistics staff *create* a pickup request. But logistics is the *executor*, not the requester. Collection centres or admins create requests. This tab being default-visible and equally weighted creates confusion about the role.

**Fix:** Move "Request Pickup" to an overflow menu or secondary action. The primary view is the work queue.

**E. No batch mark-picked or batch mark-dropped**
If a logistics exec picks up from 3 centres simultaneously, they need to tap 3 separate "Mark Picked Up" buttons with 3 separate prompts.

**Fix:** Multi-select checkbox mode with bulk action button.

**F. Status filter is a dropdown, not a quick-filter strip**
Switching between "pending/picked/dropped" requires a dropdown interaction. On mobile, a horizontal quick-filter strip (chips) would be faster and always visible.

**G. No ETA or urgency signal on pickups**
The pickup card doesn't show how long samples have been waiting. Sample integrity degrades over time.

**Fix:** Show "Pending since 2h 30m" with color coding: green < 2h, orange 2–4h, red > 4h.

---

## 4. Other UI/UX Gaps (Cross-Role)

### 4.1 No PWA / Native App Feel
No `manifest.json`, no service worker, no "Add to Home Screen" prompt. Field workers accessing via browser don't get:
- Full-screen app experience
- Offline capability
- Native push notifications (only browser notification API is used)
- App icon on home screen

This is the single biggest structural gap. Field workers (phlebos, logistics) will not consistently use a browser tab. A PWA manifest is a low-effort, high-impact change.

### 4.2 Authentication UX for Field Workers
Password login + "Forgot password via OTP" for employees. Field workers likely struggle with:
- Remembering passwords (no biometric / passkey)
- OTP flow when switching phones or working in signal-dead zones
- Session expiry mid-shift

### 4.3 Browser Notifications are the Only Async Channel
`AppNotifications.js` polls every 30 seconds and sends browser notifications. This requires:
- Browser notification permission granted
- Browser tab open or visible
- No reliable delivery guarantee

Field workers who minimize the browser tab (or use a native app for everything else) miss these entirely.

### 4.4 Inconsistent Status Update Patterns Across Roles
Each role has a completely different status-update UX:
- **Phlebo:** one-tap buttons on cards + full override in detail tab
- **Logistics:** text buttons in list cards + window.prompt for metadata
- **Admin:** icon-only buttons in a data table

No shared `<StatusUpdater />` primitive. Bugs fixed in one place aren't fixed in others. Visual language is inconsistent.

### 4.5 window.confirm / window.prompt Used in 5+ Critical Flows
Native browser dialogs appear in:
- Force-assign visit conflict (3+ places)
- Lot reference on pickup mark
These create a jarring, unprofessional feel especially on mobile. All should be replaced with Chakra `AlertDialog` / `Modal`.

### 4.6 Duplicate Role Resolution Logic
Three near-identical helpers exist: `getRoleKey`, `roleKeyFromUser`, `resolveRoleKey` across different files. Any future role change risks inconsistency across dashboards.

### 4.7 Admin Visit Table on Mobile
`VisitsTable.js` hides date/slot columns on mobile and inlines them in the patient cell. This works but the result is a very dense patient cell on small screens. Admins managing visits from phones have a poor experience.

### 4.8 No Global Theme
Admin and Phlebo dashboards have separate localStorage keys for dark/light preference. If a user switches roles or devices, their preference is lost.

### 4.9 Backup/Legacy Files Polluting the Tree
12+ legacy files (`page.old.js`, `page.backup.js`, `page_old.js`, `VisitModal_.js`, `AddressPicker_.js`, etc.) live alongside production code. These confuse developers and occasionally get imported by mistake.

### 4.10 Login: Two Tabs But No Clear Routing Context
The login page has Patient / Employee tabs. First-time field workers might land on the Patient tab. There's no contextual hint like "Employee? Click here" on the landing page, and the URL is just `/login` with no intent signal.

---

## 5. Prioritised Recommendations

### Phase 1 — Field Worker UX Fix (1–2 sprints, highest ROI)

| # | Change | Impact |
|---|---|---|
| 1 | **Replace all `window.prompt` and `window.confirm` with Chakra modals** | Immediately fixes jarring UX, especially for logistics lot reference. Affects 5+ flows. |
| 2 | **Redesign Phlebo dashboard to "Your Day" single-view** | Remove the 5-section layout. Chronological visit list, dominant "current visit" card at top with Navigate + One-Tap status. |
| 3 | **Add "Open in Maps" deep link on every visit address** | One line of code per card. Massive practical value for phlebos in the field. |
| 4 | **Surface gate location prompt inline on "arrived" action** | Auto-request location when exec marks `in_progress`. No need to find the detail tab. |
| 5 | **Logistics: inline lot-reference input on "Mark Picked Up"** | Replace `window.prompt` with inline text field on the card. |
| 6 | **Logistics: group pickups by collection centre** | Flat list → centre-grouped cards. Each centre shows pending count and how long waiting. |

### Phase 2 — PWA + Notifications (1 sprint)

| # | Change | Impact |
|---|---|---|
| 7 | **Add PWA manifest + service worker** | Field workers can add to home screen, get full-screen experience, and receive push notifications reliably. |
| 8 | **Show "Pending since X" urgency color on pickup cards** | Logistics sees sample urgency at a glance. Green/orange/red coding. |
| 9 | **Add "2 unassigned visits" banner for phlebos** | Surfaces self-assign opportunity without forcing scroll. |
| 10 | **Day progress indicator for phlebos** | "3 of 6 visits completed" strip. Low effort, motivating. |

### Phase 3 — Structural Cleanup (ongoing)

| # | Change | Impact |
|---|---|---|
| 11 | **Consolidate role-resolution helpers** into one `getRoleKey` utility | Prevents future role-routing bugs. |
| 12 | **Delete legacy/backup files** from production tree | Developer experience, prevents accidental imports. |
| 13 | **Add global theme context** so dark/light preference persists across roles and devices | Minor UX polish. |
| 14 | **Create shared `<StatusButton />` / `<StatusUpdater />` primitive** | Single place to fix status update UX bugs, used by all roles. |

---

## 6. Visit Executive Adoption: Root Cause Summary

The core reason Visit Executives don't efficiently update status is **not motivation — it's friction**:

1. **They can't easily find the right card** — 5-section dashboard with 6-8 cards is hard to scan on a phone while walking
2. **Two-step updates** — card button navigates to detail tab; detail tab has more buttons; they give up
3. **No "what do I do next?" clarity** — the "Recommended Visit" card competes visually with identical-looking "Action Required" cards
4. **No navigation aid** — they solve the address problem themselves (WhatsApp, phone call) rather than using the app
5. **window.confirm dialogs** feel like errors, not actions — they dismiss them and don't retry

**The fix is a dedicated mobile-first phlebo screen** where the entire screen is one active visit at a time, with giant clearly-labelled buttons and no ambiguity. Everything else (history, patient lookup) is one tap away but not in the way.

---

## 7. Logistics Adoption: Root Cause Summary

Logistics adoption is lower because:

1. **window.prompt for lot reference** — the very first "mark picked up" action hits a browser dialog that looks broken. They stop there.
2. **No centre grouping** — the list doesn't match their mental model of "I visit Centre A, then Centre B". It's a jumbled list.
3. **Flat status filter** requires interaction to switch views; they likely just see whatever the default filter is.

**The fix is relatively small**: eliminate the browser dialog, group by centre, and add time-since urgency signals. The core logistics flow is simpler than phlebo — it just has one critical UX blocker (`window.prompt`) that needs removing.

---

## 8. What's Already Good

- **One-tap status progression** on phlebo cards is the right idea — just needs to be the dominant pattern, not one of two patterns
- **AppNotifications browser polling** is thoughtful; needs PWA push to become truly reliable
- **409 + force-assign conflict handling** is correct logic; just needs AlertDialog UI
- **Role-scoped data access** (logistics lab-wide vs B2B centre-scoped) is well-implemented server-side
- **VisitDetailTab override flow** (optgroup dropdown + abnormal states) is powerful for admin/manager overrides — keep it for admin use
- **The Recommended Visit card concept** is right — just needs to be the *entire* primary view, not a section in a longer list

---

*Analysis based on full codebase read of `/Users/pav/projects/Labbit/labbit-main`, May 2026.*
