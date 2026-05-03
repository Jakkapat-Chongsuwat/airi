/**
 * Heartbeat interval used by the cognition scheduler.
 */
export const HEARTBEAT_INTERVAL_MS = 250

/**
 * Processing budget before a tick is marked degraded.
 */
export const PROCESSING_BUDGET_MS = 200

/**
 * Minimum workspace capacity while the slice is active.
 */
export const WORKSPACE_MIN_CHUNKS = 1

/**
 * Maximum bounded workspace capacity for the Phase A slice.
 */
export const WORKSPACE_MAX_CHUNKS = 4

/**
 * Default age threshold that marks a healthy loop as stale.
 */
export const LOOP_STALE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 2
