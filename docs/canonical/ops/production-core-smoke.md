Status: current
Last updated: March 5, 2026

# Production Core Smoke (Before/After Gate)

Use this fast smoke gate before and after major changes to confirm Havi core behavior does not degrade.

## Scope

1. Existing account flow.
2. New signup flow.
3. Core actions in both flows:
   - tracking message,
   - guidance message,
   - task creation,
   - conversation auto-title + rename persistence.
4. Invariant:
   - tracking adds timeline event,
   - guidance does not add timeline event,
   - first message auto-titles conversation (`!= New chat`),
   - manual renamed title remains unchanged after follow-up.

## Commands

Before changes:

```bash
HAVI_SMOKE_LABEL=before-<change-name> ./scripts/prod_core_smoke.sh
```

After changes:

```bash
HAVI_SMOKE_LABEL=after-<change-name> ./scripts/prod_core_smoke.sh
```

Skill wrapper (equivalent):

```bash
/Users/gabedavis/.codex/skills/havi-prod-core-smoke/scripts/run.sh before-<change-name>
/Users/gabedavis/.codex/skills/havi-prod-core-smoke/scripts/run.sh after-<change-name>
```

Deterministic production UI gate (two consecutive GREEN passes):

```bash
HAVI_UI_SMOKE_LABEL=after-<change-name> ./scripts/prod_ui_smoke_gate.sh
```

## Evidence Artifacts

Each run writes a report:

`docs/active/green-proof/prod-core-smoke-<label>.json`

UI gate writes:

`docs/active/green-proof/prod-ui-smoke-<label>.json`
`docs/active/green-proof/prod-ui-smoke-<label>/run-<n>.log`

For each release slice, keep both reports (`before` and `after`) and confirm:

1. HTTP checks stayed green.
2. Both flows passed.
3. Guidance-vs-tracking invariant stayed intact.
4. Title invariants stayed intact (`auto_title`, `renamed_title`, `title_after_follow_up` in report).

## Release Evidence Curation (Required)

For each shipped slice, create one canonical proof bundle:

`docs/active/green-proof/releases/<YYYY-MM-DD>-<slice-name>/`

Minimum contents:
1. One production core smoke JSON (`before` or `after` depending on release stage; prefer both when available).
2. One production GREEN pass artifact (log/text summary or UI smoke JSON).
3. A small screenshot set (3-8 images) that demonstrates the critical user journey.
4. A short `README.md` with:
   - commit SHA,
   - commands run,
   - pass/fail outcome,
   - any caveats.

Do not commit raw iterative artifacts as release evidence:
1. Repeated manual smoke JSONs with no release decision context.
2. Temporary Playwright output folders.
3. Large duplicate screenshot sets from debugging loops.

## Environment Overrides

- `HAVI_SMOKE_EXISTING_EMAIL`
- `HAVI_SMOKE_EXISTING_PASSWORD`
- `HAVI_SMOKE_NEW_EMAIL`
- `HAVI_SMOKE_NEW_PASSWORD`
- `HAVI_PROD_SITE_BASE_URL`
- `HAVI_PROD_API_BASE_URL`

Defaults are configured for current Havi production.
