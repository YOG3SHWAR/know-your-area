---
schema_version: 1
open_count: 4
waived_count: 0
fixed_count: 0
total_count: 4
last_updated: 2026-07-23T07:21:35.032Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | skipped-test | tests/e2e/capture.spec.ts | 7 | capture flow SUBM-01/SUBM-03 e2e spec is test.fixme() -- replaced with real assertions in Plan 03 | open |  | 2026-07-23T07:21:34.715Z |  |
| 2 | 01 | skipped-test | tests/e2e/feed.spec.ts | 6 | feed page FEED-01 e2e spec is test.fixme() -- replaced with real assertions in Plan 04 | open |  | 2026-07-23T07:21:34.820Z |  |
| 3 | 01 | skipped-test | tests/e2e/search.spec.ts | 6 | search-by-ID FEED-03 e2e spec is test.fixme() -- replaced with real assertions in Plan 04 | open |  | 2026-07-23T07:21:34.929Z |  |
| 4 | 01 | skipped-test | tests/e2e/permalink.spec.ts | 5 | permalink page FEED-04 e2e spec is test.fixme() -- replaced with real assertions in Plan 04 | open |  | 2026-07-23T07:21:35.032Z |  |

````json
[
  {
    "id": 1,
    "kind": "skipped-test",
    "phase": "01",
    "file": "tests/e2e/capture.spec.ts",
    "line": 7,
    "description": "capture flow SUBM-01/SUBM-03 e2e spec is test.fixme() -- replaced with real assertions in Plan 03",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-23T07:21:34.715Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "skipped-test",
    "phase": "01",
    "file": "tests/e2e/feed.spec.ts",
    "line": 6,
    "description": "feed page FEED-01 e2e spec is test.fixme() -- replaced with real assertions in Plan 04",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-23T07:21:34.820Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "skipped-test",
    "phase": "01",
    "file": "tests/e2e/search.spec.ts",
    "line": 6,
    "description": "search-by-ID FEED-03 e2e spec is test.fixme() -- replaced with real assertions in Plan 04",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-23T07:21:34.929Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "skipped-test",
    "phase": "01",
    "file": "tests/e2e/permalink.spec.ts",
    "line": 5,
    "description": "permalink page FEED-04 e2e spec is test.fixme() -- replaced with real assertions in Plan 04",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-23T07:21:35.032Z",
    "resolved_at": null
  }
]
````
