import { describe, expect, test } from 'bun:test';
import type { ChatMessageEntry } from './types';
import {
  buildTurnWindowModel,
  getInitialTurnStart,
  updateTurnWindowModelIncremental,
  getTurnWindowSliceStart,
  clampTurnStart,
  windowMessagesByTurn,
} from './windowTurns';

const makeUserMessage = (id: string, sessionId = 'sess-1'): ChatMessageEntry => ({
  info: {
    id,
    sessionID: sessionId,
    role: 'user' as const,
    time: { created: 0 },
    agent: 'test-agent',
    model: { providerID: 'test-provider', modelID: 'test-model' },
  },
  parts: [],
});

const makeAssistantMessage = (
  id: string,
  parentId: string,
  sessionId = 'sess-1',
): ChatMessageEntry => ({
  info: {
    id,
    sessionID: sessionId,
    role: 'assistant' as const,
    time: { created: 0, completed: 0 },
    parentID: parentId,
    modelID: 'test-model',
    providerID: 'test-provider',
    mode: 'test',
    agent: 'test-agent',
    path: { cwd: '/', root: '/' },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  },
  parts: [],
});

describe('buildTurnWindowModel', () => {
  test('returns zero turns for empty messages', () => {
    const model = buildTurnWindowModel([]);
    expect(model.turnCount).toBe(0);
    expect(model.turnIds).toEqual([]);
    expect(model.turnMessageStartIndexes).toEqual([]);
  });

  test('counts one turn per user message', () => {
    const m1 = makeUserMessage('m1');
    const m2 = makeUserMessage('m2');
    const model = buildTurnWindowModel([m1, m2]);
    expect(model.turnCount).toBe(2);
    expect(model.turnIds).toEqual(['m1', 'm2']);
    expect(model.turnMessageStartIndexes).toEqual([0, 1]);
  });

  test('maps assistant message to parent user turn', () => {
    const user = makeUserMessage('u1');
    const assistant = makeAssistantMessage('a1', 'u1');
    const model = buildTurnWindowModel([user, assistant]);
    expect(model.turnCount).toBe(1);
    expect(model.messageToTurnId.get('a1')).toBe('u1');
    expect(model.messageToTurnIndex.get('a1')).toBe(0);
  });

  test('assistant messages without matching parent are skipped', () => {
    const assistant = makeAssistantMessage('a1', 'nonexistent');
    const model = buildTurnWindowModel([assistant]);
    expect(model.turnCount).toBe(0);
  });
});

describe('updateTurnWindowModelIncremental', () => {
  test('returns previous model when nothing changed', () => {
    const messages = [makeUserMessage('m1')];
    const initial = buildTurnWindowModel(messages);
    const result = updateTurnWindowModelIncremental(initial, messages, messages);
    expect(result).toBe(initial);
  });

  test('returns null when previousModel is null', () => {
    const result = updateTurnWindowModelIncremental(
      null,
      [],
      [makeUserMessage('m1')],
    );
    expect(result).toBeNull();
  });

  test('returns null when previousMessages is null', () => {
    const model = buildTurnWindowModel([]);
    const result = updateTurnWindowModelIncremental(model, null, [makeUserMessage('m1')]);
    expect(result).toBeNull();
  });

  test('returns new model when a user turn was appended', () => {
    const initial = buildTurnWindowModel([makeUserMessage('m1')]);
    const m1 = makeUserMessage('m1');
    const m2 = makeUserMessage('m2');
    const result = updateTurnWindowModelIncremental(initial, [m1], [m1, m2]);
    expect(result).toBeTruthy();
    expect(result!.turnCount).toBe(2);
  });

  test('returns null when messages differ by more than one element', () => {
    const initial = buildTurnWindowModel([makeUserMessage('m1')]);
    const result = updateTurnWindowModelIncremental(
      initial,
      [makeUserMessage('m1')],
      [makeUserMessage('m1'), makeUserMessage('m2'), makeUserMessage('m3')],
    );
    expect(result).toBeNull();
  });

  test('returns null when same-length messages have different last message id', () => {
    const initial = buildTurnWindowModel([makeUserMessage('m1')]);
    const m1a = makeUserMessage('m1-alt');
    const result = updateTurnWindowModelIncremental(initial, [makeUserMessage('m1')], [m1a]);
    // Same length, last entry differs and has different signature => returns null
    expect(result).toBeNull();
  });

  test('returns previousModel when same-length messages changed last entry with same id', () => {
    const messages = [makeUserMessage('m1')];
    const initial = buildTurnWindowModel(messages);
    const updatedMessages = [makeUserMessage('m1')]; // same id but different object
    const result = updateTurnWindowModelIncremental(initial, messages, updatedMessages);
    // Same length, last entry differs by reference but has same message signature => returns previousModel
    expect(result).toBe(initial);
  });
});

describe('getInitialTurnStart', () => {
  test('returns 0 when turn count is 0', () => {
    expect(getInitialTurnStart(0)).toBe(0);
  });

  test('returns 0 when turn count is less than or equal to initial turns', () => {
    expect(getInitialTurnStart(1)).toBe(0);
    expect(getInitialTurnStart(3)).toBe(0);
    expect(getInitialTurnStart(5)).toBe(0);
  });

  test('returns turn count minus initial turns when there are more turns', () => {
    // default initialTurns is 10, so 20 turns gives 20 - 10 = 10
    const result = getInitialTurnStart(20);
    expect(result).toBe(10);
  });
});

describe('clampTurnStart', () => {
  test('returns 0 for empty or single turn', () => {
    expect(clampTurnStart(0, 0)).toBe(0);
    expect(clampTurnStart(0, 1)).toBe(0);
  });

  test('clamps to turnCount - 1', () => {
    expect(clampTurnStart(10, 5)).toBe(4);
    expect(clampTurnStart(3, 3)).toBe(2);
  });

  test('returns the same value when within bounds', () => {
    expect(clampTurnStart(0, 5)).toBe(0);
    expect(clampTurnStart(2, 5)).toBe(2);
    expect(clampTurnStart(4, 5)).toBe(4);
  });
});

describe('getTurnWindowSliceStart', () => {
  test('returns 0 for turnStart at 0', () => {
    const model = buildTurnWindowModel([makeUserMessage('m1')]);
    expect(getTurnWindowSliceStart(model, 0)).toBe(0);
  });

  test('returns message index at turn boundary', () => {
    const m1 = makeUserMessage('m1');
    const m2 = makeUserMessage('m2');
    const model = buildTurnWindowModel([m1, m2]);
    expect(getTurnWindowSliceStart(model, 1)).toBe(1);
  });
});

describe('windowMessagesByTurn', () => {
  test('returns all messages when turnStart is 0', () => {
    const messages = [makeUserMessage('m1')];
    const model = buildTurnWindowModel(messages);
    expect(windowMessagesByTurn(messages, model, 0)).toHaveLength(1);
  });

  test('returns sliced messages based on turn window', () => {
    const m1 = makeUserMessage('m1');
    const a1 = makeAssistantMessage('a1', 'm1');
    const m2 = makeUserMessage('m2');
    const messages = [m1, a1, m2];
    const model = buildTurnWindowModel(messages);
    const sliced = windowMessagesByTurn(messages, model, 1);
    expect(sliced).toHaveLength(1);
    expect(sliced[0]!.info.id).toBe('m2');
  });
});
