import type { WorkspaceTickEvent } from '../types'

import { createContext } from '@moeru/eventa'
import { describe, expect, it } from 'vitest'

import { workspaceTickEvent } from '../events'
import { createCognitionHeartbeat } from '../heartbeat/scheduler'
import { createLoopRegistry } from '../loops/registry'
import { createFakeClock } from '../test-utils/fake-clock'
import { createLoopIdFixture } from '../test-utils/loop-fixtures'
import { createWorkspaceChunkFixture } from '../test-utils/workspace-fixtures'
import { createCognitiveWorkspace } from '../workspace/workspace'

/**
 * @example
 * describe('workspaceTickEvent integration', () => {
 *   it('publishes heartbeat events to multiple subscribers', () => {
 *     expect(true).toBe(true)
 *   })
 * })
 */
describe('workspaceTickEvent integration', () => {
  it('publishes heartbeat events to multiple subscribers and lets late readers derive the latest state', () => {
    const clock = createFakeClock()
    const workspace = createCognitiveWorkspace({ clock })
    const loopRegistry = createLoopRegistry({ clock })
    const loopId = createLoopIdFixture('integration')
    const eventContext = createContext()
    const fastSubscriberEvents: WorkspaceTickEvent[] = []
    const lateSubscriberEvents: WorkspaceTickEvent[] = []

    workspace.propose(createWorkspaceChunkFixture('chunk-1', { createdAt: 0, sourceLoop: loopId }))
    loopRegistry.registerLoop(loopId)
    loopRegistry.markHeartbeat(loopId, 0)
    eventContext.on(workspaceTickEvent, (event) => {
      if (event.body) {
        fastSubscriberEvents.push(event.body)
      }
    })

    const heartbeat = createCognitionHeartbeat({
      workspace,
      loopRegistry,
      eventContext,
      clock,
    })

    heartbeat.start()
    clock.advanceBy(250)

    const latestBeforeLateSubscriber = heartbeat.getLatestEvent()

    eventContext.on(workspaceTickEvent, (event) => {
      if (event.body) {
        lateSubscriberEvents.push(event.body)
      }
    })

    clock.advanceBy(250)

    expect(fastSubscriberEvents).toHaveLength(2)
    expect(lateSubscriberEvents).toHaveLength(1)
    expect(latestBeforeLateSubscriber?.sequence).toBe(1)
    expect(latestBeforeLateSubscriber?.winner.chunk?.id).toBe('chunk-1')
    expect(lateSubscriberEvents[0].sequence).toBe(2)
  })
})
