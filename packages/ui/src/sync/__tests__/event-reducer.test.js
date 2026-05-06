import { describe, expect, it } from 'bun:test'
import { applyDirectoryEvent } from '../event-reducer'
import { INITIAL_STATE } from '../types'

describe('applyDirectoryEvent', () => {
  it('does not duplicate overlapping delta text after a newer part.updated replaces an older one', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-1'
    const partID = 'part-1'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'Fix typo in ToolOutputDialog — ',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'Fix typo in ToolOutputDialog — toolFailedToReadDiagram vs toolFailedReadDiagram • Let me fix it.',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: {
        messageID,
        partID,
        field: 'text',
        delta: 'toolFailedToReadDiagram vs toolFailedReadDiagram • Let me fix it.',
      },
    })

    expect(state.part[messageID]).toHaveLength(1)
    expect(state.part[messageID]?.[0]?.text).toBe(
      'Fix typo in ToolOutputDialog — toolFailedToReadDiagram vs toolFailedReadDiagram • Let me fix it.',
    )
  })

  it('appends only the non-overlapping suffix of a streaming delta', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-2'
    const partID = 'part-2'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'toolFailedToReadDiagram vs toolFailedRead',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'toolFailedToReadDiagram vs toolFailedReadDiagra',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: {
        messageID,
        partID,
        field: 'text',
        delta: 'Diagram • Let me fix it.',
      },
    })

    expect(state.part[messageID]?.[0]?.text).toBe(
      'toolFailedToReadDiagram vs toolFailedReadDiagram • Let me fix it.',
    )
  })

  it('appends a non-overlapping delta unchanged', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-3'
    const partID = 'part-3'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'PR comment done — ',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: {
        messageID,
        partID,
        field: 'text',
        delta: 'Let me fix it.',
      },
    })

    expect(state.part[messageID]?.[0]?.text).toBe('PR comment done — Let me fix it.')
  })

  it('preserves legitimate repeated output when no updated-to-delta dedupe window is active', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-4'
    const partID = 'part-4'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'ha',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: {
        messageID,
        partID,
        field: 'text',
        delta: 'ha',
      },
    })

    expect(state.part[messageID]?.[0]?.text).toBe('haha')
  })

  it('does not let a stale running tool update overwrite a completed tool part', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-5'
    const partID = 'part-5'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'tool',
          messageID,
          tool: 'apply_patch',
          state: {
            status: 'completed',
            time: {
              start: 10,
              end: 20,
            },
          },
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'tool',
          messageID,
          tool: 'apply_patch',
          state: {
            status: 'running',
            time: {
              start: 10,
            },
          },
        },
      },
    })

    expect(state.part[messageID]?.[0]?.state?.status).toBe('completed')
    expect(state.part[messageID]?.[0]?.state?.time?.end).toBe(20)
  })

  // RC-1: Orphan delta arriving before its parent part must not be dropped.
  it('replays a buffered orphan delta when the matching part.updated arrives', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-orphan'
    const partID = 'part-orphan'

    // Delta arrives first (race) — must be buffered, not dropped.
    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: { messageID, partID, field: 'text', delta: 'Hello' },
    })

    // No part yet, but buffer should hold the delta.
    expect(state.part[messageID]).toBeUndefined()
    expect(state.partDeltaBuffer[messageID]?.[partID]).toHaveLength(1)

    // Part arrives — delta should be replayed onto it.
    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: { id: partID, type: 'text', messageID, text: '' },
      },
    })

    expect(state.part[messageID]?.[0]?.text).toBe('Hello')
    expect(state.partDeltaBuffer[messageID]).toBeUndefined()
  })

  it('preserves multiple buffered deltas in arrival order', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-orphan-2'
    const partID = 'part-orphan-2'

    for (const chunk of ['Hel', 'lo, ', 'wor', 'ld']) {
      applyDirectoryEvent(state, {
        type: 'message.part.delta',
        properties: { messageID, partID, field: 'text', delta: chunk },
      })
    }

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: { id: partID, type: 'text', messageID, text: '' },
      },
    })

    expect(state.part[messageID]?.[0]?.text).toBe('Hello, world')
  })

  it('clears orphan buffer on message.part.removed', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-orphan-3'
    const partID = 'part-orphan-3'

    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: { messageID, partID, field: 'text', delta: 'lost' },
    })
    expect(state.partDeltaBuffer[messageID]?.[partID]).toBeDefined()

    applyDirectoryEvent(state, {
      type: 'message.part.removed',
      properties: { messageID, partID },
    })
    expect(state.partDeltaBuffer[messageID]).toBeUndefined()
  })

  // RC-6: trimSessions must not silently drop sessions when limit is exceeded.
  it('auto-grows session limit instead of dropping sessions', () => {
    const state = structuredClone(INITIAL_STATE)
    state.limit = 2

    const mkSession = (id) => ({
      id,
      title: id,
      version: 'v1',
      time: { created: 1, updated: 1 },
      directory: '/x',
    })

    applyDirectoryEvent(state, {
      type: 'session.created',
      properties: { info: mkSession('s001') },
    })
    applyDirectoryEvent(state, {
      type: 'session.created',
      properties: { info: mkSession('s002') },
    })
    applyDirectoryEvent(state, {
      type: 'session.created',
      properties: { info: mkSession('s003') },
    })

    // All three sessions retained; limit grew rather than trimming.
    expect(state.session.map((s) => s.id)).toEqual(['s001', 's002', 's003'])
    expect(state.limit).toBeGreaterThanOrEqual(3)
  })
})
