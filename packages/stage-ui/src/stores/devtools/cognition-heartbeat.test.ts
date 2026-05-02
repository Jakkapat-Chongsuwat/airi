import type { WorkspaceTickEvent } from '../../../../cognition-core/src/types'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useCognitionHeartbeatStore } from './cognition-heartbeat'

function createTickEvent(overrides: Partial<WorkspaceTickEvent> = {}): WorkspaceTickEvent {
  const sequence = overrides.sequence ?? 1

  return {
    tickId: overrides.tickId ?? `cognition-tick:${sequence}`,
    sequence,
    scheduledAt: overrides.scheduledAt ?? 1000 + sequence,
    emittedAt: overrides.emittedAt ?? 1100 + sequence,
    intervalMs: overrides.intervalMs ?? 1000,
    processingBudgetMs: overrides.processingBudgetMs ?? 16,
    winner: overrides.winner ?? {
      chunk: {
        id: `chunk-${sequence}`,
        sourceLoop: 'planner',
        kind: 'thought',
        payload: { text: `winner-${sequence}` },
        createdAt: 900 + sequence,
      },
      selectedAt: 1050 + sequence,
      selectionReason: 'first-valid-proposal',
    },
    workspaceStatus: overrides.workspaceStatus ?? 'active',
    backpressure: overrides.backpressure ?? {
      degraded: false,
      count: 0,
      processingDurationMs: 8,
      reusedPreviousWinner: false,
      reason: 'none',
    },
    loopHealth: overrides.loopHealth ?? [
      {
        loopId: 'planner',
        status: 'healthy',
        registeredAt: 100,
        lastHeartbeatAt: 1000,
      },
      {
        loopId: 'memory',
        status: 'degraded',
        registeredAt: 100,
        lastHeartbeatAt: 995,
      },
    ],
  }
}

describe('useCognitionHeartbeatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('tracks the latest tick and loop summary counts', () => {
    const store = useCognitionHeartbeatStore()
    const tick = createTickEvent()

    store.ingestTick(tick)

    expect(store.latestTick?.tickId).toBe('cognition-tick:1')
    expect(store.currentWinner?.id).toBe('chunk-1')
    expect(store.loopHealthCounts.healthy).toBe(1)
    expect(store.loopHealthCounts.degraded).toBe(1)
    expect(store.loopHealthCounts.failed).toBe(0)
    expect(store.degradedTickCount).toBe(0)
    expect(store.hasTick).toBe(true)
  })

  it('keeps bounded newest-first history and degraded counters', () => {
    const store = useCognitionHeartbeatStore()

    store.setMaxHistory(2)
    store.ingestTick(createTickEvent({ sequence: 1 }))
    store.ingestTick(createTickEvent({
      sequence: 2,
      workspaceStatus: 'degraded',
      backpressure: {
        degraded: true,
        count: 1,
        processingDurationMs: 24,
        reusedPreviousWinner: true,
        reason: 'processing-budget-exceeded',
      },
    }))
    store.ingestTick(createTickEvent({
      sequence: 3,
      winner: {
        chunk: null,
        selectedAt: 1053,
        selectionReason: 'empty-workspace',
      },
      workspaceStatus: 'idle',
    }))

    expect(store.history.map((event: WorkspaceTickEvent) => event.sequence)).toEqual([3, 2])
    expect(store.degradedTickCount).toBe(1)
    expect(store.reusedWinnerCount).toBe(1)
    expect(store.currentWinner).toBeNull()
  })

  it('toggles runtime status through initializeRuntime and disposeRuntime', () => {
    const store = useCognitionHeartbeatStore()

    store.initializeRuntime()

    expect(store.runtimeActive).toBe(true)

    store.disposeRuntime()

    expect(store.runtimeActive).toBe(false)
  })
})
