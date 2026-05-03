import type {
  CognitiveLoopId,
  LoopHealthSnapshot,
  WorkspaceChunk,
  WorkspaceTickEvent,
} from '../../../../cognition-core/src/types'

import { createContext } from '@moeru/eventa'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { workspaceTickEvent } from '../../../../cognition-core/src/events'
import { createCognitionHeartbeat } from '../../../../cognition-core/src/heartbeat/scheduler'
import { createLoopRegistry } from '../../../../cognition-core/src/loops/registry'
import { createCognitiveWorkspace } from '../../../../cognition-core/src/workspace/workspace'

const DEFAULT_HISTORY_LIMIT = 25
const PROPOSAL_INTERVAL_MS = 400
const WINNER_TTL_MS = 1200

const DEMO_LOOP_IDS = {
  planner: 'loop:planner',
  memory: 'loop:memory',
  safety: 'loop:safety',
} as const satisfies Record<string, CognitiveLoopId>

type TimerHandle = ReturnType<typeof setInterval>

interface CognitionHeartbeatRuntime {
  dispose: () => void
  isRunning: () => boolean
}

function createRuntimeClock() {
  return {
    now: () => Date.now(),
    setInterval: (callback: () => void, intervalMs: number) => globalThis.setInterval(callback, intervalMs),
    clearInterval: (handle: unknown) => globalThis.clearInterval(handle as TimerHandle),
  }
}

function createRuntimeChunk(sequence: number, loopId: WorkspaceChunk['sourceLoop'], now: number): WorkspaceChunk {
  const degraded = sequence % 2 === 0

  return {
    id: `runtime-chunk:${sequence}`,
    sourceLoop: loopId,
    kind: degraded ? 'fallback' : 'thought',
    payload: {
      label: degraded ? 'Automatic fallback proposal under runtime load' : 'Automatic runtime proposal from the active cognition loop',
      preview: `runtime-${sequence}`,
    },
    createdAt: now,
    expiresAt: now + WINNER_TTL_MS,
  }
}

function createHeartbeatRuntime(onTick: (event: WorkspaceTickEvent) => void): CognitionHeartbeatRuntime {
  const clock = createRuntimeClock()
  const workspace = createCognitiveWorkspace({ clock })
  const loopRegistry = createLoopRegistry({ clock })
  const eventContext = createContext()
  const loopIds = Object.values(DEMO_LOOP_IDS)

  let proposalSequence = 0
  let proposalTimer: TimerHandle | undefined

  for (const loopId of loopIds) {
    loopRegistry.registerLoop(loopId)
    loopRegistry.markHeartbeat(loopId, clock.now())
  }

  eventContext.on(workspaceTickEvent, (event) => {
    if (event.body) {
      onTick(event.body)
    }
  })

  const heartbeat = createCognitionHeartbeat({
    workspace,
    loopRegistry,
    eventContext,
    clock,
  })

  function publishRuntimeProposal() {
    const now = clock.now()
    proposalSequence += 1

    const activeLoopId = loopIds[(proposalSequence - 1) % loopIds.length]

    for (const loopId of loopIds) {
      if (loopId === DEMO_LOOP_IDS.safety && proposalSequence % 3 === 0) {
        continue
      }

      loopRegistry.markHeartbeat(loopId, now)
    }

    workspace.propose(createRuntimeChunk(proposalSequence, activeLoopId, now))
  }

  publishRuntimeProposal()
  heartbeat.start()
  proposalTimer = globalThis.setInterval(publishRuntimeProposal, PROPOSAL_INTERVAL_MS)

  return {
    dispose() {
      heartbeat.stop()
      if (proposalTimer) {
        globalThis.clearInterval(proposalTimer)
        proposalTimer = undefined
      }
    },
    isRunning() {
      return heartbeat.isRunning()
    },
  }
}

/**
 * Counts loop-health states from the latest cognition heartbeat.
 *
 * Use when:
 * - Rendering loop-health totals in devtools
 * - Highlighting degraded, stale, or failed loops quickly
 *
 * Expects:
 * - Counts are derived from one heartbeat event snapshot
 *
 * Returns:
 * - A stable per-status count map for the latest tick
 */
export interface CognitionLoopHealthCounts {
  healthy: number
  degraded: number
  inactive: number
  failed: number
  stale: number
}

function createEmptyLoopHealthCounts(): CognitionLoopHealthCounts {
  return {
    healthy: 0,
    degraded: 0,
    inactive: 0,
    failed: 0,
    stale: 0,
  }
}

function summarizeLoopHealth(loopHealth: LoopHealthSnapshot[]) {
  const counts = createEmptyLoopHealthCounts()

  for (const entry of loopHealth) {
    counts[entry.status] += 1
  }

  return counts
}

function trimHistory(history: WorkspaceTickEvent[], limit: number) {
  return history.slice(0, limit)
}

/**
 * Stores the latest cognition heartbeat diagnostics for shared devtools pages.
 *
 * Use when:
 * - A runtime publishes workspace heartbeat events into shared UI state
 * - Devtools pages need the latest winner, loop health, and backpressure details
 *
 * Expects:
 * - Call `ingestTick(...)` whenever a new heartbeat event arrives
 * - History is newest-first and bounded by `maxHistory`
 *
 * Returns:
 * - Shared reactive state for cognition heartbeat diagnostics
 */
export const useCognitionHeartbeatStore = defineStore('devtools:cognition-heartbeat', () => {
  const latestTick = ref<WorkspaceTickEvent>()
  const history = ref<WorkspaceTickEvent[]>([])
  const lastUpdatedAt = ref<number>()
  const maxHistory = ref(DEFAULT_HISTORY_LIMIT)
  const runtimeActive = ref(false)

  let runtime: CognitionHeartbeatRuntime | undefined

  const hasTick = computed(() => Boolean(latestTick.value))
  const currentWinner = computed<WorkspaceChunk | null>(() => latestTick.value?.winner.chunk ?? null)
  const latestLoopHealth = computed(() => latestTick.value?.loopHealth ?? [])
  const loopHealthCounts = computed(() => summarizeLoopHealth(latestLoopHealth.value))
  const degradedTickCount = computed(() => history.value.filter((event: WorkspaceTickEvent) => event.backpressure.degraded).length)
  const reusedWinnerCount = computed(() => history.value.filter((event: WorkspaceTickEvent) => event.backpressure.reusedPreviousWinner).length)

  function ingestTick(event: WorkspaceTickEvent) {
    latestTick.value = event
    lastUpdatedAt.value = Date.now()
    history.value = trimHistory([event, ...history.value], maxHistory.value)
    return event
  }

  function setMaxHistory(limit: number) {
    maxHistory.value = Math.max(1, Math.trunc(limit))
    history.value = trimHistory(history.value, maxHistory.value)
  }

  function clear() {
    latestTick.value = undefined
    history.value = []
    lastUpdatedAt.value = undefined
  }

  function initializeRuntime() {
    if (runtime?.isRunning()) {
      runtimeActive.value = true
      return
    }

    runtime = createHeartbeatRuntime(ingestTick)
    runtimeActive.value = runtime.isRunning()
  }

  function disposeRuntime() {
    runtime?.dispose()
    runtime = undefined
    runtimeActive.value = false
  }

  return {
    latestTick,
    history,
    lastUpdatedAt,
    maxHistory,
    runtimeActive,
    hasTick,
    currentWinner,
    latestLoopHealth,
    loopHealthCounts,
    degradedTickCount,
    reusedWinnerCount,
    ingestTick,
    setMaxHistory,
    clear,
    initializeRuntime,
    disposeRuntime,
  }
})
