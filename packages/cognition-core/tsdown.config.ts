import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/event-bus.ts',
    'src/llm-log.ts',
    'src/llmlogic.ts',
  ],
  dts: true,
})
