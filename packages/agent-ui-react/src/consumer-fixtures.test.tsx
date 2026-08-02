import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  bubblePawThreadFixture,
  openChamberThreadFixture,
} from "@openchamber/agent-ui-core/testing";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    range: { startIndex: 0 },
    scrollElement: null,
    getTotalSize: () => count * 40,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
      index,
      key: index,
      start: index * 40,
    })),
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

import { AgentTimeline } from "./AgentTimeline";

describe("runtime-neutral timeline consumers", () => {
  test.each([
    ["openchamber", openChamberThreadFixture],
    ["bubblepaw", bubblePawThreadFixture],
  ])("renders the %s fixture with an independent slot", (consumer, thread) => {
    const scrollElement = document.createElement("div");
    const entries = thread.turns.map((turn) => ({ key: turn.id, turn }));
    const view = render(
      <AgentTimeline
        entries={entries}
        scrollRef={{ current: scrollElement }}
        itemClassName={`${consumer}-entry`}
        renderEntry={({ turn }) => <span>{turn.messages[0]?.id}</span>}
      />,
      { container: scrollElement },
    );

    expect(view.container.querySelectorAll(`.${consumer}-entry`)).toHaveLength(entries.length);
  });
});
