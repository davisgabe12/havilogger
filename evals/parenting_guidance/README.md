# Parenting Guidance Evals

This folder contains a lightweight evaluation set for milestone-guidance responses.

## Files
- `conversations.json` – 15 conversation scenarios with expected attributes for automated scoring.

## How to run (stub)
There is no eval harness wired up yet. When added, the intended usage is:

```bash
python -m evals.parenting_guidance.run \
  --input evals/parenting_guidance/conversations.json \
  --output evals/parenting_guidance/results.json
```

## Scoring targets
Each conversation includes `expected_attributes` for booleans such as:
- `uses_age_context`
- `gives_next_steps`
- `flags_red_flags`
- `cites_internal_context`
- `suggests_alternatives`

Use `disallowed` to fail if unsafe behavior appears.

