<script setup lang="ts">
import type { CognitionLoopHealthCounts } from '@proj-airi/stage-ui/stores/devtools/cognition-heartbeat'

import type { WorkspaceTickEvent } from '../../../../cognition-core/src/types'

import { useCognitionHeartbeatStore } from '@proj-airi/stage-ui/stores/devtools/cognition-heartbeat'
import { Button, Callout } from '@proj-airi/ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const store = useCognitionHeartbeatStore()
const sampleSequence = ref(store.latestTick?.sequence ?? 0)

onMounted(() => {
  store.initializeRuntime()
})

onUnmounted(() => {
  store.disposeRuntime()
})

const summaryCards = computed(() => {
  if (!store.latestTick) {
    return []
  }

  return [
    ['Latest sequence', String(store.latestTick.sequence)],
    ['Workspace status', store.latestTick.workspaceStatus],
    ['Processing duration', `${store.latestTick.backpressure.processingDurationMs}ms`],
    ['Updated at', formatTime(store.lastUpdatedAt)],
  ]
})

const currentWorkspaceStatus = computed(() => store.latestTick?.workspaceStatus ?? 'idle')
const currentWorkspaceStatusChipClasses = computed(() => statusChipClasses(currentWorkspaceStatus.value))

const winnerEntries = computed(() => {
  if (!store.currentWinner) {
    return []
  }

  return [
    ['Chunk id', store.currentWinner.id],
    ['Source loop', store.currentWinner.sourceLoop],
    ['Kind', store.currentWinner.kind],
    ['Created at', formatTime(store.currentWinner.createdAt)],
  ]
})

const loopHealthSummary = computed<Array<{ label: keyof CognitionLoopHealthCounts, count: number }>>(() => {
  return [
    { label: 'healthy', count: store.loopHealthCounts.healthy },
    { label: 'degraded', count: store.loopHealthCounts.degraded },
    { label: 'inactive', count: store.loopHealthCounts.inactive },
    { label: 'failed', count: store.loopHealthCounts.failed },
    { label: 'stale', count: store.loopHealthCounts.stale },
  ]
})

const recentHistory = computed(() => store.history.slice(0, 5))
const latestEventJson = computed(() => {
  if (!store.latestTick) {
    return ''
  }

  return JSON.stringify(store.latestTick, null, 2)
})

function formatTime(value?: number) {
  if (!value) {
    return 'n/a'
  }

  return new Date(value).toLocaleTimeString()
}

function statusChipClasses(status: WorkspaceTickEvent['workspaceStatus']) {
  if (status === 'active') {
    return [
      'border-emerald-300',
      'bg-emerald-100',
      'text-emerald-700',
      'dark:border-emerald-700',
      'dark:bg-emerald-900/50',
      'dark:text-emerald-200',
    ]
  }

  if (status === 'degraded') {
    return [
      'border-amber-300',
      'bg-amber-100',
      'text-amber-700',
      'dark:border-amber-700',
      'dark:bg-amber-900/50',
      'dark:text-amber-200',
    ]
  }

  return [
    'border-neutral-300',
    'bg-neutral-100',
    'text-neutral-700',
    'dark:border-neutral-700',
    'dark:bg-neutral-900/60',
    'dark:text-neutral-200',
  ]
}

function loopCountChipClasses(label: keyof CognitionLoopHealthCounts) {
  if (label === 'healthy') {
    return [
      'border-emerald-300',
      'bg-emerald-100',
      'text-emerald-700',
      'dark:border-emerald-700',
      'dark:bg-emerald-900/50',
      'dark:text-emerald-200',
    ]
  }

  if (label === 'degraded') {
    return [
      'border-amber-300',
      'bg-amber-100',
      'text-amber-700',
      'dark:border-amber-700',
      'dark:bg-amber-900/50',
      'dark:text-amber-200',
    ]
  }

  if (label === 'failed') {
    return [
      'border-red-300',
      'bg-red-100',
      'text-red-700',
      'dark:border-red-700',
      'dark:bg-red-900/50',
      'dark:text-red-200',
    ]
  }

  return [
    'border-neutral-300',
    'bg-neutral-100',
    'text-neutral-700',
    'dark:border-neutral-700',
    'dark:bg-neutral-900/60',
    'dark:text-neutral-200',
  ]
}

function loopStatusClasses(status: WorkspaceTickEvent['loopHealth'][number]['status']) {
  if (status === 'healthy') {
    return loopCountChipClasses('healthy')
  }

  if (status === 'degraded') {
    return loopCountChipClasses('degraded')
  }

  if (status === 'failed') {
    return loopCountChipClasses('failed')
  }

  return loopCountChipClasses('inactive')
}

