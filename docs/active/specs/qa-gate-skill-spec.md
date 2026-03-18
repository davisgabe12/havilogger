Status: current
Last updated: March 18, 2026

# Havi QA Gate Skill Spec

## Summary

Create a dedicated QA gate skill that stress-checks newly shipped feature slices before release and produces consistent, decision-ready evidence.

## Goals

1. Catch user-facing regressions before production release.
2. Standardize QA execution across Codex sessions.
3. Make release decisions binary: pass with evidence, or fail with actionable defects.

## Non-Goals

1. Replace targeted unit/integration tests owned by the feature slice.
2. Replace product sign-off for copy or strategy decisions.
3. Run full exploratory testing across unrelated product surfaces.

## Requirements

### MVP

1. Accept required inputs:
   - feature label
   - changed areas (`chat`, `timeline`, `tasks`, `auth`, `onboarding`)
   - deploy scope (`api`, `web`, `both`, `none`)
2. Run targeted deterministic checks:
   - touched test suites
   - seeded GREEN smoke (`./scripts/e2e_green.sh`)
   - Playwright user flow for the new feature path
3. Run production release gate when deploy scope is not `none`:
   - `./scripts/prod_release_gate.sh` with before/after labels
4. Emit a single PASS/FAIL report with:
   - failing step
   - expected vs actual
   - likely root cause
   - recommended fix
5. Write curated artifacts under one release bundle path in `docs/active/green-proof/releases/`.

### Later

1. Automatic flaky-test retry policy with bounded attempts.
2. Risk-based test expansion (extra suites for high-risk schema/auth changes).
3. Automatic issue filing when QA gate fails.

## Proposed Solution

1. New skill: `havi-qa-gate`.
2. Thin orchestrator script in repo (`scripts/qa_gate.sh`) called by the skill.
3. Input contract maps feature metadata to exact checks.
4. Output contract is a compact markdown + JSON artifact with go/no-go result.

## Alternatives Considered

1. Keep manual QA commands only.
- Rejected: too inconsistent between sessions and easy to skip.
2. Rely only on unit tests.
- Rejected: misses critical integration and real user-flow regressions.

## Risks And Mitigations

1. Longer pre-release cycle time.
- Mitigation: keep deterministic default path; expand only when risk warrants it.
2. False confidence from passing scripted checks.
- Mitigation: include targeted Playwright flow for each changed surface and require explicit risk notes.

## Success Metrics

1. Lower share of post-release regressions tied to changed surfaces.
2. 100% of release slices include one QA gate artifact with pass/fail decision.
3. Faster triage when failures occur due to standardized failure reports.

## Rollout Plan

1. Pilot on chat/runtime slices first.
2. Expand to all user-facing feature slices after two successful release cycles.
3. Add to canonical autonomous checklist once pilot proves stable.

## Test Plan

1. Dry run skill on a no-op slice to validate reporting format.
2. Run against one known failing scenario and verify failure diagnosis quality.
3. Run against one stable slice and verify pass artifact + release proof wiring.

## Progress Updates

- March 12, 2026: Implemented repo orchestrator script at `scripts/qa_gate.sh`.
- March 12, 2026: Added skill wrapper under `~/.codex/skills/havi-qa-gate`.
- March 12, 2026: Implemented required output artifacts (`qa-gate-summary.json`, `README.md`, step logs) and fail-on-required-step behavior.
- March 18, 2026: Added required `mobile_playwright` step for `--deploy-scope web|both` with default command `npm run test:green:mobile-nav`.
- March 18, 2026: Added worktree-safe repo-root detection in `scripts/qa_gate.sh` and in skill wrapper (`~/.codex/skills/havi-qa-gate/scripts/run.sh`).
