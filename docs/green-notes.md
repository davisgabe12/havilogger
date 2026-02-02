# GREEN Notes

- 2026-02-01: Migrated critical app flows (activities, conversations, tasks, timeline) to Supabase-backed API endpoints and updated web IDs to UUID strings.
- Added Playwright GREEN smoke test with screenshots saved under `docs/green-proof/`.
- Added minimal task creation UI in Tasks panel to support end-to-end flow.
- Auth UX: sign-in/sign-up/forgot-password/reset-password pages include links and HAVI header (from earlier work).
- API base URL aligned to `http://127.0.0.1:8001` for local dev.
- 2026-02-02: Removed unused web service-role routes; invite acceptance now uses API-only service role; fixed invite update f-string.
