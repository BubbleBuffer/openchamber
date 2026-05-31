import { describe, test, expect } from 'bun:test'
import { createSessionSnapshotFromSyncState } from './clientSessionRestoration'
import type { SyncStateInput } from './clientSessionRestoration'

describe('createSessionSnapshotFromSyncState', () => {
  const baseInput: SyncStateInput = {
    directory: 'dir1',
    sessionId: 'session1',
    exists: true,
    loaded: true,
    sessionStatusType: 'idle',
    retryMessage: null,
    retryCount: 0,
    retryCooldownUntil: null,
    permissions: [],
    questions: [],
    isLoadingOlder: false,
    hasMoreAbove: false,
    oldestLoadedMessageId: null,
    newestLoadedMessageId: null,
    historyLoadError: null,
    streamingMessageId: null,
    streamingPartId: null,
    messageOrder: [],
    messagesById: {},
    partsByMessageId: {},
    partsById: {},
    historyMeta: { limit: 0, complete: true, loading: false },
    errorType: null,
    fatalError: null,
    timestamp: Date.now(),
  }

  test('creates a valid snapshot with idle status', () => {
    const snapshot = createSessionSnapshotFromSyncState(baseInput)

    expect(snapshot.version).toBe(1)
    expect(snapshot.key.directory).toBe('dir1')
    expect(snapshot.key.sessionId).toBe('session1')
    expect(snapshot.identity.exists).toBe(true)
    expect(snapshot.identity.loaded).toBe(true)
    expect(snapshot.regions.lifecycle).toBe('ready')
    expect(snapshot.regions.activity).toBe('idle')
    expect(snapshot.regions.interruptions).toBe('clear')
    expect(snapshot.regions.retry).toBe('idle')
  })

  test('sets streaming region when streamingMessageId is set', () => {
    const input: SyncStateInput = {
      ...baseInput,
      sessionStatusType: 'busy',
      streamingMessageId: 'msg1',
      streamingPartId: 'part1',
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.regions.activity).toBe('streaming')
    expect(snapshot.domain.streamingMessageId).toBe('msg1')
    expect(snapshot.domain.streamingPartId).toBe('part1')
  })

  test('sets interruptions region to has_permission when permissions exist', () => {
    const input: SyncStateInput = {
      ...baseInput,
      permissions: [
        { id: 'perm1', sessionID: 'session1', permission: 'file:read', patterns: ['**'], metadata: {}, always: [] },
      ],
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.regions.interruptions).toBe('has_permission')
    expect(snapshot.domain.permissionsById.perm1 !== undefined).toBe(true)
    expect(snapshot.domain.permissionsById.perm1.permission).toBe('file:read')
  })

  test('sets interruptions region to has_question when questions exist', () => {
    const input: SyncStateInput = {
      ...baseInput,
      questions: [
        {
          id: 'q1',
          sessionID: 'session1',
          questions: [{ question: 'Continue?', header: 'Continue', options: [] }],
          tool: undefined,
        },
      ],
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.regions.interruptions).toBe('has_question')
    expect(snapshot.domain.questionsById.q1 !== undefined).toBe(true)
    expect(snapshot.domain.questionsById.q1.questions).toEqual(['Continue?'])
  })

  test('sets interruptions region to has_both when both permissions and questions exist', () => {
    const input: SyncStateInput = {
      ...baseInput,
      permissions: [
        { id: 'perm1', sessionID: 'session1', permission: 'file:read', patterns: ['**'], metadata: {}, always: [] },
      ],
      questions: [
        {
          id: 'q1',
          sessionID: 'session1',
          questions: [{ question: 'Continue?', header: 'Continue', options: [] }],
          tool: undefined,
        },
      ],
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.regions.interruptions).toBe('has_both')
  })

  test('sets retry region to retrying when sessionStatusType is retry', () => {
    const input: SyncStateInput = {
      ...baseInput,
      sessionStatusType: 'retry',
      retryMessage: 'Quota limit reached',
      retryCount: 1,
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.regions.retry).toBe('retrying')
    expect(snapshot.domain.retry.retryMessage).toBe('Quota limit reached')
    expect(snapshot.domain.retry.retryCount).toBe(1)
  })

  test('sets retry region to cooldown when retryCooldownUntil is set', () => {
    const input: SyncStateInput = {
      ...baseInput,
      sessionStatusType: 'retry',
      retryMessage: 'Retrying...',
      retryCount: 1,
      retryCooldownUntil: Date.now() + 5000,
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.regions.retry).toBe('cooldown')
    expect(snapshot.domain.retry.retryCooldownUntil !== null).toBe(true)
  })

  test('sets error region to fatal when fatalError is present', () => {
    const input: SyncStateInput = {
      ...baseInput,
      errorType: 'fatal_invariant',
      fatalError: {
        invariantName: 'assertSessionEventIdentityMatchesContext',
        actorKey: 'dir1::session1',
        revision: 1,
        eventType: 'SESSION_LOADED',
      },
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.regions.error).toBe('fatal')
    expect(snapshot.domain.error.errorType).toBe('fatal_invariant')
    expect(snapshot.domain.error.fatalError !== null).toBe(true)
  })

  test('sets error region to recoverable_error for stream_failed', () => {
    const input: SyncStateInput = {
      ...baseInput,
      errorType: 'stream_failed',
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.regions.error).toBe('recoverable_error')
  })

  test('sets history region to loading_older when isLoadingOlder is true', () => {
    const input: SyncStateInput = {
      ...baseInput,
      isLoadingOlder: true,
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.regions.history).toBe('loading_older')
    expect(snapshot.domain.history.isLoadingOlder).toBe(true)
  })

  test('maps messages correctly', () => {
    const input: SyncStateInput = {
      ...baseInput,
      messageOrder: ['msg1', 'msg2'],
      messagesById: {
        msg1: {
          id: 'msg1',
          role: 'user',
          sessionId: 'session1',
          createdAt: 1000,
          parentId: null,
          model: null,
          agent: null,
          provider: null,
          cost: null,
          tokens: null,
          error: null,
        },
        msg2: {
          id: 'msg2',
          role: 'assistant',
          sessionId: 'session1',
          createdAt: 2000,
          parentId: 'msg1',
          model: 'gpt-4',
          agent: null,
          provider: 'openai',
          cost: null,
          tokens: null,
          error: null,
        },
      },
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.domain.messageOrder).toEqual(['msg1', 'msg2'])
    expect(snapshot.domain.messagesById.msg1.role).toBe('user')
    expect(snapshot.domain.messagesById.msg2.role).toBe('assistant')
    expect(snapshot.domain.messagesById.msg2.model).toBe('gpt-4')
  })

  test('maps parts correctly', () => {
    const input: SyncStateInput = {
      ...baseInput,
      partsByMessageId: { msg1: ['part1'] },
      partsById: {
        part1: {
          id: 'part1',
          messageId: 'msg1',
          type: 'text',
          text: 'Hello world',
        },
      },
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.domain.partsByMessageId.msg1).toEqual(['part1'])
    expect(snapshot.domain.partsById.part1.type).toBe('text')
    expect((snapshot.domain.partsById.part1 as { text: string }).text).toBe('Hello world')
  })

  test('sets exists to false when session not found', () => {
    const input: SyncStateInput = {
      ...baseInput,
      exists: false,
      loaded: true,
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(snapshot.identity.exists).toBe(false)
  })

  test('maps permissions by id', () => {
    const input: SyncStateInput = {
      ...baseInput,
      permissions: [
        { id: 'perm1', sessionID: 'session1', permission: 'file:read', patterns: ['*.ts'], metadata: { name: 'read' }, always: [] },
        { id: 'perm2', sessionID: 'session1', permission: 'file:write', patterns: ['*.js'], metadata: { name: 'write' }, always: [] },
      ],
    }

    const snapshot = createSessionSnapshotFromSyncState(input)

    expect(Object.keys(snapshot.domain.permissionsById)).toHaveLength(2)
    expect(snapshot.domain.permissionsById.perm1.patterns).toEqual(['*.ts'])
    expect(snapshot.domain.permissionsById.perm2.patterns).toEqual(['*.js'])
  })
})