function createSampleTick(sequence: number): WorkspaceTickEvent {
  const now = Date.now()
  const degraded = sequence % 2 === 0
  const hasWinner = sequence % 3 !== 0

  return {
    tickId: `cognition-tick:${sequence}`,
    sequence,
    scheduledAt: now - 12,
    emittedAt: now,
    intervalMs: 1000,
    processingBudgetMs: 16,
    winner: {
      chunk: hasWinner
        ? {
            id: `demo-chunk-${sequence}`,
            sourceLoop: degraded ? 'memory' : 'planner',
            kind: degraded ? 'fallback' : 'thought',
            payload: {
              label: degraded ? 'Reused winner during slow tick' : 'Fresh winner from the active loop',
              preview: `sample-${sequence}`,
            },
            createdAt: now - 80,
          }
        : null,
      selectedAt: now - 2,
      selectionReason: hasWinner
        ? (degraded ? 'previous-valid-winner' : 'first-valid-proposal')
        : 'empty-workspace',
    },
    workspaceStatus: degraded ? 'degraded' : hasWinner ? 'active' : 'idle',
    backpressure: {
      degraded,
      count: degraded ? 1 : 0,
      processingDurationMs: degraded ? 24 : 8,
      reusedPreviousWinner: degraded,
      reason: degraded ? 'processing-budget-exceeded' : hasWinner ? 'none' : 'missing-valid-winner',
    },
    loopHealth: [
      {
        loopId: 'planner',
        status: hasWinner ? 'healthy' : 'inactive',
        registeredAt: now - 5000,
        lastHeartbeatAt: hasWinner ? now - 5 : undefined,
      },
      {
        loopId: 'memory',
        status: degraded ? 'degraded' : 'healthy',
        registeredAt: now - 5000,
        lastHeartbeatAt: now - 8,
      },
      {
        loopId: 'safety',
        status: degraded ? 'stale' : 'healthy',
        registeredAt: now - 5000,
        lastHeartbeatAt: degraded ? now - 1200 : now - 6,
      },
    ],
  }
}

function loadSampleTick() {
  sampleSequence.value += 1
  store.ingestTick(createSampleTick(sampleSequence.value))
}
</script>

