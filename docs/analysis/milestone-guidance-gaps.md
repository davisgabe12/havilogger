# Milestone Guidance Gap Analysis

## Strengths (current state)
- **Structured memory store exists:** `knowledge_items` and `inferences` capture explicit and inferred knowledge for personalization.
- **Prompt injection of child context:** `generate_actions` includes a system context message derived from `build_child_context`.
- **Basic stage guidance:** `stage_guidance` provides week-based tips and guidance for “hitting” behaviors.
- **Symptom guardrails:** `symptom_guidance` provides basic red-flag messaging for cough/fever/vomit/rash.
- **Conversation context trimming:** `build_message_context` provides budgeted history for the model.

## Gaps by category

### 1) Data model gaps
1. **No milestone catalog or taxonomy.**
   - Impact: Guidance is limited to hard-coded tips and memory tags; cannot trace or evolve milestones.
   - Likelihood: High.
   - Simplest fix: Add a `milestones` table (id, age_band, domain, description, source) or static JSON store with versioning.
2. **Child profile lacks normalized age bands or adjusted age.**
   - Impact: Guidance relies on week count only; months/adjusted age is not consistently represented.
   - Likelihood: High.
   - Simplest fix: Add computed fields in a Context Builder (age_months, adjusted_age_months).
3. **No symptom/behavior taxonomy.**
   - Impact: Red-flag detection is limited to keyword lists; cannot map to evidence-based flags.
   - Likelihood: Medium.
   - Simplest fix: Create a minimal taxonomy map (behavior/symptom → red flags + safe steps) in a static JSON file.

### 2) Retrieval gaps
1. **No deterministic context packet.**
   - Impact: Context retrieval is implicit (knowledge items + context messages), making responses inconsistent and hard to audit.
   - Likelihood: High.
   - Simplest fix: Single Context Builder that returns structured context + provenance.
2. **Milestone context depends on memory, not age.**
   - Impact: If no `child_milestone_profile` memory exists, milestone guidance misses the child’s stage.
   - Likelihood: High.
   - Simplest fix: Derive milestone band from age, and use it when memory is missing.

### 3) Prompting gaps
1. **No prompt contract versioning.**
   - Impact: Hard to regress, compare, or trace changes.
   - Likelihood: High.
   - Simplest fix: Add a `prompt_version` constant and store it with trace output.
2. **No explicit requirement to cite internal context.**
   - Impact: Hard to verify why a specific memory or stage was used.
   - Likelihood: Medium.
   - Simplest fix: Add “cite context packet ids” requirement in the prompt contract.

### 4) Safety gaps
1. **Red-flag logic is shallow.**
   - Impact: Some serious symptoms might be missed; no escalation routing.
   - Likelihood: Medium.
   - Simplest fix: Add a “safety layer” that detects red flags before prompt generation and injects a care-seeking footer.
2. **No clear uncertainty behavior.**
   - Impact: Model may provide confident guidance without age context.
   - Likelihood: Medium.
   - Simplest fix: Require “ask for DOB / age” if absent, and fallback to general guidance.

### 5) Reliability gaps
1. **No deterministic tests for guidance.**
   - Impact: Behavior may regress silently when prompt or logic changes.
   - Likelihood: High.
   - Simplest fix: Add eval conversations + simple scoring harness.
2. **No regression harness for prompt output.**
   - Impact: Hard to compare outputs across prompt versions.
   - Likelihood: Medium.
   - Simplest fix: Add snapshot-based evals for structured attributes (age usage, red flags, next steps).

### 6) Traceability gaps
1. **No persisted “why” trace object.**
   - Impact: Cannot audit which memories/milestones influenced a response.
   - Likelihood: High.
   - Simplest fix: Persist a trace record per response with memory IDs, milestone IDs, prompt version.
2. **No context source metadata in responses.**
   - Impact: UI cannot display “Why did I get this?”
   - Likelihood: Medium.
   - Simplest fix: Add `context_sources_used` metadata in response and store it server-side.

### 7) UX gaps
1. **No UI indication of confidence or escalation.**
   - Impact: Parents may not know when to seek care.
   - Likelihood: Medium.
   - Simplest fix: Add a visible “when to seek care” section when red flags trigger.
2. **No transparency for memory usage.**
   - Impact: Parents can’t see what prior info is shaping advice.
   - Likelihood: Medium.
   - Simplest fix: UI badge listing memories used with opt-out.

