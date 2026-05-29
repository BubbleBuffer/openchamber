import { describe, test, expect } from 'bun:test'
import { normalizeSyncStateToEvents, normalizePermissionResolved, normalizeQuestionAnswered, normalizeQuestionRejected } from './clientSessionEventNormalizer'
import type { PermissionRequest } from '@/types/permission'
import type { QuestionRequest } from '@/types/question'

describe('clientSessionEventNormalizer', () => {
  describe('normalizeSyncStateToEvents', () => {
    test('emits SESSION_LOADED when loaded and exists', () => {
      const events = normalizeSyncStateToEvents({
        directory: 'dir1',
        sessionId: 'session1',
        sessionStatus: { type: 'idle' },
        streamingMessageId: null,
        permissions: [],
        questions: [],
        loaded: true,
        exists: true,
        timestamp: 1000,
      })

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('SESSION_LOADED')
      expect((events[0] as { directory: string }).directory).toBe('dir1')
      expect((events[0] as { sessionId: string }).sessionId).toBe('session1')
    })

    test('emits SESSION_NOT_FOUND when session does not exist', () => {
      const events = normalizeSyncStateToEvents({
        directory: 'dir1',
        sessionId: 'session1',
        sessionStatus: { type: 'idle' },
        streamingMessageId: null,
        permissions: [],
        questions: [],
        loaded: true,
        exists: false,
        timestamp: 1000,
      })

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('SESSION_NOT_FOUND')
    })

    test('emits STREAM_STARTED when streamingMessageId is set', () => {
      const events = normalizeSyncStateToEvents({
        directory: 'dir1',
        sessionId: 'session1',
        sessionStatus: { type: 'busy' },
        streamingMessageId: 'msg1',
        permissions: [],
        questions: [],
        loaded: true,
        exists: true,
        timestamp: 1000,
      })

      expect(events.some((e) => e.type === 'STREAM_STARTED' && (e as { streamingMessageId: string }).streamingMessageId === 'msg1')).toBe(true)
    })

    test('emits RETRY_STARTED when sessionStatus type is retry', () => {
      const events = normalizeSyncStateToEvents({
        directory: 'dir1',
        sessionId: 'session1',
        sessionStatus: { type: 'retry', message: 'Quota limit', attempt: 2 },
        streamingMessageId: null,
        permissions: [],
        questions: [],
        loaded: true,
        exists: true,
        timestamp: 1000,
      })

      const retryEvent = events.find((e) => e.type === 'RETRY_STARTED')
      expect(retryEvent).toBeDefined()
      expect((retryEvent as { retryMessage: string | null }).retryMessage).toBe('Quota limit')
      expect((retryEvent as { retryCount: number }).retryCount).toBe(2)
    })

    test('emits PERMISSION_REQUESTED for each permission', () => {
      const permissions: PermissionRequest[] = [
        { id: 'perm1', sessionID: 'session1', permission: 'file:read', patterns: ['*.ts'], metadata: {}, always: [] },
        { id: 'perm2', sessionID: 'session1', permission: 'file:write', patterns: ['*.js'], metadata: {}, always: [] },
      ]
      const events = normalizeSyncStateToEvents({
        directory: 'dir1',
        sessionId: 'session1',
        sessionStatus: { type: 'idle' },
        streamingMessageId: null,
        permissions,
        questions: [],
        loaded: true,
        exists: true,
        timestamp: 1000,
      })

      const permEvents = events.filter((e) => e.type === 'PERMISSION_REQUESTED')
      expect(permEvents).toHaveLength(2)
      expect(permEvents.some((e) => (e as { permission: { id: string } }).permission.id === 'perm1')).toBe(true)
      expect(permEvents.some((e) => (e as { permission: { id: string } }).permission.id === 'perm2')).toBe(true)
    })

    test('emits QUESTION_REQUESTED for each question', () => {
      const questions: QuestionRequest[] = [
        {
          id: 'q1',
          sessionID: 'session1',
          questions: [{ question: 'Continue?', header: 'Continue', options: [] }],
          tool: undefined,
        },
      ]
      const events = normalizeSyncStateToEvents({
        directory: 'dir1',
        sessionId: 'session1',
        sessionStatus: { type: 'idle' },
        streamingMessageId: null,
        permissions: [],
        questions,
        loaded: true,
        exists: true,
        timestamp: 1000,
      })

      const qEvents = events.filter((e) => e.type === 'QUESTION_REQUESTED')
      expect(qEvents).toHaveLength(1)
      expect((qEvents[0] as { question: { id: string } }).question.id).toBe('q1')
    })

    test('combines multiple event types', () => {
      const permissions: PermissionRequest[] = [
        { id: 'perm1', sessionID: 'session1', permission: 'file:read', patterns: ['**'], metadata: {}, always: [] },
      ]
      const events = normalizeSyncStateToEvents({
        directory: 'dir1',
        sessionId: 'session1',
        sessionStatus: { type: 'busy' },
        streamingMessageId: 'msg1',
        permissions,
        questions: [],
        loaded: true,
        exists: true,
        timestamp: 1000,
      })

      expect(events.length).toBeGreaterThanOrEqual(3)
      expect(events.map((e) => e.type)).toContain('SESSION_LOADED')
      expect(events.map((e) => e.type)).toContain('STREAM_STARTED')
      expect(events.map((e) => e.type)).toContain('PERMISSION_REQUESTED')
    })
  })

  describe('normalizePermissionResolved', () => {
    test('creates PERMISSION_RESOLVED event', () => {
      const event = normalizePermissionResolved({
        directory: 'dir1',
        sessionId: 'session1',
        timestamp: 1000,
        permissionId: 'perm1',
        approved: true,
      })

      expect(event.type).toBe('PERMISSION_RESOLVED')
      expect((event as { permissionId: string }).permissionId).toBe('perm1')
      expect((event as { approved: boolean }).approved).toBe(true)
    })
  })

  describe('normalizeQuestionAnswered', () => {
    test('creates QUESTION_ANSWERED event', () => {
      const event = normalizeQuestionAnswered({
        directory: 'dir1',
        sessionId: 'session1',
        timestamp: 1000,
        questionId: 'q1',
        answer: 'yes',
      })

      expect(event.type).toBe('QUESTION_ANSWERED')
      expect((event as { questionId: string }).questionId).toBe('q1')
      expect((event as { answer: string }).answer).toBe('yes')
    })
  })

  describe('normalizeQuestionRejected', () => {
    test('creates QUESTION_REJECTED event', () => {
      const event = normalizeQuestionRejected({
        directory: 'dir1',
        sessionId: 'session1',
        timestamp: 1000,
        questionId: 'q1',
      })

      expect(event.type).toBe('QUESTION_REJECTED')
      expect((event as { questionId: string }).questionId).toBe('q1')
    })
  })
})