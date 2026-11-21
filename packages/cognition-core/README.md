# @proj-airi/cognition-core

Shared cognition primitives copied from current Minecraft cognitive runtime seams.

## What It Does

- Provides a traced immutable event bus based on the Minecraft cognition implementation.
- Provides a queryable in-memory LLM log runtime based on the conscious brain log helper.
- Provides pure LLM helper functions for message construction, retry decisions, error classification, JSON extraction, and bounded sleeps.

## How To Use It

Import only the primitive you need:

```ts
import { createEventBus } from '@proj-airi/cognition-core/event-bus'
import { createLlmLogRuntime } from '@proj-airi/cognition-core/llm-log'
import { shouldRetryError } from '@proj-airi/cognition-core/llmlogic'
```

## When To Use It

Use this package when a consumer needs behavior already extracted from verified current seams and covered by package-level regression tests.

## When Not To Use It

Do not use this package for Minecraft-specific actions, prompts, YAML rules, perception detectors, AIRI bridge behavior, heartbeat or workspace runtime work, app-level companion behavior, or E2E-only fixtures.

## Phase A Boundary

Phase A treats `@proj-airi/minecraft-bot` as the reference source, not as an adopting consumer. This package is not a greenfield cognition runtime; it is only a home for primitives copied from current seams after package-level regression coverage exists.

Adopting this package from Minecraft, companion, web, desktop, or E2E surfaces must be planned as a separate feature.
