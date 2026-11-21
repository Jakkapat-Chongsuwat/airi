import { createEventBus, EventBus } from '@proj-airi/cognition-core/event-bus'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CognitiveEngine } from './index'

const mocks = vi.hoisted(() => {
  const debugService = {
    onCommand: vi.fn(),
    emit: vi.fn(),
  }
  const mcpStart = vi.fn()
  const mcpStop = vi.fn()
  const mcpReplServer = vi.fn(function MockMcpReplServer(this: { start: () => void, stop: () => void }) {
    this.start = mcpStart
    this.stop = mcpStop
  })

  return {
    config: { debug: { mcp: false } },
    createAgentContainer: vi.fn(),
    debugService,
    getDebugService: vi.fn(() => debugService),
    mcpReplServer,
    mcpStart,
    mcpStop,
  }
})

vi.mock('../composables/config', () => ({
  config: mocks.config,
}))

vi.mock('../debug', () => ({
  DebugService: {
    getInstance: mocks.getDebugService,
  },
}))

vi.mock('../debug/mcp-repl-server', () => ({
  McpReplServer: mocks.mcpReplServer,
}))

vi.mock('./container', () => ({
  createAgentContainer: mocks.createAgentContainer,
}))

function createContainerHarness(order: string[]) {
  const eventBus = createEventBus()
  vi.spyOn(eventBus, 'emit')

  const services = {
    perceptionPipeline: {
      init: vi.fn(() => order.push('perceptionPipeline.init')),
      destroy: vi.fn(() => order.push('perceptionPipeline.destroy')),
    },
    brain: {
      init: vi.fn(() => order.push('brain.init')),
      destroy: vi.fn(() => order.push('brain.destroy')),
      getReplState: vi.fn(() => ({ variables: [], updatedAt: Date.now(), paused: false })),
      broadcastConversationState: vi.fn(),
      executeDebugRepl: vi.fn(async () => ({ source: 'manual', code: '', logs: [], actions: [], durationMs: 0, timestamp: Date.now() })),
      togglePaused: vi.fn(() => true),
    },
    reflexManager: {
      init: vi.fn(() => order.push('reflexManager.init')),
      destroy: vi.fn(() => order.push('reflexManager.destroy')),
    },
    taskExecutor: {
      setMineflayer: vi.fn(() => order.push('taskExecutor.setMineflayer')),
      initialize: vi.fn(async () => order.push('taskExecutor.initialize')),
      destroy: vi.fn(async () => order.push('taskExecutor.destroy')),
    },
    airiBridge: {
      init: vi.fn(() => order.push('airiBridge.init')),
      destroy: vi.fn(() => order.push('airiBridge.destroy')),
    },
    minecraftContextService: {
      init: vi.fn(() => order.push('minecraftContextService.init')),
      destroy: vi.fn(() => order.push('minecraftContextService.destroy')),
    },
    ruleEngine: {
      destroy: vi.fn(() => order.push('ruleEngine.destroy')),
    },
    eventBus,
  }

  const container = {
    resolve: vi.fn((name: keyof typeof services) => {
      if (name === 'ruleEngine')
        order.push('ruleEngine.resolve')
      return services[name]
    }),
  }

  return { container, services }
}

function createBotHarness(order: string[], options: { hasEntity?: boolean } = {}) {
  const chatHandlers: Array<(username: string, message: string) => void> = []
  const spawnHandlers: Array<() => void> = []
  const bot = {
    username: 'AiriBot',
    bot: {
      entity: options.hasEntity === false ? null : { id: 1 },
      on: vi.fn((event: string, handler: (username: string, message: string) => void) => {
        if (event === 'chat') {
          order.push('bot.chat.on')
          chatHandlers.push(handler)
        }
      }),
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'spawn') {
          order.push('bot.spawn.once')
          spawnHandlers.push(handler)
        }
      }),
      off: vi.fn((event: string, handler: () => void) => {
        if (event === 'spawn' && spawnHandlers.includes(handler))
          order.push('bot.spawn.off')
      }),
      removeAllListeners: vi.fn((event: string) => {
        if (event === 'chat')
          order.push('bot.chat.removeAllListeners')
      }),
      chat: vi.fn(),
    },
    onTick: vi.fn((event: string) => {
      if (event === 'tick')
        order.push('bot.onTick')
    }),
  }

  return { bot: bot as any, chatHandlers, spawnHandlers }
}

