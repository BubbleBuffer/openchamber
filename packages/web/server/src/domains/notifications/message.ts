const DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH = 250;
const DEFAULT_NOTIFICATION_SUMMARY_THRESHOLD = 200;
const DEFAULT_NOTIFICATION_SUMMARY_LENGTH = 100;

const resolvePositiveNumber = (value: number, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
};

const normalizeNotificationPlainText = (text: string): string => {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^[\t ]*[-*+]\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const truncateNotificationText = (
  text: string,
  maxLength: number = DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH
): string => {
  if (typeof text !== "string") {
    return "";
  }

  const safeMaxLength = resolvePositiveNumber(
    maxLength,
    DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH
  );
  if (text.length <= safeMaxLength) {
    return text;
  }

  return `${text.slice(0, safeMaxLength)}...`;
};

export const prepareNotificationLastMessage = async ({
  message,
  settings,
  summarize,
}: {
  message: string;
  settings?: {
    summarizeLastMessage?: boolean;
    summaryThreshold?: number;
    summaryLength?: number;
    maxLastMessageLength?: number;
  };
  summarize?: (text: string, length: number) => Promise<string>;
}): Promise<string> => {
  const originalMessage = typeof message === "string" ? message : "";
  if (!originalMessage) {
    return "";
  }

  const shouldSummarize =
    settings?.summarizeLastMessage === true && typeof summarize === "function";
  const summaryThreshold = resolvePositiveNumber(
    settings?.summaryThreshold ?? DEFAULT_NOTIFICATION_SUMMARY_THRESHOLD,
    DEFAULT_NOTIFICATION_SUMMARY_THRESHOLD
  );
  const summaryLength = resolvePositiveNumber(
    settings?.summaryLength ?? DEFAULT_NOTIFICATION_SUMMARY_LENGTH,
    DEFAULT_NOTIFICATION_SUMMARY_LENGTH
  );
  const maxLastMessageLength = resolvePositiveNumber(
    settings?.maxLastMessageLength ?? DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH,
    DEFAULT_NOTIFICATION_MESSAGE_MAX_LENGTH
  );

  let messageForNotification = originalMessage;
  if (shouldSummarize && originalMessage.length > summaryThreshold) {
    try {
      const summary = await summarize(originalMessage, summaryLength);
      if (typeof summary === "string" && summary.trim().length > 0) {
        messageForNotification = summary;
      }
    } catch {
      messageForNotification = originalMessage;
    }
  }

  const plainTextMessage =
    normalizeNotificationPlainText(messageForNotification) ||
    normalizeNotificationPlainText(originalMessage);
  return truncateNotificationText(plainTextMessage, maxLastMessageLength);
};