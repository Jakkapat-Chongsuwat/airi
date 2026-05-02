import type { WorkspaceTickEvent } from '../types'
import type { CognitiveWorkspace } from '../workspace/workspace'

import { createContext } from '@moeru/eventa'
import { describe, expect, it } from 'vitest'

import { workspaceTickEvent } from '../events'
import { createLoopRegistry } from '../loops/registry'
import { createFakeClock } from '../test-utils/fake-clock'
import { createLoopIdFixture } from '../test-utils/loop-fixtures'
import { createWorkspaceChunkFixture } from '../test-utils/workspace-fixtures'
import { createCognitiveWorkspace } from '../workspace/workspace'
import { createCognitionHeartbeat } from './scheduler'

/**
 * @example
 * describe('createCognitionHeartbeat', () => {
 *   it('emits deterministic ticks', () => {
 *     expect([1, 2, 3]).toHaveLength(3)
 *   })
 * })
 */
describe('createCognitionHeartbeat', () => {
  it('emits 250ms heartbeat ticks without skipping the interval cadence', () => {
    const clock = createFakeClock()
    const workspace = createCognitiveWorkspace({ clock })
    const loopRegistry = createLoopRegistry({ clock })
    const loopId = createLoopIdFixture('cadence')
    const eventContext = createContext()
    const events: WorkspaceTickEvent[] = []

    workspace.propose(createWorkspaceChunkFixture('chunk-1', { createdAt: 0, sourceLoop: loopId }))
    loopRegistry.registerLoop(loopId)
    loopRegistry.markHeartbeat(loopId, clock.now())
    eventContext.on(workspaceTickEvent, (event) => {
      if (event.body) {
        events.push(event.body)
      }
    })

    const heartbeat = createCognitionHeartbeat({
      workspace,
      loopRegistry,
      eventContext,
      clock,
    })

    heartbeat.start()
    clock.advanceBy(750)

    expect(events).toHaveLength(3)
    expect(events.map(event => event.sequence)).toEqual([1, 2, 3])
    expect(events.map(event => event.scheduledAt)).toEqual([250, 500, 750])
    expect(events.every(event => event.backpressure.degraded === false)).toBe(true)
  })

  it('marks slow processing as degraded and reuses the previous winner when available', () => {
    const clock = createFakeClock()
    const baseWorkspace = createCognitiveWorkspace({ clock })
    const loopRegistry = createLoopRegistry({ clock })
    const loopId = createLoopIdFixture('slow-processing')
    const eventContext = createContext()
    const events: WorkspaceTickEvent[] = []
    let shouldConsumeBudget = false

    baseWorkspace.propose(createWorkspaceChunkFixture('chunk-1', { createdAt: 0, sourceLoop: loopId }))
    loopRegistry.registerLoop(loopId)
    loopRegistry.markHeartbeat(loopId, clock.now())
    eventContext.on(workspaceTickEvent, (event) => {
      if (event.body) {
        events.push(event.body)
      }
    })

    const workspace: CognitiveWorkspace = {
      propose: chunk => baseWorkspace.propose(chunk),
      snapshot: now => baseWorkspace.snapshot(now),
      publishWinner: winner => baseWorkspace.publishWinner(winner),
      selectWinner(now) {
        const winner = shouldConsumeBudget
          ? {
              chunk: createWorkspaceChunkFixture('chunk-2', { createdAt: now, sourceLoop: loopId }),
              selectedAt: now,
              selectionReason: 'first-valid-proposal' as const,
            }
          : baseWorkspace.selectWinner(now)

        if (shouldConsumeBudget) {
          clock.consume(220)
        }

        return winner
      },
    }

    const heartbeat = createCognitionHeartbeat({
      workspace,
      loopRegistry,
      eventContext,
      clock,
    })

    heartbeat.start()
    clock.advanceBy(250)

    shouldConsumeBudget = true
    baseWorkspace.propose(createWorkspaceChunkFixture('chunk-2', { createdAt: clock.now(), sourceLoop: loopId }))
    clock.advanceBy(250)

    expect(events).toHaveLength(2)
    expect(events[1].backpressure.degraded).toBe(true)
    expect(events[1].backpressure.reusedPreviousWinner).toBe(true)
    expect(events[1].backpressure.count).toBe(1)
    expect(events[1].winner.chunk?.id).toBe('chunk-1')
  })
})
