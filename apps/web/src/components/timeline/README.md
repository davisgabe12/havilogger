# Timeline – Future wiring plan

The Timeline currently renders `mockTimelineEvents`. To connect real data:

1. **Backend source**
   - Chat messages are converted into `Action` objects in `apps/api/app/main.py` (`generate_actions`). Those actions are stored via `persist_log` in `activity_logs` (see `apps/api/app/db.py`).
   - Each action already has `action_type`, timestamps, metadata, and knows whether it came from a chip vs free-text (chips call `sendMessage` directly).

2. **Proposed API**
   - `GET /api/v1/events?child_id=<id>&start=<ISO>&end=<ISO>`
   - Response: `{ events: [{ action_type, start, end, note, metadata, source }] }`
   - `source` can be derived from message context (chip, chat, manual import) and stored alongside the log.

3. **Mapping to TimelineEvent**
   - `Action.action_type` → `TimelineEventType` (sleep, bottle, diaper, activity, growth).
   - `metadata.note` or log note → `hasNote`.
   - `action_type === custom` → `isCustom`.
   - `source` → `TimelineEvent.source`.

4. **Frontend plan**
   - Replace `mockTimelineEvents` with a fetch hook that calls `/api/v1/events` using the child id and `[dayStart, dayEnd)` window.
   - Map the API payload → `TimelineEvent[]` using the conversion rules above.
   - When chat logs a new event, the same `/events` endpoint will surface it automatically because it reads from `activity_logs`.

This keeps “log via chat → Timeline” on one code path.

## Verification

1. Run `cd apps/web && npm run lint` and `npm test` to ensure the Timeline components and hooks stay healthy.
2. Start the dev server (`npm run dev`), open `http://localhost:3000`, tap **Menu → Timeline**, and verify:
   - Date navigation (Prev/Next/Today) updates the list.
   - Child selector chip shows the current child name.
   - Filter chips hide/show events and Note/Custom/source pills appear where expected.
   - “Open in chat →” buttons render; clicking one jumps back to the chat panel, scrolls to the originating message, and briefly highlights it.

## Chat → Timeline (live path)

- Chat messages go through `/api/v1/activities`, which converts them into actions and persists timeline events with `origin_message_id` references.
- `GET /events?child_id=<id>&start=<iso>&end=<iso>` now returns those events (type, timestamps, note/custom flags, source, origin message).
- The Timeline panel fetches that endpoint via `useTimelineEvents`, falling back to mock data only when the API returns nothing (e.g., dev/staging).
- Clicking “Open in chat →” calls `onOpenInChat(messageId)`, which the host screen can use to scroll the chat to the originating message.
