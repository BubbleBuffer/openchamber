import { describe, expect, test } from "bun:test";

import { bubblePawThreadFixture, openChamberThreadFixture } from "./fixtures";

describe("neutral agent thread fixtures", () => {
  test("represents an OpenChamber-shaped capability turn without provider types", () => {
    const turn = openChamberThreadFixture.turns[0];
    const capability = turn?.messages[1]?.content.find((block) => block.kind === "capability");

    expect(turn?.threadId).toBe(openChamberThreadFixture.id);
    expect(capability).toMatchObject({
      kind: "capability",
      callId: "call-read-1",
      name: "read",
      status: "completed",
    });
  });

  test("preserves BubblePaw chat, coding, artifact, and unknown extension semantics", () => {
    const [chatTurn, codingTurn] = bubblePawThreadFixture.turns;
    const codingBlocks = codingTurn?.messages.flatMap((message) => message.content) ?? [];
    const custom = codingBlocks.find((block) => block.kind === "custom");

    expect(chatTurn?.messages[0]?.content[0]).toEqual({ kind: "text", text: "Explain the graph." });
    expect(codingBlocks.some((block) => block.kind === "capability")).toBe(true);
    expect(codingBlocks.some((block) => block.kind === "artifact")).toBe(true);
    expect(custom).toEqual({
      kind: "custom",
      type: "bubblepaw.run",
      data: { mode: "coding", graphNodeId: "workspace-edit" },
    });
  });

  test("uses stable unique IDs across both fixture families", () => {
    for (const thread of [openChamberThreadFixture, bubblePawThreadFixture]) {
      const ids = thread.turns.flatMap((turn) => [
        turn.id,
        ...turn.messages.map((message) => message.id),
        ...turn.activity.map((activity) => activity.id),
      ]);

      expect(new Set(ids).size).toBe(ids.length);
      expect(thread.updatedAtMs).toBeGreaterThanOrEqual(thread.createdAtMs);
    }
  });
});
