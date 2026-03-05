Status: current
Last updated: March 5, 2026

# GREEN Seed/Reset Harness

Purpose: make local GREEN runs reproducible by preparing deterministic test state.

## Script

`/Users/gabedavis/Desktop/projects/havilogger/scripts/green_seed_reset.sh`

## Modes

1. `reset`
2. `seed`
3. `reset-seed`

Current behavior:
1. Finds only GREEN-scoped records.
2. `reset` defaults to dry-run (no mutation) unless `GREEN_SEED_APPLY=1`.
3. `seed` and `reset-seed` are mutating and require `GREEN_SEED_APPLY=1`.
4. Writes JSON proof report to `docs/active/green-proof/`.

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

Apply seed (creates deterministic baseline fixtures):

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
GREEN_SEED_APPLY=1 GREEN_ALLOW_SHARED_DB=1 ./scripts/green_seed_reset.sh seed
```

Apply reset + seed (recommended deterministic baseline prep):

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
GREEN_SEED_APPLY=1 GREEN_ALLOW_SHARED_DB=1 ./scripts/green_seed_reset.sh reset-seed
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
3. reset table-level `found` and `deleted` counts for:
- `family_invites`
- `tasks`
- `timeline_events`
- `conversation_sessions`
- `conversation_messages_by_marker`
- `conversation_messages_by_session`
 - `children`
 - `family_members`
 - `families`
4. Seed IDs when `seed`/`reset-seed` succeeds:
 - `owner_user_id`
 - `invitee_user_id`
 - `family_id`
 - `child_primary_id`
 - `child_secondary_id`
 - `session_id`
 - `task_id`
 - `invite_id`

## GREEN Runner Integration

1. `scripts/e2e_green.sh` supports:
 - `GREEN_USE_SEED=1` to run harness before Playwright
 - `GREEN_SKIP_SEED=1` to force skip
 - `GREEN_SEED_MODE=reset-seed|seed|reset`
2. `scripts/green-doctor.mjs` supports the same flags.
3. Recommended deterministic local run:

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
GREEN_USE_SEED=1 GREEN_SEED_APPLY=1 GREEN_ALLOW_SHARED_DB=1 ./scripts/e2e_green.sh
```

## Troubleshooting

1. `Missing SUPABASE_URL... or SUPABASE_SERVICE_ROLE_KEY`:
- add env vars to shell or `.env.local` files.
2. `Refusing to mutate shared Supabase...`:
- expected unless `GREEN_ALLOW_SHARED_DB=1` is set.
3. `Mode 'seed' is not implemented...`:
- no longer applicable; use `GREEN_SEED_APPLY=1` for mutating modes.
