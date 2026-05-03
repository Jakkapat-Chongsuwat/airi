import type { ArchitectureRuleId } from './fixture-manifest'

import {
  HEARTBEAT_INTERVAL_MS,
  LOOP_STALE_AFTER_MULTIPLIER,
  PROCESSING_BUDGET_MS,
  WORKSPACE_MAX_CHUNKS,
  WORKSPACE_MIN_CHUNKS,
} from '../constants'

/**
 * Describes which files may import a write capability from the cognition core.
 *
 * Use when:
 * - The architecture scanner checks single-writer boundaries
 * - A new write capability needs an explicit owner list
 *
 * Expects:
 * - `moduleSegment` matches the import path suffix without file extension
 * - `importNames` lists value imports, not type-only imports
 *
 * Returns:
 * - A stable owner rule for one write capability surface
 */
export interface WriteCapabilityOwnerRule {
  allowedImporters: string[]
  importNames: string[]
  moduleSegment: string
}

/**
 * Describes one blocked import pattern for the Phase A cognition slice.
 *
 * Use when:
 * - The architecture scanner checks that future cognition work stays additive
 * - A new forbidden module family needs a documented pattern
 *
 * Expects:
 * - `pattern` matches a raw module specifier string from the source file
 *
 * Returns:
 * - A named import guard with the associated rule id
 */
export interface ForbiddenImportRule {
  message: string
  pattern: RegExp
  ruleId: ArchitectureRuleId
}

/**
 * Describes which numeric literals are allowed in one file.
 *
 * Use when:
 * - The architecture scanner enforces documented scheduling and capacity numbers
 * - A constants file needs to keep a small numeric allowlist explicit
 *
 * Expects:
 * - `filePath` uses package-relative slash-separated paths
 *
 * Returns:
 * - A numeric allowlist entry for one file
 */
export interface NumericLiteralAllowlistEntry {
  allowedValues: number[]
  filePath: string
}

/**
 * Structural numeric literals that are allowed across the Phase A source tree.
 *
 * Use when:
 * - A file needs neutral sentinel values such as `0` or `1`
 * - The architecture scanner should distinguish control-flow mechanics from behavior thresholds
 *
 * Expects:
 * - These values remain limited to non-behavioral bookkeeping semantics
 *
 * Returns:
 * - The global structural numeric literal allowlist
 */
export const structuralNumericLiterals = [0, 1]

/**
 * Allowed write-capability owners for the Phase A cognition slice.
 *
 * Use when:
 * - Scanning imports that can mutate cognition-owned state
 * - Protecting the bounded workspace factory from unauthorized callers
 *
 * Expects:
 * - Any file outside `allowedImporters` importing one of `importNames` fails
 *
 * Returns:
 * - The full owner map used by the architecture scanner
 */
export const writeCapabilityOwnerRules: WriteCapabilityOwnerRule[] = [
  {
    moduleSegment: 'workspace/workspace',
    importNames: ['createCognitiveWorkspace'],
    allowedImporters: [],
  },
]

/**
 * Forbidden import patterns for the Phase A cognition slice.
 *
 * Use when:
 * - Scanning core files for provider, app-local, memory, or voice imports
 * - Verifying fixtures trigger the correct rule in the architecture suite
 *
 * Expects:
 * - The scanner tests each import source against these patterns in order
 *
 * Returns:
 * - The import guards enforced by the architecture scanner
 */
export const forbiddenImportRules: ForbiddenImportRule[] = [
  {
    ruleId: 'forbidden-import',
    pattern: /^@xsai\//,
    message: 'Phase A cognition core must not import xsAI or model-provider modules.',
  },
  {
    ruleId: 'forbidden-import',
    pattern: /(^|\/)apps\/(stage-web|stage-tamagotchi)\//,
    message: 'Phase A cognition core must not import app-local web or desktop modules.',
  },
  {
    ruleId: 'forbidden-import',
    pattern: /(^|\/)providers?\//i,
    message: 'Phase A cognition core must not import provider adapters.',
  },
  {
    ruleId: 'forbidden-import',
    pattern: /(^|\/)memory(\/|$)/i,
    message: 'Phase A cognition core must not import memory-write modules.',
  },
  {
    ruleId: 'forbidden-import',
    pattern: /(^|\/)voice(\/|$)/i,
    message: 'Phase A cognition core must not import voice runtime modules.',
  },
]

/**
 * File-specific numeric literal allowlist for the Phase A cognition slice.
 *
 * Use when:
 * - Enforcing that scheduling and capacity numbers live in documented constants
 * - Preventing accidental behavioral thresholds from appearing in runtime files
 *
 * Expects:
 * - Files omitted from this list may not contain numeric literals
 *
 * Returns:
 * - Allowed numeric literals keyed by package-relative file path
 */
export const numericLiteralAllowlist: NumericLiteralAllowlistEntry[] = [
  {
    filePath: 'src/constants.ts',
    allowedValues: [
      ...structuralNumericLiterals,
      HEARTBEAT_INTERVAL_MS,
      PROCESSING_BUDGET_MS,
      WORKSPACE_MIN_CHUNKS,
      WORKSPACE_MAX_CHUNKS,
      LOOP_STALE_AFTER_MULTIPLIER,
    ],
  },
]
