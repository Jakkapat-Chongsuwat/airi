import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildMessages,
  extractJsonCandidate,
  getErrorCode,
  getErrorStatus,
  isLikelyAuthOrBadArgError,
  isLikelyRecoverableError,
  isRateLimitError,
  parseLLMResponseJson,
  shouldRetryError,
  sleep,
  toErrorMessage,
} from './llmlogic'

describe('llm helper logic', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds system and user messages in provider order', () => {
    expect(buildMessages('system prompt', 'user message')).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'user message' },
    ])
  })

  it('converts unknown error shapes to readable messages', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(toErrorMessage(new Error('boom'))).toBe('boom')
    expect(toErrorMessage('plain')).toBe('plain')
    expect(toErrorMessage({ message: 'object message' })).toBe('object message')
    expect(toErrorMessage({ code: 'OTHER' })).toBe('{"code":"OTHER"}')
    expect(toErrorMessage(circular)).toBe('[object Object]')
  })

  it('reads status and code from direct, response, and cause error shapes', () => {
    expect(getErrorStatus({ status: 429 })).toBe(429)
    expect(getErrorStatus({ response: { status: 500 } })).toBe(500)
    expect(getErrorStatus({ cause: { status: 403 } })).toBe(403)
    expect(getErrorStatus({ status: '429' })).toBeUndefined()
    expect(getErrorCode({ code: 'ETIMEDOUT' })).toBe('ETIMEDOUT')
    expect(getErrorCode({ cause: { code: 'ECONNRESET' } })).toBe('ECONNRESET')
  })

  it('classifies auth, rate-limit, and recoverable errors', () => {
    expect(isLikelyAuthOrBadArgError({ status: 401 })).toBe(true)
    expect(isLikelyAuthOrBadArgError(new Error('invalid api key'))).toBe(true)
    expect(isLikelyAuthOrBadArgError({ status: 429 })).toBe(false)

    expect(isRateLimitError({ status: 429 })).toBe(true)
    expect(isRateLimitError({ code: 'token_quota_exceeded' })).toBe(true)
    expect(isRateLimitError(new Error('too many tokens'))).toBe(true)

    expect(isLikelyRecoverableError(new SyntaxError('Unexpected token in JSON at position 5'))).toBe(true)
    expect(isLikelyRecoverableError({ status: 503 })).toBe(true)
    expect(isLikelyRecoverableError({ code: 'ECONNREFUSED' })).toBe(true)
  })

  it('combines attempts and classification into retry decisions', () => {
    expect(shouldRetryError({ status: 503 }, 2)).toEqual({ shouldRetry: true, remainingAttempts: 2 })
    expect(shouldRetryError({ status: 503 }, 0)).toEqual({ shouldRetry: false, remainingAttempts: 0 })
    expect(shouldRetryError({ status: 401 }, 2)).toEqual({ shouldRetry: false, remainingAttempts: 2 })
  })

  it('normalizes fenced, embedded, and raw JSON candidates', () => {
    expect(extractJsonCandidate('```json\n{"ok":true}\n```')).toBe('{"ok":true}')
    expect(extractJsonCandidate('Result: {"ok":true} done')).toBe('{"ok":true}')
    expect(extractJsonCandidate('  [1,2,3]  ')).toBe('[1,2,3]')
  })

  it('parses normalized JSON and reports contextual failures', () => {
    expect(parseLLMResponseJson<{ ok: boolean }>('```json\n{"ok":true}\n```')).toEqual({ ok: true })

    expect(() => parseLLMResponseJson('{"ok":')).toThrow(/Failed to parse LLM JSON response:/)
    expect(() => parseLLMResponseJson('{"ok":')).toThrow(/snippet=/)
  })

  it('resolves sleep after the requested timeout', async () => {
    vi.useFakeTimers()
    let resolved = false
    const promise = sleep(25).then(() => {
      resolved = true
    })

    await vi.advanceTimersByTimeAsync(24)
    expect(resolved).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await promise
    expect(resolved).toBe(true)
  })
})
