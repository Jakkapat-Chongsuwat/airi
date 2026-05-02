import type { BroadcastWinner, CognitiveWorkspaceSnapshot, WorkspaceChunk } from '../types'

import { WORKSPACE_MAX_CHUNKS } from '../constants'
import { selectWorkspaceWinner } from '../tournament/placeholder'

export interface WorkspaceClock {
  now: () => number
}

export interface CognitiveWorkspaceOptions {
  clock?: WorkspaceClock
  maxChunks?: number
}

/**
 * Shared bounded workspace interface for the cognition heartbeat slice.
 *
 * Use when:
 * - Proposing candidate workspace chunks from cognition loops
 * - Selecting and publishing the current safe winner
 *
 * Expects:
 * - Chunks use the same clock domain as the scheduler
 *
 * Returns:
 * - A stateful bounded workspace API
 */
export interface CognitiveWorkspace {
  propose: (chunk: WorkspaceChunk) => void
  snapshot: (now?: number) => CognitiveWorkspaceSnapshot
  selectWinner: (now: number) => BroadcastWinner
  publishWinner: (winner: BroadcastWinner) => void
}

function resolveNow(clock?: WorkspaceClock) {
  return clock?.now() ?? Date.now()
}

function isChunkActive(chunk: WorkspaceChunk, now: number) {
  return chunk.expiresAt == null || chunk.expiresAt > now
}

function isWinnerActive(winner: BroadcastWinner | null, chunks: WorkspaceChunk[]) {
  const winnerChunkId = winner?.chunk?.id
  return Boolean(winnerChunkId && chunks.some(chunk => chunk.id === winnerChunkId))
}

/**
 * Creates the bounded cognition workspace used by the shared heartbeat slice.
 *
 * Use when:
 * - The heartbeat scheduler needs a deterministic bounded workspace
 * - Shared UI state needs the latest published winner for hydration
 *
 * Expects:
 * - `maxChunks` remains within the Phase A bounded workspace constraint
 *
 * Returns:
 * - A bounded workspace API that trims overflow and prunes expired chunks
 */
export function createCognitiveWorkspace(options: CognitiveWorkspaceOptions = {}): CognitiveWorkspace {
  const maxChunks = Math.min(Math.max(options.maxChunks ?? WORKSPACE_MAX_CHUNKS, 1), WORKSPACE_MAX_CHUNKS)

  let chunks: WorkspaceChunk[] = []
  let lastWinner: BroadcastWinner | null = null

  function prune(now: number) {
    chunks = chunks.filter(chunk => isChunkActive(chunk, now))

    if (!isWinnerActive(lastWinner, chunks)) {
      lastWinner = null
    }
  }

  function trimToCapacity() {
    if (chunks.length <= maxChunks) {
      return
    }

    chunks = chunks.slice(-maxChunks)

    if (!isWinnerActive(lastWinner, chunks)) {
      lastWinner = null
    }
  }

  function readSnapshot(now = resolveNow(options.clock)): CognitiveWorkspaceSnapshot {
    prune(now)

    return {
      chunks: [...chunks],
      chunkCount: chunks.length,
      lastWinner,
    }
  }

  return {
    propose(chunk) {
      const now = resolveNow(options.clock)

      if (!isChunkActive(chunk, now)) {
        return
      }

      prune(now)
      chunks = [...chunks, chunk]
      trimToCapacity()
    },

    snapshot(now) {
      return readSnapshot(now)
    },

    selectWinner(now) {
      const snapshot = readSnapshot(now)

      return selectWorkspaceWinner({
        chunks: snapshot.chunks,
        previousWinner: snapshot.lastWinner,
        selectedAt: now,
      })
    },

    publishWinner(winner) {
      const snapshot = readSnapshot(winner.selectedAt)

      if (!winner.chunk) {
        lastWinner = null
        return
      }

      if (!snapshot.chunks.some(chunk => chunk.id === winner.chunk?.id)) {
        return
      }

      lastWinner = winner
    },
  }
}
