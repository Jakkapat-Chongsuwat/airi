import { AsyncLocalStorage } from 'node:async_hooks'

import { nanoid } from 'nanoid'

/** Unique identifier assigned to every emitted event. */
export type EventId = string

/** Unique identifier shared by every event in one trace tree. */
export type TraceId = string

/** Describes the component that emitted an event. */
export interface EventSource {
  /** Required source component name, such as `perception` or `reflex`. */
  readonly component: string

  /** Optional source-local identifier, such as a detector or player id. */
  readonly id?: string
}

/** Immutable event emitted through the traced cognition bus. */
export interface TracedEvent<T = unknown> {
  /** Unique event id generated at emission time. */
  readonly id: EventId

  /** Trace id inherited from the active event context or generated for a new root. */
  readonly traceId: TraceId

  /** Parent event id when this event is emitted while handling another event. */
  readonly parentId?: EventId

  /** Event type string matched by exact and `:*` subscription patterns. */
  readonly type: string

  /** Frozen event payload supplied by the emitter. */
  readonly payload: Readonly<T>

  /** Epoch timestamp captured when the event is emitted. */
  readonly timestamp: number

  /** Frozen event source metadata. */
  readonly source: EventSource
}

/** Input used to create a traced event. */
export interface EventInput<T = unknown> {
  /** Event type string matched by subscribers. */
  readonly type: string

  /** Payload to freeze and attach to the event. */
  readonly payload: Readonly<T>

  /** Source metadata for the event emitter. */
  readonly source: EventSource

  /** Optional trace id for explicit root or propagated events. */
  readonly traceId?: string

  /** Optional parent event id when trace context is supplied manually. */
  readonly parentId?: string
}

/** Subscriber callback invoked synchronously during event dispatch. */
export type EventHandler<T = unknown> = (event: TracedEvent<T>) => void

/** Function returned by subscriptions to detach the handler. */
export type Unsubscribe = () => void

/** Exact event type, prefix wildcard such as `signal:*`, or global `*`. */
export type EventPattern = string

/** Error record reported when a subscriber throws during dispatch. */
export interface EventBusSubscriberError {
  /** Event being dispatched when the subscriber failed. */
  readonly event: TracedEvent

  /** Subscription pattern that matched the failing handler. */
  readonly pattern: EventPattern

  /** Unknown error thrown by the subscriber. */
  readonly error: unknown
}

/** Options for creating a traced event bus. */
export interface EventBusOptions {
  /**
   * Optional subscriber error reporter.
   *
   * @default defaultSubscriberErrorReporter
   */
  readonly onSubscriberError?: (error: EventBusSubscriberError) => void
}

interface TraceContext {
  traceId: string
  parentId?: string
}

interface Subscription {
  pattern: EventPattern
  handler: EventHandler
}

const traceStorage = new AsyncLocalStorage<TraceContext>()

function generateEventId(): string {
  return nanoid(12)
}

function generateTraceId(): string {
  return nanoid(16)
}

function matchesPattern(pattern: EventPattern, eventType: string): boolean {
  if (pattern === '*')
    return true

  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1)
    return eventType.startsWith(prefix)
  }

  return pattern === eventType
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value))
    return value

  if (Array.isArray(value)) {
    for (const item of value)
      deepFreeze(item)
    return Object.freeze(value)
  }

  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child)

  return Object.freeze(value)
}

function resolveTraceContext(input: Pick<EventInput, 'traceId' | 'parentId'>): TraceContext {
  if (input.traceId) {
    return Object.freeze({
      traceId: input.traceId,
      parentId: input.parentId,
    })
  }

  const inherited = traceStorage.getStore()
  if (inherited) {
    return Object.freeze({
      traceId: inherited.traceId,
      parentId: inherited.parentId,
    })
  }

  return Object.freeze({ traceId: generateTraceId() })
}

function withTraceContext<T>(traceId: string, parentId: string, fn: () => T): T {
  return traceStorage.run({ traceId, parentId }, fn)
}

function defaultSubscriberErrorReporter(error: EventBusSubscriberError): void {
  console.error(
    `[EventBus] subscriber failed for event "${error.event.type}" (pattern: "${error.pattern}")`,
    error.error,
  )
}

/**
 * Dispatches immutable traced events to exact and wildcard subscribers.
 *
 * Use when:
 * - A local runtime needs synchronous event routing with trace propagation
 * - Subscriber errors must be isolated from the rest of dispatch
 *
 * Expects:
 * - Subscriber handlers are synchronous and should not mutate event payloads
 * - Event patterns are exact strings, `prefix:*`, or `*`
 *
 * Returns:
 * - Emitted events with frozen payloads and inherited trace context
 */
export class EventBus {
  private readonly subscriptions = new Map<number, Subscription>()
  private readonly onSubscriberError: (error: EventBusSubscriberError) => void
  private nextSubId = 0

  public constructor(options: EventBusOptions = {}) {
    this.onSubscriberError = options.onSubscriberError ?? defaultSubscriberErrorReporter
  }

  public emit<T>(input: EventInput<T>): TracedEvent<T> {
    const trace = resolveTraceContext({
      traceId: input.traceId,
      parentId: input.parentId,
    })

    const event = deepFreeze({
      id: generateEventId(),
      traceId: trace.traceId,
      parentId: trace.parentId,
      type: input.type,
      payload: input.payload,
      timestamp: Date.now(),
      source: input.source,
    } satisfies TracedEvent<T>)

    this.dispatch(event)
    return event
  }

  public emitChild<T>(
    parent: TracedEvent,
    input: Omit<EventInput<T>, 'traceId' | 'parentId'>,
  ): TracedEvent<T> {
    return this.emit({
      ...input,
      traceId: parent.traceId,
      parentId: parent.id,
    })
  }

  public subscribe<T = unknown>(
    pattern: EventPattern,
    handler: EventHandler<T>,
  ): Unsubscribe {
    const id = this.nextSubId++
    this.subscriptions.set(id, {
      pattern,
      handler: handler as EventHandler,
    })

    return () => {
      this.subscriptions.delete(id)
    }
  }

  private dispatch(event: TracedEvent): void {
    for (const sub of this.subscriptions.values()) {
      if (!matchesPattern(sub.pattern, event.type))
        continue

      try {
        withTraceContext(event.traceId, event.id, () => {
          sub.handler(event)
        })
      }
      catch (error) {
        try {
          this.onSubscriberError({
            event,
            pattern: sub.pattern,
            error,
          })
        }
        catch (reporterError) {
          defaultSubscriberErrorReporter({
            event,
            pattern: sub.pattern,
            error: reporterError,
          })
        }
      }
    }
  }
}

/**
 * Creates a traced event bus.
 *
 * Use when:
 * - A consumer needs the extracted cognition event primitive
 * - Subscriber failures should be reported without stopping dispatch
 *
 * Expects:
 * - Optional error reporter accepts unknown subscriber errors
 *
 * Returns:
 * - A new isolated {@link EventBus} instance
 */
export function createEventBus(options: EventBusOptions = {}): EventBus {
  return new EventBus(options)
}
