/**
 * Identifies a cognitive loop inside the shared heartbeat slice.
 *
 * Use when:
 * - Registering cognition loop health with the loop registry
 * - Tagging workspace chunks with their source loop
 *
 * Expects:
 * - A stable string identifier per loop
 *
 * Returns:
 * - A loop id that can be serialized into diagnostics events
 */
export type CognitiveLoopId = string

/**
 * Describes the allowed loop-health states for the Phase A slice.
 *
 * Use when:
 * - Reporting loop health snapshots
 * - Rendering loop diagnostics in shared state
 *
 * Expects:
 * - A derived status that reflects current loop availability
 *
 * Returns:
 * - A serialized loop-health label
 */
export type LoopHealthStatus = 'healthy' | 'degraded' | 'inactive' | 'failed' | 'stale'

/**
 * Describes the workspace status reported on every heartbeat tick.
 *
 * Use when:
 * - Publishing a heartbeat event
 * - Rendering shared cognition diagnostics
 *
 * Expects:
 * - Status derived from winner availability and backpressure
 *
 * Returns:
 * - A stable workspace status label
 */
export type WorkspaceStatus = 'idle' | 'active' | 'degraded'

/**
 * Explains why a winner was chosen for broadcast.
 *
 * Use when:
 * - Comparing placeholder tournament outcomes
 * - Auditing backpressure fallback behavior
 *
 * Expects:
 * - One reason per emitted winner
 *
 * Returns:
 * - A serializable selection reason
 */
export type WinnerSelectionReason = 'previous-valid-winner' | 'first-valid-proposal' | 'empty-workspace'

/**
 * Explains why a tick reported backpressure.
 *
 * Use when:
 * - Publishing heartbeat diagnostics
 * - Counting degraded ticks in shared UI state
 *
 * Expects:
 * - One reason per tick
 *
 * Returns:
 * - A backpressure reason label
 */
export type BackpressureReason = 'none' | 'processing-budget-exceeded' | 'missing-valid-winner'

/**
 * Describes one bounded workspace chunk.
 *
 * Use when:
 * - Proposing candidate cognition outputs into the workspace
 * - Broadcasting the current winning chunk
 *
 * Expects:
 * - `id` is stable within the workspace window
 * - `expiresAt`, when present, uses the same clock as the scheduler
 *
 * Returns:
 * - A serializable workspace chunk payload
 */
export interface WorkspaceChunk {
  id: string
  sourceLoop: CognitiveLoopId | 'system'
  kind: string
  payload: unknown
  createdAt: number
  expiresAt?: number
}

/**
 * Describes the winner selected for broadcast on a tick.
 *
 * Use when:
 * - Emitting heartbeat events
 * - Caching the last safe winner in the bounded workspace
 *
 * Expects:
 * - `chunk` is null only when the workspace is empty
 *
 * Returns:
 * - A deterministic winner record for the current tick
 */
export interface BroadcastWinner {
  chunk: WorkspaceChunk | null
  selectedAt: number
  selectionReason: WinnerSelectionReason
}

/**
 * Describes backpressure observed during a heartbeat tick.
 *
 * Use when:
 * - Reporting degraded heartbeat conditions
 * - Reusing a previously safe winner during slow processing
 *
 * Expects:
 * - `count` is cumulative per heartbeat instance
 *
 * Returns:
 * - A serializable backpressure snapshot
 */
export interface BackpressureState {
  degraded: boolean
  count: number
  processingDurationMs: number
  reusedPreviousWinner: boolean
  reason: BackpressureReason
}

/**
 * Describes one loop-health snapshot emitted on a heartbeat tick.
 *
 * Use when:
 * - Reporting shared cognition diagnostics
 * - Comparing loop liveness across ticks
 *
 * Expects:
 * - `loopId` is unique within the registry snapshot
 *
 * Returns:
 * - A serializable loop-health record
 */
export interface LoopHealthSnapshot {
  loopId: CognitiveLoopId
  status: LoopHealthStatus
  registeredAt: number
  lastHeartbeatAt?: number
  lastError?: string
}

/**
 * Describes the current bounded workspace state.
 *
 * Use when:
 * - Deriving the current safe winner before a tick
 * - Rehydrating state for late subscribers
 *
 * Expects:
 * - `chunks` reflects the pruned bounded workspace
 *
 * Returns:
 * - A read-only workspace snapshot
 */
export interface CognitiveWorkspaceSnapshot {
  chunks: WorkspaceChunk[]
  chunkCount: number
  lastWinner: BroadcastWinner | null
}

/**
 * Describes the heartbeat event emitted through Eventa.
 *
 * Use when:
 * - Publishing the shared cognition heartbeat
 * - Hydrating diagnostics state in shared stores
 *
 * Expects:
 * - `sequence` increases monotonically per heartbeat instance
 *
 * Returns:
 * - A serializable heartbeat event payload
 */
export interface WorkspaceTickEvent {
  tickId: string
  sequence: number
  scheduledAt: number
  emittedAt: number
  intervalMs: number
  processingBudgetMs: number
  winner: BroadcastWinner
  workspaceStatus: WorkspaceStatus
  backpressure: BackpressureState
  loopHealth: LoopHealthSnapshot[]
}
