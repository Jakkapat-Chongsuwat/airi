import { describe, expect, it } from 'vitest'

import { createFakeClock } from '../test-utils/fake-clock'
import { createWorkspaceChunkFixture } from '../test-utils/workspace-fixtures'
import { createCognitiveWorkspace } from './workspace'

/**
 * @example
 * describe('createCognitiveWorkspace', () => {
 *   it('bounds chunk storage', () => {
 *     expect(['a', 'b']).toHaveLength(2)
 *   })
 * })
 */
describe('createCognitiveWorkspace', () => {
  it('keeps the workspace bounded to the most recent four chunks', () => {
    const clock = createFakeClock()
    const workspace = createCognitiveWorkspace({ clock })

    workspace.propose(createWorkspaceChunkFixture('chunk-1', { createdAt: 0 }))
    workspace.propose(createWorkspaceChunkFixture('chunk-2', { createdAt: 1 }))
    workspace.propose(createWorkspaceChunkFixture('chunk-3', { createdAt: 2 }))
    workspace.propose(createWorkspaceChunkFixture('chunk-4', { createdAt: 3 }))
    workspace.propose(createWorkspaceChunkFixture('chunk-5', { createdAt: 4 }))

    const snapshot = workspace.snapshot(clock.now())

    expect(snapshot.chunkCount).toBe(4)
    expect(snapshot.chunks.map(chunk => chunk.id)).toEqual(['chunk-2', 'chunk-3', 'chunk-4', 'chunk-5'])
  })

  it('selects the first proposal first, then reuses the published winner while it stays valid', () => {
    const clock = createFakeClock()
    const workspace = createCognitiveWorkspace({ clock })

    workspace.propose(createWorkspaceChunkFixture('chunk-1', { createdAt: 0 }))
    workspace.propose(createWorkspaceChunkFixture('chunk-2', { createdAt: 1 }))

    const firstWinner = workspace.selectWinner(clock.now())
    workspace.publishWinner(firstWinner)
    const repeatedWinner = workspace.selectWinner(clock.now())

    expect(firstWinner.selectionReason).toBe('first-valid-proposal')
    expect(firstWinner.chunk?.id).toBe('chunk-1')
    expect(repeatedWinner.selectionReason).toBe('previous-valid-winner')
    expect(repeatedWinner.chunk?.id).toBe('chunk-1')
  })

  it('returns an empty winner when the workspace has no valid chunks', () => {
    const clock = createFakeClock()
    const workspace = createCognitiveWorkspace({ clock })

    const winner = workspace.selectWinner(clock.now())

    expect(winner.chunk).toBeNull()
    expect(winner.selectionReason).toBe('empty-workspace')
  })
})
