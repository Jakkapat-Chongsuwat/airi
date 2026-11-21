import type { TracedEvent } from './event-bus'

import { describe, expect, it, vi } from 'vitest'

import { createEventBus } from './event-bus'

describe('eventBus', () => {
  const createTestBus = () => createEventBus()

  describe('emit', () => {
    it('should create an event with auto-generated id and timestamp', () => {
      const bus = createTestBus()

      const event = bus.emit({
        type: 'test:event',
        payload: { foo: 'bar' },
        traceId: 'trace-1',
        source: { component: 'test' },
      })

      expect(event.id).toBeDefined()
      expect(event.id.length).toBe(12)
      expect(event.traceId).toBe('trace-1')
      expect(event.type).toBe('test:event')
      expect(event.payload).toEqual({ foo: 'bar' })
      expect(event.timestamp).toBeGreaterThan(0)
    })

    it('should generate traceId if not provided', () => {
      const bus = createTestBus()

      const event = bus.emit({
        type: 'test:event',
        payload: {},
        source: { component: 'test' },
      })

      expect(event.traceId).toBeDefined()
      expect(event.traceId.length).toBe(16)
    })

    it('should freeze the event and nested payload objects', () => {
      const bus = createTestBus()

      const event = bus.emit({
        type: 'test:event',
        payload: {
          level1: {
            level2: {
              value: 42,
            },
          },
          array: [{ item: 1 }, { item: 2 }],
        },
        source: { component: 'test' },
      })

      expect(Object.isFrozen(event)).toBe(true)
      expect(Object.isFrozen(event.payload)).toBe(true)
      expect(Object.isFrozen(event.source)).toBe(true)
      expect(Object.isFrozen(event.payload.level1)).toBe(true)
      expect(Object.isFrozen(event.payload.level1.level2)).toBe(true)
      expect(Object.isFrozen(event.payload.array)).toBe(true)
      expect(Object.isFrozen(event.payload.array[0])).toBe(true)
    })
  })

  describe('emitChild', () => {
    it('should inherit traceId and set parentId', () => {
      const bus = createTestBus()

      const parent = bus.emit({
        type: 'parent:event',
        payload: {},
        source: { component: 'test' },
      })

      const child = bus.emitChild(parent, {
        type: 'child:event',
        payload: { derived: true },
        source: { component: 'test' },
      })

      expect(child.traceId).toBe(parent.traceId)
      expect(child.parentId).toBe(parent.id)
    })
  })

  describe('subscribe', () => {
    it('should call handler for matching events', () => {
      const bus = createTestBus()
      const handler = vi.fn()

      bus.subscribe('test:event', handler)
      bus.emit({
        type: 'test:event',
        payload: { data: 123 },
        source: { component: 'test' },
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].payload).toEqual({ data: 123 })
    })

    it('should support wildcard patterns', () => {
      const bus = createTestBus()
      const handler = vi.fn()

      bus.subscribe('raw:*', handler)

      bus.emit({
        type: 'raw:sighted:punch',
        payload: {},
        source: { component: 'test' },
      })
      bus.emit({
        type: 'raw:heard:sound',
        payload: {},
        source: { component: 'test' },
      })
      bus.emit({
        type: 'signal:attention',
        payload: {},
        source: { component: 'test' },
      })

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('delivers one traced event to exact, prefix wildcard, and global wildcard subscribers in order', () => {
      const bus = createTestBus()
      const delivered: Array<{ pattern: string, event: TracedEvent<{ step: number }> }> = []

      bus.subscribe<{ step: number }>('signal:chat_message', event => delivered.push({ pattern: 'exact', event }))
      bus.subscribe<{ step: number }>('signal:*', event => delivered.push({ pattern: 'signal:*', event }))
      bus.subscribe<{ step: number }>('*', event => delivered.push({ pattern: '*', event }))

      const event = bus.emit({
        type: 'signal:chat_message',
        payload: { step: 1 },
        traceId: 'trace-characterization',
        source: { component: 'perception', id: 'chat' },
      })

      expect(delivered.map(item => item.pattern)).toEqual(['exact', 'signal:*', '*'])
      expect(delivered.every(item => item.event === event)).toBe(true)
      expect(delivered.every(item => item.event.traceId === 'trace-characterization')).toBe(true)
    })

    it('should return unsubscribe function', () => {
      const bus = createTestBus()
      const handler = vi.fn()

      const unsub = bus.subscribe('test:*', handler)

      bus.emit({
        type: 'test:one',
        payload: {},
        source: { component: 'test' },
      })
      expect(handler).toHaveBeenCalledTimes(1)

      unsub()

      bus.emit({
        type: 'test:two',
        payload: {},
        source: { component: 'test' },
      })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('should report subscriber errors while keeping dispatch resilient', () => {
      const onSubscriberError = vi.fn()
      const bus = createEventBus({ onSubscriberError })
      const healthyHandler = vi.fn()
      const subscriberError = new Error('subscriber failed')

      bus.subscribe('test:event', () => {
        throw subscriberError
      })
      bus.subscribe('test:event', healthyHandler)

      const emittedEvent = bus.emit({
        type: 'test:event',
        payload: { value: 1 },
        source: { component: 'test' },
      })

      expect(healthyHandler).toHaveBeenCalledTimes(1)
      expect(onSubscriberError).toHaveBeenCalledTimes(1)
      expect(onSubscriberError).toHaveBeenCalledWith({
        event: emittedEvent,
        pattern: 'test:event',
        error: subscriberError,
      })
    })

    it('keeps dispatch resilient when the subscriber error reporter also fails', () => {
      const reporterError = new Error('reporter failed')
      const onSubscriberError = vi.fn(() => {
        throw reporterError
      })
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const bus = createEventBus({ onSubscriberError })
      const healthyHandler = vi.fn()

      bus.subscribe('test:event', () => {
        throw new Error('subscriber failed')
      })
      bus.subscribe('test:event', healthyHandler)

      bus.emit({
        type: 'test:event',
        payload: {},
        source: { component: 'test' },
      })

      expect(healthyHandler).toHaveBeenCalledTimes(1)
      expect(onSubscriberError).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledTimes(1)

      consoleError.mockRestore()
    })
  })

  describe('trace context propagation', () => {
    it('should propagate trace context in handlers', () => {
      const bus = createTestBus()
      let childEvent: TracedEvent | undefined

      bus.subscribe('parent:event', () => {
        childEvent = bus.emit({
          type: 'child:event',
          payload: {},
          source: { component: 'handler' },
        })
      })

      const parent = bus.emit({
        type: 'parent:event',
        payload: {},
        source: { component: 'test' },
      })

      expect(childEvent).toBeDefined()
      expect(childEvent!.traceId).toBe(parent.traceId)
      expect(childEvent!.parentId).toBe(parent.id)
    })

    it('uses the handling event as parent context for nested wildcard emissions', () => {
      const bus = createTestBus()
      let childEvent: TracedEvent | undefined

      bus.subscribe('signal:*', () => {
        childEvent = bus.emit({
          type: 'conscious:signal:chat_message',
          payload: {},
          source: { component: 'reflex', id: 'reflexManager' },
        })
      })

      const parent = bus.emit({
        type: 'signal:chat_message',
        payload: {},
        source: { component: 'perception', id: 'chat' },
      })

      expect(childEvent).toBeDefined()
      expect(childEvent!.traceId).toBe(parent.traceId)
      expect(childEvent!.parentId).toBe(parent.id)
    })
  })
})
