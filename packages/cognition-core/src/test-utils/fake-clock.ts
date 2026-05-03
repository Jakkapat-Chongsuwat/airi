import type { HeartbeatClock } from '../heartbeat/scheduler'

export interface FakeClockOptions {
  now?: number
}

interface FakeTimer {
  callback: () => void
  intervalMs: number
  nextAt: number
}

/**
 * Deterministic clock used by cognition-core tests.
 *
 * Use when:
 * - Scheduler tests need manual control over interval progression
 * - Workspace and loop registries need a shared deterministic time source
 *
 * Expects:
 * - `advanceBy` represents wall-clock advancement
 * - `consume` represents synchronous work performed during a tick
 *
 * Returns:
 * - A `HeartbeatClock` with deterministic advancement helpers
 */
export interface FakeClock extends HeartbeatClock {
  advanceBy: (ms: number) => void
  consume: (ms: number) => void
}

/**
 * Creates a deterministic fake clock for cognition-core tests.
 *
 * Use when:
 * - A test needs reproducible interval behavior without real timers
 * - Tick processing should advance time without scheduling real async work
 *
 * Expects:
 * - Timer callbacks stay synchronous
 *
 * Returns:
 * - A fake clock that drives interval callbacks and manual time consumption
 */
export function createFakeClock(options: FakeClockOptions = {}): FakeClock {
  let currentTime = options.now ?? 0
  let nextId = 1
  const timers = new Map<number, FakeTimer>()

  function getNextDueTimer() {
    return [...timers.entries()]
      .sort((left, right) => left[1].nextAt - right[1].nextAt || left[0] - right[0])[0]
  }

  return {
    now() {
      return currentTime
    },

    setInterval(callback, intervalMs) {
      const id = nextId
      nextId += 1

      timers.set(id, {
        callback,
        intervalMs,
        nextAt: currentTime + intervalMs,
      })

      return id
    },

    clearInterval(handle) {
      timers.delete(Number(handle))
    },

    consume(ms) {
      currentTime += ms
    },

    advanceBy(ms) {
      const target = currentTime + ms

      while (true) {
        const nextDue = getNextDueTimer()

        if (!nextDue || nextDue[1].nextAt > target) {
          break
        }

        currentTime = nextDue[1].nextAt

        const dueTimers = [...timers.entries()]
          .filter(([, timer]) => timer.nextAt <= currentTime)
          .sort((left, right) => left[1].nextAt - right[1].nextAt || left[0] - right[0])

        for (const [id] of dueTimers) {
          const activeTimer = timers.get(id)

          if (!activeTimer) {
            continue
          }

          activeTimer.nextAt += activeTimer.intervalMs
          activeTimer.callback()
        }
      }

      if (currentTime < target) {
        currentTime = target
      }
    },
  }
}
