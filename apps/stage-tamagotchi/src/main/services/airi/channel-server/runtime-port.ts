import type { ServerOptions } from '@proj-airi/server-runtime/server'

import { createServer } from 'node:net'
import { env } from 'node:process'

const DEFAULT_SERVER_CHANNEL_PORT = 6121
const DEFAULT_SERVER_CHANNEL_PORT_SCAN_ATTEMPTS = 20

/**
 * Describes how the preferred server-channel port was chosen.
 *
 * Expects:
 * - `port` is a valid TCP port number
 */
export interface ConfiguredServerChannelPort {
  port: number
  source: 'default' | 'env'
}

/**
 * Resolves the preferred server-channel port for the current process.
 *
 * Use when:
 * - The desktop runtime needs the default AIRI websocket port
 * - An explicit `SERVER_CHANNEL_PORT` override may be present
 *
 * Expects:
 * - Invalid or missing environment values should fall back to the default port
 *
 * Returns:
 * - The preferred port and whether it came from the default or the environment
 */
export function resolveConfiguredServerChannelPort(serverChannelPort = env.SERVER_CHANNEL_PORT): ConfiguredServerChannelPort {
  const parsedPort = serverChannelPort ? Number.parseInt(serverChannelPort, 10) : Number.NaN

  if (Number.isInteger(parsedPort) && parsedPort > 0) {
    return {
      port: parsedPort,
      source: 'env',
    }
  }

  return {
    port: DEFAULT_SERVER_CHANNEL_PORT,
    source: 'default',
  }
}

/**
 * Detects whether a server start failure was caused by a busy port.
 *
 * Use when:
 * - Deciding whether desktop startup should try an automatic port fallback
 *
 * Expects:
 * - `error` may be any thrown value from the runtime server
 *
 * Returns:
 * - `true` when the failure indicates `EADDRINUSE`
 */
export function isServerChannelAddressInUse(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException

  if ('code' in nodeError && nodeError.code === 'EADDRINUSE') {
    return true
  }

  return error instanceof Error && error.message.includes('EADDRINUSE')
}

/**
 * Applies a specific runtime port to server options.
 *
 * Use when:
 * - Restarting the server channel on a fallback port
 * - Keeping the existing hostname, auth, and TLS settings intact
 *
 * Expects:
 * - `options` already contains the desired runtime configuration except for port
 *
 * Returns:
 * - A new `ServerOptions` object with the requested port
 */
export function withServerChannelPort(options: ServerOptions, port: number): ServerOptions {
  return {
    ...options,
    port,
  }
}

/**
 * Checks whether the current process can bind to a port.
 *
 * Use when:
 * - Searching for a development fallback port after `EADDRINUSE`
 *
 * Expects:
 * - The hostname matches the address family the runtime will actually bind to
 *
 * Returns:
 * - `true` when the port is available for listening
 */
export async function canListenOnPort(port: number, hostname: string): Promise<boolean> {
  return await new Promise<boolean>((resolve, reject) => {
    const probeServer = createServer()

    probeServer.once('error', (error) => {
      probeServer.close(() => {
        if (isServerChannelAddressInUse(error)) {
          resolve(false)
          return
        }

        reject(error)
      })
    })

    probeServer.once('listening', () => {
      probeServer.close((closeError) => {
        if (closeError) {
          reject(closeError)
          return
        }

        resolve(true)
      })
    })

    probeServer.listen(port, hostname)
  })
}

/**
 * Finds the next available server-channel port above the preferred one.
 *
 * Use when:
 * - Desktop startup should keep going after the default local websocket port is busy
 *
 * Expects:
 * - The preferred port is already known to be unavailable
 *
 * Returns:
 * - The first reachable fallback port in the scan window
 */
export async function findAvailableServerChannelPort(options: {
  hostname: string
  preferredPort: number
  maxAttempts?: number
}): Promise<number> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_SERVER_CHANNEL_PORT_SCAN_ATTEMPTS

  for (let offset = 1; offset <= maxAttempts; offset += 1) {
    const candidatePort = options.preferredPort + offset

    if (await canListenOnPort(candidatePort, options.hostname)) {
      return candidatePort
    }
  }

  throw new Error(`No available fallback server-channel port was found after ${maxAttempts} attempts starting from ${options.preferredPort + 1}.`)
}
