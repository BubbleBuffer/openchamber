export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AgentLifecycleStatus =
  | "queued"
  | "waiting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "unknown";

export type AgentMessageRole = "user" | "assistant" | "system";

export type AgentTextBlock = {
  kind: "text";
  text: string;
};

export type AgentReasoningBlock = {
  kind: "reasoning";
  text: string;
  visibility?: "visible" | "collapsed" | "hidden";
};

export type AgentCapabilityBlock = {
  kind: "capability";
  callId: string;
  name: string;
  status: AgentLifecycleStatus;
  input?: JsonValue;
  output?: JsonValue;
  error?: string;
};

export type AgentArtifactBlock = {
  kind: "artifact";
  artifactId: string;
  title: string;
  mediaType?: string;
  version?: string;
  preview?: string;
};

export type AgentCustomBlock = {
  kind: "custom";
  type: string;
  data: JsonValue;
};

export type AgentContentBlock =
  | AgentTextBlock
  | AgentReasoningBlock
  | AgentCapabilityBlock
  | AgentArtifactBlock
  | AgentCustomBlock;

export type AgentMessageView = {
  id: string;
  turnId: string;
  role: AgentMessageRole;
  status: AgentLifecycleStatus;
  occurredAtMs: number;
  content: AgentContentBlock[];
};

export type AgentActivityView = {
  id: string;
  turnId: string;
  kind: string;
  label: string;
  status: AgentLifecycleStatus;
  startedAtMs: number;
  endedAtMs?: number;
  detail?: JsonValue;
};

export type AgentTurnView = {
  id: string;
  threadId: string;
  status: AgentLifecycleStatus;
  startedAtMs: number;
  endedAtMs?: number;
  messages: AgentMessageView[];
  activity: AgentActivityView[];
};

export type AgentThreadView = {
  id: string;
  title: string;
  status: AgentLifecycleStatus;
  createdAtMs: number;
  updatedAtMs: number;
  turns: AgentTurnView[];
};

export type AgentTimelineItem = {
  key: string;
  turnId?: string;
  occurredAtMs: number;
};
