import { createServer } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import {
  canListenOnPort,
  findAvailableServerChannelPort,
  isServerChannelAddressInUse,
  resolveConfiguredServerChannelPort,
  withServerChannelPort,
} from './runtime-port'

describe('server channel runtime port helpers', () => {
  const activeServers = new Set<ReturnType<typeof createServer>>()

  afterEach(async () => {
    await Promise.all([...activeServers].map(server => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })))
    activeServers.clear()
  })

  it('uses the default port when no environment override exists', () => {
    expect(resolveConfiguredServerChannelPort()).toEqual({
      port: 6121,
      source: 'default',
    })
  })

  it('uses the environment override when it is valid', () => {
    expect(resolveConfiguredServerChannelPort('7001')).toEqual({
      port: 7001,
      source: 'env',
    })
  })

  it('detects address-in-use startup failures', () => {
    expect(isServerChannelAddressInUse({ code: 'EADDRINUSE' })).toBe(true)
    expect(isServerChannelAddressInUse(new Error('listen EADDRINUSE: address already in use 127.0.0.1:6121'))).toBe(true)
    expect(isServerChannelAddressInUse(new Error('different failure'))).toBe(false)
  })

  it('replaces only the runtime port in server options', () => {
    expect(withServerChannelPort({ hostname: '127.0.0.1', port: 6121 }, 6122)).toEqual({
      hostname: '127.0.0.1',
      port: 6122,
    })
  })

  it('finds a fallback port when the preferred one is occupied', async () => {
    const blockingServer = createServer()
    activeServers.add(blockingServer)

    await new Promise<void>((resolve, reject) => {
      blockingServer.listen(0, '127.0.0.1', () => resolve())
      blockingServer.once('error', reject)
    })

    const address = blockingServer.address()
    expect(address).not.toBeNull()
    expect(typeof address).toBe('object')

    const preferredPort = typeof address === 'object' && address ? address.port : 0
    expect(await canListenOnPort(preferredPort, '127.0.0.1')).toBe(false)

    const fallbackPort = await findAvailableServerChannelPort({
      hostname: '127.0.0.1',
      preferredPort,
      maxAttempts: 5,
    })

    expect(fallbackPort).toBeGreaterThan(preferredPort)
    expect(await canListenOnPort(fallbackPort, '127.0.0.1')).toBe(true)
  })
})
