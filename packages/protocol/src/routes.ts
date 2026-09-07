export const protocolVersion = "0.0.1";

export const operationIds = [
  "getDocument",
  "streamEvents",
  "listSessions",
  "createSession",
  "readSession",
  "promptSession",
  "abortSession",
] as const;

export type OperationId = (typeof operationIds)[number];
