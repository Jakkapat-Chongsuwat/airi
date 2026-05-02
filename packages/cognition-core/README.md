# @proj-airi/cognition-core

Shared cognition runtime for Project AIRI's Phase A heartbeat and bounded workspace slice.

## What It Does

- Emits typed heartbeat events through `@moeru/eventa`.
- Maintains a bounded 1-4 chunk workspace.
- Reuses the last valid broadcast winner during backpressure when possible.
- Tracks loop health without importing app-local state, providers, or voice logic.

## Use When

- A shared web and desktop surface needs the same cognition heartbeat contract.
- You need deterministic unit tests around heartbeat cadence and bounded workspace state.

## Do Not Use When

- The feature needs model calls, memory writes, or voice-side effects.
- The state should live in an app-local store instead of a shared package.

## Validation

Run the focused package suite from the AIRI repo root:

```bash
pnpm exec vitest run packages/cognition-core/src/heartbeat/scheduler.test.ts packages/cognition-core/src/workspace/workspace.test.ts packages/cognition-core/src/tournament/placeholder.test.ts packages/cognition-core/src/loops/registry.test.ts packages/cognition-core/src/integration/workspace-events.integration.test.ts
pnpm -F @proj-airi/cognition-core typecheck
```
