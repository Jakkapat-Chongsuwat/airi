import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

function readDeveloperMenuFile() {
  return readFile(join(currentDirectory, 'developer.vue'), 'utf8')
}

function readSharedHeartbeatPageFile() {
  return readFile(join(currentDirectory, '..', '..', '..', '..', '..', '..', '..', 'packages', 'stage-pages', 'src', 'pages', 'devtools', 'cognition-heartbeat.vue'), 'utf8')
}

/**
 * @example
 * describe('desktop developer menu heartbeat wiring', () => {
 *   it('keeps the shared route visible', async () => {
 *     expect(true).toBe(true)
 *   })
 * })
 */
describe('desktop developer menu heartbeat wiring', () => {
  it('keeps the shared heartbeat entry in the maintained desktop developer menu', async () => {
    const developerMenuFile = await readDeveloperMenuFile()

    expect(developerMenuFile).toContain('title: \'Cognition Heartbeat\'')
    expect(developerMenuFile).toContain('to: \'/devtools/cognition-heartbeat\'')
    expect(developerMenuFile).toContain('icon: \'i-solar:heartbeat-bold-duotone\'')
  })

  it('points the desktop menu entry at the shared heartbeat page implementation', async () => {
    const sharedHeartbeatPageFile = await readSharedHeartbeatPageFile()

    expect(sharedHeartbeatPageFile).toContain('useCognitionHeartbeatStore')
    expect(sharedHeartbeatPageFile).toContain('Heartbeat runtime active')
  })
})
