import type { CognitiveLoopId } from '../types'

/**
 * Creates a stable loop id fixture for cognition-core tests.
 *
 * Use when:
 * - Loop registry tests need deterministic identifiers
 * - Integration tests need readable loop health assertions
 *
 * Expects:
 * - `name` stays unique within the test case
 *
 * Returns:
 * - A stable loop id fixture
 */
export function createLoopIdFixture(name: string): CognitiveLoopId {
  return `loop:${name}`
}
