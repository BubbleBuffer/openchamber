import type { AgentThreadView } from "../model.js";

export const openChamberThreadFixture: AgentThreadView = {
  id: "thread-openchamber-1",
  title: "Inspect the workspace",
  status: "completed",
  createdAtMs: 1_785_492_000_000,
  updatedAtMs: 1_785_492_004_000,
  turns: [
    {
      id: "turn-openchamber-1",
      threadId: "thread-openchamber-1",
      status: "completed",
      startedAtMs: 1_785_492_000_000,
      endedAtMs: 1_785_492_004_000,
      messages: [
        {
          id: "message-openchamber-user-1",
          turnId: "turn-openchamber-1",
          role: "user",
          status: "completed",
          occurredAtMs: 1_785_492_000_000,
          content: [{ kind: "text", text: "Read the package manifest." }],
        },
        {
          id: "message-openchamber-assistant-1",
          turnId: "turn-openchamber-1",
          role: "assistant",
          status: "completed",
          occurredAtMs: 1_785_492_004_000,
          content: [
            {
              kind: "capability",
              callId: "call-read-1",
              name: "read",
              status: "completed",
              input: { path: "package.json" },
              output: { bytes: 6120 },
            },
            { kind: "text", text: "The workspace manifest is valid." },
          ],
        },
      ],
      activity: [
        {
          id: "activity-openchamber-read-1",
          turnId: "turn-openchamber-1",
          kind: "tool.read",
          label: "Read package.json",
          status: "completed",
          startedAtMs: 1_785_492_001_000,
          endedAtMs: 1_785_492_002_000,
        },
      ],
    },
  ],
};

export const bubblePawThreadFixture: AgentThreadView = {
  id: "thread-bubblepaw-1",
  title: "Graph and coding run",
  status: "completed",
  createdAtMs: 1_785_492_100_000,
  updatedAtMs: 1_785_492_114_000,
  turns: [
    {
      id: "turn-bubblepaw-chat-1",
      threadId: "thread-bubblepaw-1",
      status: "completed",
      startedAtMs: 1_785_492_100_000,
      endedAtMs: 1_785_492_104_000,
      messages: [
        {
          id: "message-bubblepaw-chat-user-1",
          turnId: "turn-bubblepaw-chat-1",
          role: "user",
          status: "completed",
          occurredAtMs: 1_785_492_100_000,
          content: [{ kind: "text", text: "Explain the graph." }],
        },
        {
          id: "message-bubblepaw-chat-assistant-1",
          turnId: "turn-bubblepaw-chat-1",
          role: "assistant",
          status: "completed",
          occurredAtMs: 1_785_492_104_000,
          content: [{ kind: "text", text: "The run follows typed graph transitions." }],
        },
      ],
      activity: [
        {
          id: "activity-bubblepaw-generate-1",
          turnId: "turn-bubblepaw-chat-1",
          kind: "generation.completed",
          label: "Generation completed",
          status: "completed",
          startedAtMs: 1_785_492_101_000,
          endedAtMs: 1_785_492_104_000,
          detail: { provider: "codex", model: "gpt-5.6-luna" },
        },
      ],
    },
    {
      id: "turn-bubblepaw-coding-1",
      threadId: "thread-bubblepaw-1",
      status: "completed",
      startedAtMs: 1_785_492_110_000,
      endedAtMs: 1_785_492_114_000,
      messages: [
        {
          id: "message-bubblepaw-coding-user-1",
          turnId: "turn-bubblepaw-coding-1",
          role: "user",
          status: "completed",
          occurredAtMs: 1_785_492_110_000,
          content: [{ kind: "text", text: "Patch the observer." }],
        },
        {
          id: "message-bubblepaw-coding-assistant-1",
          turnId: "turn-bubblepaw-coding-1",
          role: "assistant",
          status: "completed",
          occurredAtMs: 1_785_492_114_000,
          content: [
            {
              kind: "capability",
              callId: "capability-bubblepaw-edit-1",
              name: "workspace.apply_patch",
              status: "completed",
              input: { path: "web/agent/src/App.tsx" },
              output: { changed: true },
            },
            {
              kind: "artifact",
              artifactId: "artifact-observer-plan",
              title: "Observer implementation plan",
              mediaType: "text/markdown",
              version: "2",
              preview: "# Observer implementation plan",
            },
            {
              kind: "custom",
              type: "bubblepaw.run",
              data: { mode: "coding", graphNodeId: "workspace-edit" },
            },
            { kind: "text", text: "The observer is patched." },
          ],
        },
      ],
      activity: [
        {
          id: "activity-bubblepaw-capability-1",
          turnId: "turn-bubblepaw-coding-1",
          kind: "capability.completed",
          label: "Workspace patch completed",
          status: "completed",
          startedAtMs: 1_785_492_111_000,
          endedAtMs: 1_785_492_113_000,
          detail: { capability: "workspace.apply_patch", extension: "workspace-python" },
        },
      ],
    },
  ],
};
