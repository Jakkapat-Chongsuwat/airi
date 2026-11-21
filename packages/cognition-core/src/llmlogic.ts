import type { Message } from '@xsai/shared-chat'

/** LLM trace metadata emitted by consumers that call a model. */
export interface LLMTraceData {
  /** Logical route or call site for the model call. */
  route: string

  /** Messages sent to the model. */
  messages: Message[]

  /** Text content returned by the model. */
  content: string

  /** Optional reasoning returned by providers that expose it. */
  reasoning?: string

  /** Provider-specific token or usage metadata. */
  usage: unknown

  /** Model identifier used for the call. */
  model: string

  /** Call duration in milliseconds. */
  duration: number
}

/** Decision returned by retry classification helpers. */
export interface RetryDecision {
  /** Whether the caller should retry the failed operation. */
  shouldRetry: boolean

  /** Retry attempts that remained when the decision was made. */
  remainingAttempts: number
}

/**
 * Builds system and user messages for an LLM call.
 *
 * Use when:
 * - A consumer has a single system prompt and single user payload
 * - Message ordering must remain system first, user second
 *
 * Expects:
 * - Both arguments are already formatted for prompt use
 *
 * Returns:
 * - Two chat messages in provider-compatible order
 */
export function buildMessages(sysPrompt: string, userMsg: string): Message[] {
  return [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: userMsg },
  ]
}

/**
 * Converts unknown thrown values to a readable message.
 *
 * Use when:
 * - Catch blocks need a stable message from arbitrary thrown values
 * - Error-like objects may expose a string `message` property
 *
 * Expects:
 * - Input may be any JavaScript value
 *
 * Returns:
 * - A best-effort string representation
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  if (typeof err === 'string')
    return err
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string')
    return err.message
  try {
    return JSON.stringify(err)
  }
  catch {
    return String(err)
  }
}

/**
 * Reads an HTTP status from common error shapes.
 *
 * Use when:
 * - Provider errors may store status at `status`, `response.status`, or `cause.status`
 *
 * Expects:
 * - Input may be any thrown value
 *
 * Returns:
 * - The numeric status when present
 */
export function getErrorStatus(err: unknown): number | undefined {
  const status = readErrorProperty(err, 'status')
    ?? readNestedErrorProperty(err, ['response', 'status'])
    ?? readNestedErrorProperty(err, ['cause', 'status'])
  return typeof status === 'number' ? status : undefined
}

/**
 * Reads an error code from common error shapes.
 *
 * Use when:
 * - Provider or network errors may store code at `code` or `cause.code`
 *
 * Expects:
 * - Input may be any thrown value
 *
 * Returns:
 * - The string code when present
 */
export function getErrorCode(err: unknown): string | undefined {
  const code = readErrorProperty(err, 'code') ?? readNestedErrorProperty(err, ['cause', 'code'])
  return typeof code === 'string' ? code : undefined
}

/**
 * Classifies auth and bad-argument failures that should not be retried.
 *
 * Use when:
 * - A retry loop needs to stop for invalid credentials or invalid requests
 *
 * Expects:
 * - Input may be an error object, string, or provider response wrapper
 *
 * Returns:
 * - `true` for likely auth or bad argument failures
 */
export function isLikelyAuthOrBadArgError(err: unknown): boolean {
  const msg = toErrorMessage(err).toLowerCase()
  const status = getErrorStatus(err)
  if (status === 401 || status === 403)
    return true

  return (
    msg.includes('unauthorized')
    || msg.includes('invalid api key')
    || msg.includes('authentication')
    || msg.includes('forbidden')
    || msg.includes('badarg')
    || msg.includes('bad arg')
    || msg.includes('invalid argument')
    || msg.includes('invalid_request_error')
  )
}

/**
 * Classifies provider rate-limit failures.
 *
 * Use when:
 * - A retry loop or log entry needs to separate quota failures from other errors
 *
 * Expects:
 * - Input may include HTTP status, code, or textual provider details
 *
 * Returns:
 * - `true` for likely rate-limit failures
 */
export function isRateLimitError(err: unknown): boolean {
  const status = getErrorStatus(err)
  if (status === 429)
    return true
  const code = getErrorCode(err)
  if (code === 'token_quota_exceeded')
    return true
  const msg = toErrorMessage(err).toLowerCase()
  return (
    msg.includes('rate limit')
    || msg.includes('too many requests')
    || msg.includes('token quota')
    || msg.includes('token_quota_exceeded')
    || msg.includes('tokens per minute')
    || msg.includes('too many tokens')
    || msg.includes('429 response')
  )
}

