import type { CognitiveLoopId, LoopHealthSnapshot, LoopHealthStatus } from '../types'

import { LOOP_STALE_AFTER_MS } from '../constants'

export interface LoopRegistryClock {
  now: () => number
}

export interface LoopRegistryOptions {
  clock?: LoopRegistryClock
  staleAfterMs?: number
}

interface LoopRegistration {
  loopId: CognitiveLoopId
  registeredAt: number
  lastHeartbeatAt?: number
  lastError?: string
  status: Exclude<LoopHealthStatus, 'stale'>
}

/**
 * Shared loop registry used by the cognition heartbeat scheduler.
 *
 * Use when:
 * - Registering cognition loops that should appear in diagnostics snapshots
 * - Tracking heartbeat, degraded, inactive, and failed loop transitions
 *
 * Expects:
 * - Loop ids are stable per runtime process
 *
 * Returns:
 * - A registry API that derives loop-health snapshots
 */
export interface LoopRegistry {
  registerLoop: (loopId: CognitiveLoopId) => void
  markHeartbeat: (loopId: CognitiveLoopId, at?: number) => void
  markDegraded: (loopId: CognitiveLoopId) => void
  markInactive: (loopId: CognitiveLoopId) => void
  markFailed: (loopId: CognitiveLoopId, error: string) => void
  snapshot: (now?: number) => LoopHealthSnapshot[]
}

function resolveNow(clock?: LoopRegistryClock) {
  return clock?.now() ?? Date.now()
}

function deriveStatus(entry: LoopRegistration, now: number, staleAfterMs: number): LoopHealthStatus {
  if (entry.status !== 'healthy') {
    return entry.status
  }

  if (entry.lastHeartbeatAt == null) {
    return 'inactive'
  }

  if ((now - entry.lastHeartbeatAt) >= staleAfterMs) {
    return 'stale'
  }

  return 'healthy'
}

/**
 * Creates the loop registry for the cognition heartbeat slice.
 *
 * Use when:
 * - The scheduler needs loop-health snapshots on every tick
 * - Tests need deterministic loop liveness and duplicate registration behavior
 *
 * Expects:
 * - All loop timestamps use the same clock as the scheduler
 *
 * Returns:
 * - A loop registry with deterministic snapshot ordering
 */
export function createLoopRegistry(options: LoopRegistryOptions = {}): LoopRegistry {
  const staleAfterMs = options.staleAfterMs ?? LOOP_STALE_AFTER_MS
  const registrations = new Map<CognitiveLoopId, LoopRegistration>()

  function ensureRegistration(loopId: CognitiveLoopId) {
    const existing = registrations.get(loopId)

    if (existing) {
      return existing
    }

    const registration: LoopRegistration = {
      loopId,
      registeredAt: resolveNow(options.clock),
      status: 'inactive',
    }

    registrations.set(loopId, registration)
    return registration
  }

  return {
    registerLoop(loopId) {
      ensureRegistration(loopId)
    },

    markHeartbeat(loopId, at) {
      const registration = ensureRegistration(loopId)

      registration.lastHeartbeatAt = at ?? resolveNow(options.clock)
      registration.status = 'healthy'
    },

    markDegraded(loopId) {
      const registration = ensureRegistration(loopId)
      registration.status = 'degraded'
    },

    markInactive(loopId) {
      const registration = ensureRegistration(loopId)
      registration.status = 'inactive'
    },

    markFailed(loopId, error) {
      const registration = ensureRegistration(loopId)
      registration.status = 'failed'
      registration.lastError = error
    },

    snapshot(now) {
      const resolvedNow = now ?? resolveNow(options.clock)

      return [...registrations.values()]
        .sort((left, right) => left.loopId.localeCompare(right.loopId))
        .map((entry): LoopHealthSnapshot => ({
          loopId: entry.loopId,
          registeredAt: entry.registeredAt,
          lastHeartbeatAt: entry.lastHeartbeatAt,
          lastError: entry.lastError,
          status: deriveStatus(entry, resolvedNow, staleAfterMs),
        }))
    },
  }
}
