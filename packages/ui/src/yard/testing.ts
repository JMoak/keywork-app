import type { YardSetting } from "@keywork-app/habitat";
import type { BusEnvelope, Setting } from "@keywork-app/protocol";

export const settingAt = "2026-11-08T09:00:00.000Z";

export function aSetting(overrides: Partial<Setting> = {}): Setting {
  return {
    id: "set-1",
    creature: "wren",
    sessionId: "home-conversation",
    what: { kind: "file", ref: "src/app.ts", title: "the entry point" },
    rung: "card",
    why: "you asked where the app starts",
    at: settingAt,
    until: "seen",
    state: "live",
    ...overrides,
  };
}

export function aYardSetting(overrides: Partial<YardSetting> = {}): YardSetting {
  return { ...aSetting(overrides), shown: "card", depth: 3, ...overrides };
}

export function proposed(id: number, setting: Setting): BusEnvelope {
  return {
    id,
    ts: setting.at,
    sessionId: setting.sessionId,
    type: "show.proposed",
    payload: { setting },
  };
}

export function settled(
  id: number,
  setting: Pick<Setting, "id" | "sessionId">,
  outcome: "seen" | "pinned" | "unpinned" | "dismissed" | "withdrawn",
  ts = settingAt,
): BusEnvelope {
  return {
    id,
    ts,
    sessionId: setting.sessionId,
    type: "show.settled",
    payload: { id: setting.id, outcome, by: "keeper" },
  };
}

export function eventFeed() {
  let push: ((envelope: BusEnvelope) => void) | undefined;
  const queue: BusEnvelope[] = [];
  return {
    emit: (envelopes: readonly BusEnvelope[]): void => {
      for (const envelope of envelopes) {
        if (push === undefined) queue.push(envelope);
        else push(envelope);
      }
    },
    events: async function* (options?: { onOpen?: () => void }): AsyncIterable<BusEnvelope> {
      options?.onOpen?.();
      for (;;) {
        const next = queue.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        await new Promise<void>((resolve) => {
          push = (envelope) => {
            queue.push(envelope);
            push = undefined;
            resolve();
          };
        });
      }
    },
  };
}
