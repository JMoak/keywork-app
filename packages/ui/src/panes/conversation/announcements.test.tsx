import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { Announcements } from "./announcements.tsx";

afterEach(cleanup);

const at = "2026-11-12T12:00:00.000Z";

function told(id: number, type: BusEnvelope["type"], payload: unknown): BusEnvelope {
  return { id, ts: at, sessionId: "s1", type, payload } as BusEnvelope;
}

describe("what a screen reader hears", () => {
  it("hears a reply once it is whole, never word by word, and an ask at once", () => {
    const started = projectAll(emptyProjection, [
      told(1, "turn.started", { userText: "hello" }),
      told(2, "turn.delta", { delta: { type: "text", text: "Hel" } }),
    ]);
    const [projection, setProjection] = createSignal<SessionProjection>(started);
    const { container } = render(() => <Announcements projection={projection()} />);
    const polite = container.querySelector("[aria-live='polite']") as HTMLElement;
    const assertive = container.querySelector("[aria-live='assertive']") as HTMLElement;
    expect(polite.textContent).toBe("");
    const message = { role: "assistant", parts: [{ type: "text", text: "Hello there." }] };
    const usage = { inputTokens: 1, outputTokens: 1 };
    const replied = projectAll(started, [
      told(3, "turn.delta", { delta: { type: "text", text: "lo there." } }),
      told(4, "turn.completed", { message, usage }),
    ]);
    setProjection(replied);
    expect(polite.textContent).toBe("reply · Hello there.");
    const call = { type: "tool-call", callId: "w1", name: "write", arguments: { path: "a.txt" } };
    setProjection(
      projectAll(replied, [
        told(5, "turn.started", { userText: "write it" }),
        told(6, "gate.ask", {
          ask: { tool: "write", callId: "w1", arguments: call.arguments, rule: "default" },
        }),
      ]),
    );
    expect(assertive.textContent).toBe("write a.txt needs your answer");
    expect(polite.textContent).toBe("reply · Hello there.");
  });

  it("stays quiet about history a reload replays", () => {
    const message = { role: "assistant", parts: [{ type: "text", text: "old" }] };
    const replayed = projectAll(emptyProjection, [
      told(-1, "turn.started", { userText: "earlier", replay: true }),
      told(-2, "turn.delta", { delta: { type: "text", text: "old" }, replay: true }),
      told(-3, "turn.completed", {
        message,
        usage: { inputTokens: 0, outputTokens: 0 },
        replay: true,
      }),
    ]);
    const { container } = render(() => <Announcements projection={replayed} />);
    expect(container.textContent).toBe("");
  });
});
