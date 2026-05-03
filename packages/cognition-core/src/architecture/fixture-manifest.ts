import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type ArchitectureRuleId = 'forbidden-import' | 'forbidden-threshold' | 'owner-boundary'

/**
 * Describes one architecture fixture scenario used by the boundary suite.
 *
 * @param RuleId - Stable rule identifier expected from the architecture scanner.
 */
export interface ArchitectureFixtureScenario<RuleId extends ArchitectureRuleId = ArchitectureRuleId> {
  /** Absolute file path for the fixture file scanned by the test harness. */
  filePath: string
  /** Stable scenario label used in assertion output. */
  name: string
  /** Expected architecture rule triggered by this fixture. */
  ruleId: RuleId
}

const architectureDirectory = dirname(fileURLToPath(import.meta.url))
const fixtureDirectory = join(architectureDirectory, 'fixtures')

/**
 * Fixture scenarios that intentionally violate one architecture rule each.
 *
 * Use when:
 * - The architecture suite needs deterministic failure cases
 * - A new rule needs a named source fixture for regression coverage
 *
 * Expects:
 * - Each `filePath` points at a real fixture under `src/architecture/fixtures`
 *
 * Returns:
 * - A stable manifest of failure scenarios for the architecture test harness
 */
export const architectureFixtureManifest: ArchitectureFixtureScenario[] = [
  {
    name: 'owner boundary fixture',
    filePath: join(fixtureDirectory, 'unauthorized-writer.fixture.ts'),
    ruleId: 'owner-boundary',
  },
  {
    name: 'forbidden threshold fixture',
    filePath: join(fixtureDirectory, 'forbidden-threshold.fixture.ts'),
    ruleId: 'forbidden-threshold',
  },
  {
    name: 'forbidden import fixture',
    filePath: join(fixtureDirectory, 'forbidden-import.fixture.ts'),
    ruleId: 'forbidden-import',
  },
]
