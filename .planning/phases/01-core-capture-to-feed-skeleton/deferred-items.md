# Deferred Items — Phase 01

Out-of-scope discoveries logged during plan execution (not fixed, per executor scope boundary rules).

## 01-05

- **`npm run lint` reports 3 errors in stale worktree copies** (`.claude/worktrees/agent-*/tests/e2e/fixtures.ts:13` — `react-hooks/rules-of-hooks` on a `context` function using `use`). These are leftover parallel-execution worktree directories under `.claude/worktrees/`, not the working tree this plan modified. Verified the 4 files this plan actually changed (`PermissionGate.tsx`, `CameraCapture.tsx`, `CategoryPicker.tsx`, `tests/e2e/capture.spec.ts`) lint clean in isolation via `npx eslint <files>`. Not fixed — unrelated to this task's scope; likely cleanup candidate for whoever owns worktree lifecycle management.
