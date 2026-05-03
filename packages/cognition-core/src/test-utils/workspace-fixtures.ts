import type { WorkspaceChunk } from '../types'

interface WorkspaceChunkFixtureOptions {
  sourceLoop?: WorkspaceChunk['sourceLoop']
  kind?: string
  payload?: unknown
  createdAt?: number
  expiresAt?: number
}

/**
 * Creates a stable workspace chunk fixture for cognition-core tests.
 *
 * Use when:
 * - Unit tests need deterministic workspace proposals
 * - Integration tests need stable chunk ids for winner assertions
 *
 * Expects:
 * - `id` is unique within the test case
 *
 * Returns:
 * - A serializable workspace chunk fixture
 */
export function createWorkspaceChunkFixture(id: string, options: WorkspaceChunkFixtureOptions = {}): WorkspaceChunk {
  return {
    id,
    sourceLoop: options.sourceLoop ?? 'system',
    kind: options.kind ?? 'note',
    payload: options.payload ?? { id },
    createdAt: options.createdAt ?? 0,
    expiresAt: options.expiresAt,
  }
}
