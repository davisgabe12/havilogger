# Home V1 (Zones 1–5): Behavior, Data, and Tests

This doc is a deterministic, system-level view of how Home V1 works: what it reads, what it renders, and how we test it. It is written to answer: “What happens, when, and why?”

---

## 0) One-screen summary (Jeff Dean style)

- **Inputs**: child profile (DOB or due date), recent timeline events (last 72h), chat/conversation APIs.  
- **Outputs**: five calm zones, each with deterministic content; CTAs always seed chat, never Home.  
- **Constraints**: no predictions, no feeds, no charts, no recommendations.  
- **Failure mode**: if data is missing, render a calm empty state; never crash the shell.  

---

## 1) High-level flow

1. **Mount Home shell** (already exists from PR 1).  
2. **Load settings** (child + caregiver).  
3. **When Home panel is active**, fetch timeline events for the last 72 hours.  
4. **Compute “Recent” tiles** using deterministic thresholds.  
5. **Render Zones 1–5** with fixed ordering and calm copy.  
6. **Any CTA opens a seeded chat thread**, never a Home expansion.  

---

## 2) Required data invariants

**Child age anchor:** exactly one of `birth_date` or `due_date` must be set.  
Enforced at API schema validation so all downstream consumers can rely on it.  

---

## 3) Zone-by-zone behavior

### Zone 1 — Status (always visible)
**Purpose**: establish calm context.  
**Inputs**: time of day, child name, age anchor.  
**Output**:
- Time-aware greeting (morning/afternoon/evening).
- Child name + age label (DOB or due date).
- One neutral orientation sentence.  
**No CTA. No advice.**

---

### Zone 2 — Recent (Last chapter + Last)
**Purpose**: recent memory across sessions/days, not just last night.  
**Inputs**: timeline events from the last 72h (`/events`).  
**Logic**:
- **Last** tile shows if ≥ 1 event exists in last 72h.  
- **Last chapter** tile shows if ≥ 5 events **or** ≥ 2 distinct event types in last 72h.  
**Output**:  
Each tile renders:
- Title
- One-line summary with counts/ranges only
- CTA: “View details →”

**CTA behavior**: starts a new chat thread with a seeded, structured “artifact” summary, including coverage note “Based on what you logged.”  

**Fallbacks**:  
If no data: “You’re up to date. Log something to see it here.”  
If partial data: only show **Last**.

---

### Zone 3 — Coming Up (age-based)
**Purpose**: “What to expect” when a new age window begins.  
**Inputs**: current age week derived from DOB or due date, local storage for last seen week.  
**Logic**:
- Show if current week ≠ last seen week for Home (local storage).  
- CTA seeds chat for an explainer; Home doesn’t expand.  
**Fallback**: calm placeholder if not active.

---

### Zone 4 — Utilities
**Purpose**: simple entry points.  
**Content**: “Ask a question” button (routes to chat, focuses composer).  
**No history, no analytics.**

---

### Zone 5 — Quick chips (moved from Chat)
**Purpose**: surface common starters without scrolling chat.  
**Behavior**: chips use the same prompt templates + routing logic as Chat.  
**Rules**:
- Max 6 chips (truncate beyond).  
- Chips wrap responsively.  
- Chip click opens Chat and sends the same chip message flow as before.  

---

## 4) Data sources and APIs

- **Settings**: `/api/v1/settings`  
  - Provides child name, DOB/due date, timezone, etc.  
- **Recent events**: `/events?child_id=…&start=…&end=…`  
  - Used for Recent (Last chapter + Last) summaries.  
- **Chat**: `/api/v1/conversations`, `/api/v1/activities`  
  - Used for seeded chat threads from Home CTAs and chips.  

---

## 5) Determinism + guardrails

- No probabilistic outputs in Home.  
- Summaries only: counts, ranges, or single-event details.  
- If data is missing, show calm placeholders.  
- All deeper exploration lives in chat threads (seeded).  

---

## 6) Tests

### Frontend (apps/web)
- Jest: `cd apps/web && npm test`
  - Validates default landing = Chat/HAVI.  
  - Selecting Home renders Zones 1–5.  
  - Recent: empty state, minimal data (Last only), full data (Last chapter + Last).  
  - Chips render on Home and route into chat.

### API (apps/api)
- Unit tests assert DOB/due date exclusivity and fixture compliance.  

---

## 7) Known intentional behaviors

- **Home fetches recent events only when the Home panel is active**, to avoid background churn.  
- **No charts** on Home, even if timeline contains detailed metrics.  
- **Home never becomes the default landing**; Chat remains default.
