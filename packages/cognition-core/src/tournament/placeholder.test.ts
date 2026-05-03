import { describe, expect, it } from 'vitest'

import { createWorkspaceChunkFixture } from '../test-utils/workspace-fixtures'
import { selectWorkspaceWinner } from './placeholder'

/**
 * @example
 * describe('selectWorkspaceWinner', () => {
 *   it('prefers the previous valid winner', () => {
 *     expect('previous-valid-winner').toBe('previous-valid-winner')
 *   })
 * })
 */
describe('selectWorkspaceWinner', () => {
  it('reuses the previous valid winner when it is still present', () => {
    const previousChunk = createWorkspaceChunkFixture('chunk-1')

    const winner = selectWorkspaceWinner({
      chunks: [previousChunk, createWorkspaceChunkFixture('chunk-2')],
      previousWinner: {
        chunk: previousChunk,
        selectedAt: 0,
        selectionReason: 'first-valid-proposal',
      },
      selectedAt: 250,
    })

    expect(winner.selectionReason).toBe('previous-valid-winner')
    expect(winner.chunk?.id).toBe('chunk-1')
  })

  it('falls back to the first valid proposal when no previous winner exists', () => {
    const winner = selectWorkspaceWinner({
      chunks: [createWorkspaceChunkFixture('chunk-1'), createWorkspaceChunkFixture('chunk-2')],
      previousWinner: null,
      selectedAt: 250,
    })

    expect(winner.selectionReason).toBe('first-valid-proposal')
    expect(winner.chunk?.id).toBe('chunk-1')
  })

  it('returns an empty winner when no chunks are available', () => {
    const winner = selectWorkspaceWinner({
      chunks: [],
      previousWinner: null,
      selectedAt: 250,
    })

    expect(winner.selectionReason).toBe('empty-workspace')
    expect(winner.chunk).toBeNull()
  })
})
