Status: current
Last updated: March 12, 2026

# Havi Session Orchestrator Skill Spec

## Summary

Create a deterministic session bootstrap orchestrator that starts every feature slice in an isolated worktree and scaffolds an active spec when missing.

## Goals

1. Keep `main` clean and releasable.
2. Remove session startup variance for branch/worktree/spec setup.
3. Reduce context loss by ensuring a spec exists before code edits.

## Non-Goals

1. Automatic deploy/release execution.
2. Replacing feature-specific implementation/testing skills.

## Requirements

### MVP

1. Accept a feature name and create/reuse a dedicated worktree.
2. Default branch naming: `codex/<feature-slug>`.
3. Default worktree root outside repo: `/Users/gabedavis/Desktop/projects/havi-worktrees`.
4. Scaffold active spec file if missing from template.
5. Print explicit next commands for handoff.

### Later

1. Optional Linear ticket bootstrap from feature name.
2. Optional environment/session seed setup.

## Proposed Solution

1. Repo script: `scripts/havi_session_orchestrator.sh`.
2. Skill wrapper: `/Users/gabedavis/.codex/skills/havi-session-orchestrator`.
3. Integrate with canonical bootstrap guidance and project profile.

## Acceptance Criteria

1. Running orchestrator with `--feature` produces a ready worktree path and branch.
2. If spec is absent, orchestrator creates `docs/active/specs/<slug>-spec.md`.
3. Script supports `--dry-run` for safe validation.

## Test Plan

1. `bash -n scripts/havi_session_orchestrator.sh`
2. `./scripts/havi_session_orchestrator.sh --feature \"orchestrator-smoke\" --dry-run`
3. Verify output includes branch, worktree, and spec paths.

## Progress Updates

- March 12, 2026: Implemented `scripts/havi_session_orchestrator.sh` and skill wrapper under `~/.codex/skills/havi-session-orchestrator`.
