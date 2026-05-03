import { createCognitiveWorkspace } from '../../workspace/workspace'

const workspace = createCognitiveWorkspace()

workspace.propose({
  id: 'forbidden-owner-write',
  sourceLoop: 'system',
  kind: 'fixture',
  payload: { label: 'unauthorized write fixture' },
  createdAt: 0,
})