<template>
  <div :class="['flex', 'h-full', 'flex-col', 'gap-4', 'overflow-y-auto', 'p-4']">
    <div :class="['flex', 'flex-wrap', 'gap-2']">
      <Button
        :label="store.runtimeActive ? 'Heartbeat runtime active' : 'Start heartbeat runtime'"
        icon="i-solar:heartbeat-bold-duotone"
        variant="secondary"
        :disabled="store.runtimeActive"
        @click="store.initializeRuntime()"
      />
      <Button
        label="Load sample tick"
        icon="i-solar:play-bold-duotone"
        variant="secondary"
        @click="loadSampleTick"
      />
      <Button
        label="Clear"
        icon="i-solar:trash-bin-trash-bold-duotone"
        variant="ghost"
        @click="store.clear()"
      />
    </div>

    <Callout
      v-if="!store.hasTick"
      theme="orange"
      label="No cognition heartbeat yet."
      description="This page fills in when the runtime pushes heartbeat events into the shared store. The page starts the shared heartbeat runtime on mount, and Load sample tick is still available as a manual preview override."
    />

    <template v-else>
      <div :class="['grid', 'gap-2', 'sm:grid-cols-2', 'xl:grid-cols-4']">
        <div
          v-for="[label, value] in summaryCards"
          :key="label"
          :class="['rounded-xl', 'border', 'border-neutral-200', 'bg-white/70', 'p-3', 'dark:border-neutral-800', 'dark:bg-neutral-950/60']"
        >
          <div :class="['text-xs', 'uppercase', 'opacity-60']">
            {{ label }}
          </div>
          <div :class="['mt-1', 'text-lg', 'font-semibold', 'break-words']">
            {{ value }}
          </div>
        </div>
      </div>

      <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
        <span :class="['rounded-full', 'border', 'px-3', 'py-1', 'text-xs', 'font-semibold', 'uppercase', ...currentWorkspaceStatusChipClasses]">
          {{ currentWorkspaceStatus }}
        </span>
        <span :class="['text-sm', 'opacity-70']">
          degraded ticks in history: {{ store.degradedTickCount }}
        </span>
        <span :class="['text-sm', 'opacity-70']">
          reused winners in history: {{ store.reusedWinnerCount }}
        </span>
      </div>

      <section :class="['rounded-2xl', 'border', 'border-neutral-200', 'bg-white/70', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-950/60']">
        <div :class="['mb-3', 'text-sm', 'font-semibold']">
          Current winner
        </div>

        <div
          v-if="winnerEntries.length === 0"
          :class="['rounded-xl', 'border', 'border-dashed', 'border-neutral-300', 'p-3', 'text-sm', 'opacity-70', 'dark:border-neutral-700']"
        >
          No current winner. The workspace is idle for this tick.
        </div>

        <div v-else :class="['grid', 'gap-2', 'md:grid-cols-2']">
          <div
            v-for="[label, value] in winnerEntries"
            :key="label"
            :class="['grid', 'gap-1', 'rounded-xl', 'bg-neutral-100/70', 'p-3', 'dark:bg-neutral-900/70']"
          >
            <div :class="['text-xs', 'uppercase', 'opacity-60']">
              {{ label }}
            </div>
            <div :class="['font-mono', 'break-words', 'text-sm']">
              {{ value }}
            </div>
          </div>
        </div>

        <div v-if="store.currentWinner" :class="['mt-3', 'grid', 'gap-1']">
          <div :class="['text-xs', 'uppercase', 'opacity-60']">
            Payload
          </div>
          <pre :class="['overflow-auto', 'rounded-xl', 'bg-neutral-100/70', 'p-3', 'text-sm', 'dark:bg-neutral-900/70']">{{ JSON.stringify(store.currentWinner.payload, null, 2) }}</pre>
        </div>
      </section>

      <section :class="['rounded-2xl', 'border', 'border-neutral-200', 'bg-white/70', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-950/60']">
        <div :class="['mb-3', 'text-sm', 'font-semibold']">
          Loop health
        </div>

        <div :class="['mb-3', 'flex', 'flex-wrap', 'gap-2']">
          <span
            v-for="entry in loopHealthSummary"
            :key="entry.label"
            :class="['rounded-full', 'border', 'px-3', 'py-1', 'text-xs', 'font-semibold', ...loopCountChipClasses(entry.label)]"
          >
            {{ entry.label }}: {{ entry.count }}
          </span>
        </div>

        <div :class="['grid', 'gap-2']">
          <div
            v-for="entry in store.latestLoopHealth"
            :key="entry.loopId"
            :class="['grid', 'gap-2', 'rounded-xl', 'bg-neutral-100/70', 'p-3', 'md:grid-cols-[minmax(0,1fr)_auto_auto]', 'dark:bg-neutral-900/70']"
          >
            <div>
              <div :class="['font-semibold']">
                {{ entry.loopId }}
              </div>
              <div :class="['text-xs', 'opacity-60']">
                registered {{ formatTime(entry.registeredAt) }}
              </div>
            </div>
            <div :class="['font-mono', 'text-sm']">
              last heartbeat {{ formatTime(entry.lastHeartbeatAt) }}
            </div>
            <span :class="['rounded-full', 'border', 'px-3', 'py-1', 'text-xs', 'font-semibold', 'uppercase', ...loopStatusClasses(entry.status)]">
              {{ entry.status }}
            </span>
          </div>
        </div>
      </section>

      <section :class="['rounded-2xl', 'border', 'border-neutral-200', 'bg-white/70', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-950/60']">
        <div :class="['mb-3', 'text-sm', 'font-semibold']">
          Recent ticks
        </div>

        <div :class="['grid', 'gap-2']">
          <div
            v-for="entry in recentHistory"
            :key="entry.tickId"
            :class="['grid', 'gap-2', 'rounded-xl', 'bg-neutral-100/70', 'p-3', 'md:grid-cols-[auto_auto_minmax(0,1fr)]', 'dark:bg-neutral-900/70']"
          >
            <div :class="['font-mono', 'text-sm']">
              #{{ entry.sequence }}
            </div>
            <span :class="['w-fit', 'rounded-full', 'border', 'px-3', 'py-1', 'text-xs', 'font-semibold', 'uppercase', ...statusChipClasses(entry.workspaceStatus)]">
              {{ entry.workspaceStatus }}
            </span>
            <div :class="['text-sm', 'opacity-70']">
              {{ entry.backpressure.reason }} · {{ entry.backpressure.processingDurationMs }}ms
            </div>
          </div>
        </div>
      </section>

      <details :class="['rounded-2xl', 'border', 'border-neutral-200', 'bg-white/70', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-950/60']">
        <summary :class="['cursor-pointer', 'text-sm', 'font-semibold']">
          Raw event
        </summary>
        <pre :class="['mt-3', 'overflow-auto', 'rounded-xl', 'bg-neutral-100/70', 'p-3', 'text-sm', 'dark:bg-neutral-900/70']">{{ latestEventJson }}</pre>
      </details>
    </template>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Cognition Heartbeat
  subtitleKey: tamagotchi.settings.devtools.title
</route>
