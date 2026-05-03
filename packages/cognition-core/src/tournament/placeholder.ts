import type { BroadcastWinner, WorkspaceChunk } from '../types'

export interface WorkspaceWinnerSelectionOptions {
  chunks: WorkspaceChunk[]
  previousWinner: BroadcastWinner | null
  selectedAt: number
}

/**
 * Selects the placeholder winner for the bounded cognition workspace.
 *
 * Use when:
 * - The Phase A slice needs a deterministic winner without model scoring
 * - Tests need stable winner selection under backpressure
 *
 * Expects:
 * - `chunks` is already pruned for expiry and workspace capacity
 * - `previousWinner` is the last published winner, if one exists
 *
 * Returns:
 * - The previous valid winner when still present, otherwise the first valid proposal, otherwise an empty winner
 */
export function selectWorkspaceWinner(options: WorkspaceWinnerSelectionOptions): BroadcastWinner {
  const previousChunkId = options.previousWinner?.chunk?.id

  if (previousChunkId) {
    const previousChunk = options.chunks.find(chunk => chunk.id === previousChunkId)

    if (previousChunk) {
      return {
        chunk: previousChunk,
        selectedAt: options.selectedAt,
        selectionReason: 'previous-valid-winner',
      }
    }
  }

  const firstChunk = options.chunks[0]

  if (firstChunk) {
    return {
      chunk: firstChunk,
      selectedAt: options.selectedAt,
      selectionReason: 'first-valid-proposal',
    }
  }

  return {
    chunk: null,
    selectedAt: options.selectedAt,
    selectionReason: 'empty-workspace',
  }
}