describe('cognitiveEngine characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.config.debug.mcp = false
  })

  it('starts the current cognitive layers in order when the bot already has an entity', async () => {
    const order: string[] = []
    const { container, services } = createContainerHarness(order)
    mocks.createAgentContainer.mockReturnValue(container)
    const { bot } = createBotHarness(order)

    await CognitiveEngine({ airiClient: {} as any }).created!(bot)

    expect(order).toEqual([
      'airiBridge.init',
      'minecraftContextService.init',
      'taskExecutor.setMineflayer',
      'taskExecutor.initialize',
      'reflexManager.init',
      'brain.init',
      'ruleEngine.resolve',
      'perceptionPipeline.init',
      'bot.onTick',
      'bot.chat.on',
    ])
    expect(services.taskExecutor.setMineflayer).toHaveBeenCalledWith(bot)
    expect(bot.reflexManager).toBe(services.reflexManager)
    expect(mocks.debugService.onCommand).toHaveBeenCalledWith('request_repl_state', expect.any(Function))
    expect(mocks.debugService.onCommand).toHaveBeenCalledWith('request_conversation', expect.any(Function))
    expect(mocks.debugService.onCommand).toHaveBeenCalledWith('execute_repl', expect.any(Function))
  })

  it('defers cognitive layer startup until spawn when the bot entity is not ready', async () => {
    const order: string[] = []
    const { container, services } = createContainerHarness(order)
    mocks.createAgentContainer.mockReturnValue(container)
    const { bot, spawnHandlers } = createBotHarness(order, { hasEntity: false })

    await CognitiveEngine({ airiClient: {} as any }).created!(bot)

    expect(order).toEqual([
      'airiBridge.init',
      'minecraftContextService.init',
      'taskExecutor.setMineflayer',
      'taskExecutor.initialize',
      'bot.spawn.once',
    ])
    expect(services.reflexManager.init).not.toHaveBeenCalled()
    expect(services.brain.init).not.toHaveBeenCalled()

    bot.bot.entity = { id: 1 }
    spawnHandlers[0]?.()
    spawnHandlers[0]?.()

    expect(services.reflexManager.init).toHaveBeenCalledTimes(1)
    expect(services.brain.init).toHaveBeenCalledTimes(1)
    expect(services.perceptionPipeline.init).toHaveBeenCalledTimes(1)
  })

  it('bridges non-bot chat into signal events and handles pause locally', async () => {
    const order: string[] = []
    const { container, services } = createContainerHarness(order)
    mocks.createAgentContainer.mockReturnValue(container)
    const { bot, chatHandlers } = createBotHarness(order)

    await CognitiveEngine({ airiClient: {} as any }).created!(bot)

    chatHandlers[0]?.('AiriBot', 'hello from self')
    chatHandlers[0]?.('Alex', 'hello airi')
    chatHandlers[0]?.('Alex', '!pause')

    expect(services.eventBus.emit).toHaveBeenCalledTimes(1)
    expect(services.eventBus).toBeInstanceOf(EventBus)
    expect(services.eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'signal:chat_message',
      payload: expect.objectContaining({
        type: 'chat_message',
        description: 'Chat from Alex: "hello airi"',
        metadata: { username: 'Alex', message: 'hello airi' },
      }),
      source: { component: 'perception', id: 'chat' },
    }))
    expect(services.brain.togglePaused).toHaveBeenCalledTimes(1)
    expect(bot.bot.chat).toHaveBeenCalledWith('[debug] Cognitive engine paused (by Alex).')
  })

  it('tears down MCP, services, spawn handlers, and chat listeners in the current cleanup order', async () => {
    const order: string[] = []
    const { container, services } = createContainerHarness(order)
    mocks.config.debug.mcp = true
    mocks.createAgentContainer.mockReturnValue(container)
    const { bot } = createBotHarness(order, { hasEntity: false })
    const engine = CognitiveEngine({ airiClient: {} as any })

    await engine.created!(bot)
    await engine.beforeCleanup!(bot)

    expect(mocks.mcpReplServer).toHaveBeenCalledWith(services.brain)
    expect(mocks.mcpStart).toHaveBeenCalledTimes(1)
    expect(mocks.mcpStop).toHaveBeenCalledTimes(1)
    expect(order.slice(order.indexOf('minecraftContextService.destroy'))).toEqual([
      'minecraftContextService.destroy',
      'airiBridge.destroy',
      'brain.destroy',
      'taskExecutor.destroy',
      'perceptionPipeline.destroy',
      'ruleEngine.resolve',
      'ruleEngine.destroy',
      'reflexManager.destroy',
      'bot.spawn.off',
      'bot.chat.removeAllListeners',
    ])
  })
})
