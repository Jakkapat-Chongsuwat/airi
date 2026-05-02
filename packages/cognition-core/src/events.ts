import type { WorkspaceTickEvent } from './types'

import { defineEventa } from '@moeru/eventa'

/**
 * Shared Eventa contract for cognition heartbeat publication.
 *
 * Use when:
 * - Publishing heartbeat events from the core scheduler
 * - Subscribing to cognition heartbeat updates from shared UI state
 *
 * Expects:
 * - The same event definition to be imported by both publishers and consumers
 *
 * Returns:
 * - A typed Eventa definition for `WorkspaceTickEvent`
 */
export const workspaceTickEvent = defineEventa<WorkspaceTickEvent>('cognition:workspace:tick')