/**
 * Classifies failures that are likely worth retrying.
 *
 * Use when:
 * - A retry loop needs a conservative recovery signal
 *
 * Expects:
 * - Input may be syntax, network, provider, or text-only error data
 *
 * Returns:
 * - `true` for transient or reparsable failures
 */
export function isLikelyRecoverableError(err: unknown): boolean {
  if (err instanceof SyntaxError)
    return true

  const status = getErrorStatus(err)
  if (status === 429)
    return true
  if (typeof status === 'number' && status >= 500)
    return true

  const code = getErrorCode(err)
  if (code && ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code))
    return true

  const msg = toErrorMessage(err).toLowerCase()
  return (
    msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('rate limit')
    || msg.includes('token quota')
    || msg.includes('token_quota_exceeded')
    || msg.includes('tokens per minute')
    || msg.includes('too many tokens')
    || msg.includes('overloaded')
    || msg.includes('temporarily')
    || msg.includes('try again')
    || (msg.includes('in json') && msg.includes('position'))
  )
}

/**
 * Decides whether an error should be retried.
 *
 * Use when:
 * - Retry loops need to combine remaining attempt count with error classification
 *
 * Expects:
 * - `remainingAttempts` is the number of attempts left after the current failure
 *
 * Returns:
 * - A retry decision preserving the supplied remaining-attempt count
 */
export function shouldRetryError(err: unknown, remainingAttempts: number): RetryDecision {
  const shouldRetry = remainingAttempts > 0 && !isLikelyAuthOrBadArgError(err) && isLikelyRecoverableError(err)
  return {
    shouldRetry,
    remainingAttempts,
  }
}

/**
 * Normalizes an LLM response into a JSON candidate string.
 *
 * Before:
 * - "```json\n{\"ok\":true}\n```"
 * - "Here: {\"ok\":true}"
 *
 * After:
 * - "{\"ok\":true}"
 */
export function extractJsonCandidate(input: string): string {
  const trimmed = input.trim()
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  const fenced = trimmed.match(/^```(?:json)?[^\S\r\n]*\r?\n?([\s\S]*?)\r?\n?```$/i)
  if (fenced?.[1])
    return fenced[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start)
    return trimmed.slice(start, end + 1)

  return trimmed
}

/**
 * Parses a JSON object from an LLM response.
 *
 * Use when:
 * - Model output may be fenced, prefixed, or already raw JSON
 *
 * Expects:
 * - The response contains one JSON value or should fail with a contextual snippet
 *
 * Returns:
 * - Parsed JSON typed by the caller
 */
export function parseLLMResponseJson<T>(response: string): T {
  const candidate = extractJsonCandidate(response)
  try {
    return JSON.parse(candidate) as T
  }
  catch (err) {
    const pos = getJsonErrorPosition(err)
    const window = 120
    const snippet = (typeof pos === 'number')
      ? candidate.slice(Math.max(0, pos - window), Math.min(candidate.length, pos + window))
      : candidate.slice(0, Math.min(candidate.length, 240))
    throw new Error(`Failed to parse LLM JSON response: ${toErrorMessage(err)}; snippet=${JSON.stringify(snippet)}`)
  }
}

/**
 * Waits for the requested number of milliseconds.
 *
 * Use when:
 * - Retry or backoff code needs an awaitable timer
 *
 * Expects:
 * - `ms` is the delay passed to `setTimeout`
 *
 * Returns:
 * - A promise that resolves after the timeout fires
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readErrorProperty(err: unknown, key: string): unknown {
  if (err === null || typeof err !== 'object' || !(key in err))
    return undefined

  return err[key as keyof typeof err]
}

function readNestedErrorProperty(err: unknown, keys: string[]): unknown {
  let current: unknown = err
  for (const key of keys) {
    current = readErrorProperty(current, key)
    if (current === undefined)
      return undefined
  }

  return current
}

function getJsonErrorPosition(err: unknown): number | null {
  const msg = toErrorMessage(err)
  const match = msg.match(/position\s+(\d+)/i)
  if (!match)
    return null

  const pos = Number.parseInt(match[1], 10)
  return Number.isFinite(pos) ? pos : null
}
