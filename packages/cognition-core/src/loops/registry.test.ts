import { describe, expect, it } from 'vitest'

import { createFakeClock } from '../test-utils/fake-clock'
import { createLoopIdFixture } from '../test-utils/loop-fixtures'
import { createLoopRegistry } from './registry'

/**
 * @example
 * describe('createLoopRegistry', () => {
 *   it('keeps duplicate registrations stable', () => {
 *     expect(1).toBe(1)
 *   })
 * })
 */
describe('createLoopRegistry', () => {
  it('keeps duplicate registrations from creating duplicate loop entries', () => {
    const clock = createFakeClock()
    const registry = createLoopRegistry({ clock })
    const loopId = createLoopIdFixture('duplicate')

    registry.registerLoop(loopId)
    registry.registerLoop(loopId)

    expect(registry.snapshot(clock.now())).toHaveLength(1)
    expect(registry.snapshot(clock.now())[0].loopId).toBe(loopId)
  })

  it('derives healthy, stale, degraded, failed, and inactive loop states', () => {
    const clock = createFakeClock()
    const registry = createLoopRegistry({ clock, staleAfterMs: 300 })
    const healthyLoop = createLoopIdFixture('healthy')
    const degradedLoop = createLoopIdFixture('degraded')
    const failedLoop = createLoopIdFixture('failed')
    const inactiveLoop = createLoopIdFixture('inactive')

    registry.registerLoop(healthyLoop)
    registry.registerLoop(degradedLoop)
    registry.registerLoop(failedLoop)
    registry.registerLoop(inactiveLoop)
    registry.markHeartbeat(healthyLoop, 0)
    registry.markHeartbeat(degradedLoop, 0)
    registry.markDegraded(degradedLoop)
    registry.markFailed(failedLoop, 'boom')
    registry.markInactive(inactiveLoop)

    clock.advanceBy(350)

    const snapshots = registry.snapshot(clock.now())
    const byId = new Map(snapshots.map(snapshot => [snapshot.loopId, snapshot]))

    expect(byId.get(healthyLoop)?.status).toBe('stale')
    expect(byId.get(degradedLoop)?.status).toBe('degraded')
    expect(byId.get(failedLoop)?.status).toBe('failed')
    expect(byId.get(failedLoop)?.lastError).toBe('boom')
    expect(byId.get(inactiveLoop)?.status).toBe('inactive')
  })
})
