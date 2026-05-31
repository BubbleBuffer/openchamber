import React from 'react';
import type { ChatMessageEntry } from '../lib/turns/types';
import { buildTurnWindowModel, clampTurnStart, getInitialTurnStart, updateTurnWindowModelIncremental } from '../lib/turns/windowTurns';

interface UseTurnWindowOptions {
  sessionId: string;
  messages: ChatMessageEntry[];
}

export function useTurnWindow({ sessionId, messages }: UseTurnWindowOptions) {
  const previousSessionIdRef = React.useRef<string>(sessionId);
  const previousMessagesRef = React.useRef<ChatMessageEntry[]>(messages);
  const previousModelRef = React.useRef(buildTurnWindowModel(messages));

  // Track turn count for clamping logic (mirrors previousTurnCountRef in controller)
  const previousTurnCountRef = React.useRef(previousModelRef.current.turnCount);

  if (previousSessionIdRef.current !== sessionId) {
    // Session changed — rebuild model from scratch
    previousSessionIdRef.current = sessionId;
    previousMessagesRef.current = messages;
    previousModelRef.current = buildTurnWindowModel(messages);
  } else {
    // Same session — try incremental update
    const nextModel = updateTurnWindowModelIncremental(
      previousModelRef.current,
      previousMessagesRef.current,
      messages,
    ) ?? buildTurnWindowModel(messages);
    previousMessagesRef.current = messages;
    previousModelRef.current = nextModel;
  }

  const [turnStart, setTurnStart] = React.useState(() =>
    getInitialTurnStart(previousModelRef.current.turnCount),
  );

  // Clamp turnStart when turn count changes (mirrors controller's useLayoutEffect at lines 157-159)
  React.useLayoutEffect(() => {
    setTurnStart((current) => clampTurnStart(current, previousModelRef.current.turnCount));
  }, [messages.length, sessionId]);

  return {
    turnWindowModel: previousModelRef.current,
    turnStart,
    setTurnStart,
    previousTurnCountRef,
  };
}