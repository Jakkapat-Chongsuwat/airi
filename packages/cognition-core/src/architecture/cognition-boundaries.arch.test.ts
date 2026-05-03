import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { architectureFixtureManifest } from './fixture-manifest'
import { inspectArchitectureFile, inspectProductionSourceFiles } from './rules'

const architectureDirectory = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(architectureDirectory, '..', '..')

/**
 * @example
 * describe('cognition architecture boundaries', () => {
 *   it('keeps production source clean', async () => {
 *     expect([]).toEqual([])
 *   })
 * })
 */
describe('cognition architecture boundaries', () => {
  it('keeps the production cognition-core source free of boundary violations', async () => {
    const violations = await inspectProductionSourceFiles(packageRoot)

    expect(violations).toEqual([])
  })

  it('fails each fixture with the expected architecture rule', async () => {
    for (const fixtureScenario of architectureFixtureManifest) {
      const violations = await inspectArchitectureFile(packageRoot, fixtureScenario.filePath)
      const ruleIds = violations.map(violation => violation.ruleId)

      expect(violations.length, fixtureScenario.name).toBeGreaterThan(0)
      expect(ruleIds, fixtureScenario.name).toContain(fixtureScenario.ruleId)
    }
  })
})
