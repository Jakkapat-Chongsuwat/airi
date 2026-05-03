import type { LoopRegistry } from '../loops/registry'
import type { BackpressureReason, WorkspaceStatus, WorkspaceTickEvent } from '../types'
import type { CognitiveWorkspace } from '../workspace/workspace'

import { HEARTBEAT_INTERVAL_MS, PROCESSING_BUDGET_MS } from '../constants'
import { workspaceTickEvent } from '../events'

export interface HeartbeatClock {
  now: () => number
  setInterval: (callback: () => void, intervalMs: number) => unknown
  clearInterval: (handle: unknown) => void
}

export interface CognitionHeartbeatOptions {
  workspace: CognitiveWorkspace
  loopRegistry: LoopRegistry
  eventContext: WorkspaceTickPublisher
  clock: HeartbeatClock
  intervalMs?: number
  processingBudgetMs?: number
}

export interface WorkspaceTickPublisher {
  emit: (event: typeof workspaceTickEvent, payload: WorkspaceTickEvent) => void
}

/**
 * Shared heartbeat runtime used by the Phase A cognition slice.
 *
 * Use when:
 * - A shared runtime needs deterministic cognition ticks and safe winner reuse
 * - Tests need to inspect the latest emitted heartbeat event
 *
 * Expects:
 * - The workspace and loop registry use the same clock domain
 *
 * Returns:
 * - A startable scheduler that emits typed heartbeat events
 */
export interface CognitionHeartbeat {
  start: () => void
  stop: () => void
  tick: () => WorkspaceTickEvent
  isRunning: () => boolean
  getLatestEvent: () => WorkspaceTickEvent | null
}

function createTickId(sequence: number) {
  return `cognition-tick:${sequence}`
}

function resolveWorkspaceStatus(hasWinner: boolean, degraded: boolean): WorkspaceStatus {
  if (degraded) {
    return 'degraded'
  }

  if (hasWinner) {
    return 'active'
  }

  return 'idle'
}

/**
 * Creates the cognition heartbeat scheduler.
 *
 * Use when:
 * - The shared cognition core needs timed workspace publication
 * - A deterministic test needs direct control over tick cadence
 *
 * Expects:
 * - `clock` is monotonic within the scope of one runtime instance
 * - `workspace.publishWinner` stores the final emitted winner
 *
 * Returns:
 * - A scheduler that emits `workspaceTickEvent` and preserves the latest safe state
 *
 * Call stack:
 *
 * createCognitionHeartbeat
 *   -> tick
 *     -> workspace.selectWinner
 *     -> loopRegistry.snapshot
 *     -> eventContext.emit
 */
export function createCognitionHeartbeat(options: CognitionHeartbeatOptions): CognitionHeartbeat {
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS
  const processingBudgetMs = options.processingBudgetMs ?? PROCESSING_BUDGET_MS

  let sequence = 0
  let backpressureCount = 0
  let latestEvent: WorkspaceTickEvent | null = null
  let handle: unknown | null = null

  function emitTick() {
    sequence += 1

    const scheduledAt = options.clock.now()
    const snapshotBefore = options.workspace.snapshot(scheduledAt)
    const selectedWinner = options.workspace.selectWinner(scheduledAt)
    const loopHealth = options.loopRegistry.snapshot(options.clock.now())
    const processingDurationMs = options.clock.now() - scheduledAt

    let reusedPreviousWinner = false
    let finalWinner = selectedWinner
    let reason: BackpressureReason = 'none'

    if (processingDurationMs >= processingBudgetMs) {
      backpressureCount += 1
      reason = 'processing-budget-exceeded'

      if (snapshotBefore.lastWinner?.chunk) {
        reusedPreviousWinner = true
        finalWinner = {
          chunk: snapshotBefore.lastWinner.chunk,
          selectedAt: options.clock.now(),
          selectionReason: 'previous-valid-winner',
        }
      }
    }

    if (!finalWinner.chunk && snapshotBefore.chunkCount === 0 && reason === 'none') {
      reason = 'missing-valid-winner'
    }

    options.workspace.publishWinner(finalWinner)

    const emittedAt = options.clock.now()
    const event: WorkspaceTickEvent = {
      tickId: createTickId(sequence),
      sequence,
      scheduledAt,
      emittedAt,
      intervalMs,
      processingBudgetMs,
      winner: finalWinner,
      workspaceStatus: resolveWorkspaceStatus(Boolean(finalWinner.chunk), processingDurationMs >= processingBudgetMs),
      backpressure: {
        degraded: processingDurationMs >= processingBudgetMs,
        count: backpressureCount,
        processingDurationMs,
        reusedPreviousWinner,
        reason,
      },
      loopHealth,
    }

    latestEvent = event
    options.eventContext.emit(workspaceTickEvent, event)

    return event
  }

  return {
    start() {
      if (handle) {
        return
      }

      handle = options.clock.setInterval(() => {
        emitTick()
      }, intervalMs)
    },

    stop() {
      if (!handle) {
        return
      }

      options.clock.clearInterval(handle)
      handle = null
    },

    tick() {
      return emitTick()
    },

    isRunning() {
      return handle != null
    },

    getLatestEvent() {
      return latestEvent
    },
  }
}
