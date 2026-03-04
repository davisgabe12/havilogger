Status: current
Last updated: March 4, 2026

# GREEN Seed/Reset Harness

Purpose: make local GREEN runs reproducible by preparing deterministic test state.

## Script

`/Users/gabedavis/Desktop/projects/havilogger/scripts/green_seed_reset.sh`

## Modes

1. `reset` (implemented in slice 1)
2. `seed` (planned)
3. `reset-seed` (planned)

Slice 1 behavior:
1. Finds only GREEN-scoped records.
2. Default is dry-run (no mutation).
3. Writes JSON proof report to `docs/active/green-proof/`.

## Safety Interlocks

1. Mutations require `GREEN_SEED_APPLY=1`.
2. Shared Supabase mutations require `GREEN_ALLOW_SHARED_DB=1`.
3. Cleanup scope is limited to:
- `[GREEN-SEED]` marker in titles/content.
- seeded invite emails (`GREEN_SEED_OWNER_EMAIL`, `GREEN_SEED_INVITEE_EMAIL`).

## Required Environment

1. `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `jq` and `curl` on PATH

The service-role key is required because reset accesses Supabase tables directly and is not user-scoped.

## Commands

Dry-run reset:

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
./scripts/green_seed_reset.sh reset
```

Apply reset (destructive to GREEN-scoped rows only):

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
GREEN_SEED_APPLY=1 GREEN_ALLOW_SHARED_DB=1 ./scripts/green_seed_reset.sh reset
```

Custom marker or emails:

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
GREEN_MARKER='[GREEN-SEED]' \
GREEN_SEED_OWNER_EMAIL='gdavis12+greenowner@gethavi.test' \
GREEN_SEED_INVITEE_EMAIL='gdavis12+greeninvitee@gethavi.test' \
./scripts/green_seed_reset.sh reset
```

## Report Output

Each run writes:

`docs/active/green-proof/green-seed-reset-<run_id>.json`

Report includes:
1. `run_id`, `generated_at`, `mode`, `apply`
2. Supabase URL used
3. table-level `found` and `deleted` counts for:
- `family_invites`
- `tasks`
- `timeline_events`
- `conversation_sessions`
- `conversation_messages_by_marker`
- `conversation_messages_by_session`

## Troubleshooting

1. `Missing SUPABASE_URL... or SUPABASE_SERVICE_ROLE_KEY`:
- add env vars to shell or `.env.local` files.
2. `Refusing to mutate shared Supabase...`:
- expected unless `GREEN_ALLOW_SHARED_DB=1` is set.
3. `Mode 'seed' is not implemented...`:
- expected in slice 1; this will be added in SID-43 slice 2.
