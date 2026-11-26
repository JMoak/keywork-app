import type {
  BusEnvelope,
  ModelWait,
  ModelWaitChange,
  ModelWaits,
  ServedRefusal,
} from "@keywork-app/protocol";
import { type RanchRequest, servedRefusalOf } from "./ranch.ts";

export interface ModelWaitsClient {
  modelWaits(): Promise<readonly ModelWait[] | ServedRefusal>;
}

export const modelWaitOperations = {
  modelWaits: "listModelWaits",
} as const satisfies Record<keyof ModelWaitsClient, string>;

export function modelWaitRoutes(request: RanchRequest): ModelWaitsClient {
  return {
    modelWaits: async () => {
      const response = await request("GET", "/model-waits");
      return (
        (await servedRefusalOf(response)) ??
        ((await response.json()) as ModelWaits).waits.filter(isModelWait)
      );
    },
  };
}

export function modelWaitChangeOf(envelope: BusEnvelope): ModelWaitChange | undefined {
  if (envelope.type !== "model.wait") return undefined;
  const { change, wait } = envelope.payload;
  return (change === "waiting" || change === "over") && isModelWait(wait)
    ? { change, wait }
    : undefined;
}

function isModelWait(value: unknown): value is ModelWait {
  if (typeof value !== "object" || value === null) return false;
  const wait = value as Record<string, unknown>;
  return (
    typeof wait.session === "string" &&
    (wait.creature === null || typeof wait.creature === "string") &&
    (wait.server === null || typeof wait.server === "string") &&
    (wait.reason === "busy" || wait.reason === "limited") &&
    typeof wait.since === "string"
  );
}
