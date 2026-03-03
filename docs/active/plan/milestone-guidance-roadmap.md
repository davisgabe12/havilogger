# Milestone Guidance Roadmap (15 tasks)

Ordered to build a two-end foundation: data model → deterministic retrieval → prompt contract → safety layer → eval harness → UI affordances.

| Task # | Title | Why it matters (reliability/traceability) | Scope | Files likely touched | Data migrations needed | Acceptance criteria | Reversible? (how) | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Define milestone data model | Enables reliable age-normalized guidance and provenance | MVP | `apps/api/app/db.py`, new milestone data file | Yes (new table or JSON store) | Milestones are queryable by age band & domain | Drop table / remove file | None |
| 2 | Add age computation helper (months + adjusted age) | Ensures consistent age context across prompts | MVP | `apps/api/app/main.py`, new util | No | Helper returns age months; used in context builder | Revert helper use | 1 |
| 3 | Context Builder v1 (single entrypoint) | Deterministic retrieval & compact context packet | MVP | `apps/api/app/context_builders.py`, `main.py` | No | Function returns age, milestone band, memory IDs, payload | Revert to old calls | 1–2 |
| 4 | Milestone band resolver | Makes milestone selection deterministic | MVP | New module or `context_builders.py` | No | Band chosen from age even without memory | Remove band usage | 1–2 |
| 5 | Prompt contract template + versioning | Enables regression tracking and debugging | MVP | `apps/api/app/openai_client.py` | No | `prompt_version` constant exists and is logged | Remove version field | 3 |
| 6 | Trace object schema + storage | “Why this response” audit trail | MVP | `apps/api/app/db.py`, new trace helper | Yes (new table) | Trace saved with context sources + prompt_version | Drop trace table | 3–5 |
| 7 | Wire trace capture in `/api/v1/activities` | Observability for every answer | MVP | `apps/api/app/main.py` | No (uses new table) | Each response stores trace row | Disable trace insert | 6 |
| 8 | Add safety rules layer (pre/post prompt) | Consistent red-flag handling | MVP | `apps/api/app/main.py` or new `safety.py` | No | Red-flag detection applied before response | Revert to old guidance | 3 |
| 9 | Update prompt to require context citations | Traceability + transparency | MVP | `apps/api/app/openai_client.py` | No | Output references context packet IDs | Revert prompt change | 5 |
|10 | Add eval harness skeleton | Reliability checks for regressions | MVP | `evals/parenting_guidance` | No | Can run evaluation script (even stub) | Remove harness | 5 |
|11 | Add baseline eval set (15 convos) | Regression baseline with red flags | MVP | `evals/parenting_guidance/conversations.json` | No | Conversations with expected attributes | Remove evals | 10 |
|12 | Add deterministic context selection tests | Ensures consistent retrieval | MVP | new tests in `apps/api/tests` | No | Tests pass for context builder | Remove tests | 3 |
|13 | Add UI “Why this answer” block | Improves transparency | Later | `apps/web/src/app/page.tsx` | No | Shows memories/milestones used | Remove UI block | 6–7 |
|14 | Add confidence + escalation UI affordances | Safety clarity | Later | `apps/web/src/app/page.tsx` | No | Red-flag banner shown when triggered | Remove UI block | 8 |
|15 | Add eval CI hook | Prevents regressions | Later | CI config | No | Eval step runs on PRs | Disable CI step | 10–11 |

