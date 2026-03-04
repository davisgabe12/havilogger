Status: current
Last updated: March 3, 2026

# Havi Documentation Buckets

Documentation is grouped into three top-level buckets:

1. `docs/canonical/` for current source-of-truth docs.
2. `docs/active/` for in-progress plans and dated execution logs.
3. `docs/archive/` for historical docs that are not authoritative.

If a document does not clearly fit one bucket, treat that as a docs bug and fix placement in the same PR.

## Bucket Rules

1. `canonical` is the only bucket that should be used to answer "how does Havi work now?"
2. `active` may contain drafts, plans, and temporary rollout notes; it should reference canonical docs for behavior.
3. `archive` should never be cited as implementation truth.
4. Every new doc should start with a `Status:` header and absolute date.

## Fast Entry Points

1. Session bootstrap:
   - `docs/canonical/ops/havi-session-bootstrap.md`
2. Autonomous checklist:
   - `docs/canonical/ops/havi-autonomous-run-checklist.md`
3. Local runbook:
   - `docs/canonical/running-locally.md`
4. Deployment plan currently in progress:
   - `docs/active/plan/gethavi-domain-deployment-plan.md`
5. Production before/after smoke gate:
   - `docs/canonical/ops/production-core-smoke.md`
6. Session title behavior (canonical):
   - `docs/canonical/product/session-titles.md`

## Maintenance Rules

1. Behavior-changing PRs must update at least one canonical doc.
2. If a doc is stale and cannot be fixed immediately, move it to `docs/archive/`.
3. Keep one canonical source per topic; avoid parallel duplicates.
