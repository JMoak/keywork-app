import { afterEach, describe, expect, it, vi } from "vitest";
import type { Cue, Plan } from "../feel/choreography.ts";
import type { ScreenRect, SurfaceShow } from "../port.ts";
import { type PlanPort, perform } from "./perform.ts";

afterEach(() => {
  vi.useRealTimers();
});

const place: ScreenRect = { x: 100, y: 100, width: 480, height: 320 };

function showOf(id: string): SurfaceShow {
  return {
    id,
    bounds: place,
    origin: "creature",
    focus: false,
    follows: true,
    backdrop: "backdrop-token",
    title: id,
  };
}

function planOf(cues: readonly Cue[]): Plan {
  return { style: "glide", cues, endsAtMs: Math.max(0, ...cues.map((cue) => cue.atMs)) };
}

function recordingPort(fails: readonly string[] = []): { port: PlanPort; calls: string[] } {
  const calls: string[] = [];
  const answer = async (call: string): Promise<void> => {
    calls.push(call);
    if (fails.includes(call)) throw new Error(`${call} was refused`);
  };
  return {
    calls,
    port: {
      show: (show) => answer(`show ${show.id}`),
      glide: (glide) => answer(`glide ${glide.moves.map((move) => move.id).join("+")}`),
      hide: (id) => answer(`hide ${id}`),
    },
  };
}

describe("performing a plan", () => {
  it("asks the host for each cue of the first moment at once and in the plan's order", async () => {
    const { port, calls } = recordingPort();
    const shown: string[] = [];
    const playing = perform(
      planOf([
        { atMs: 0, kind: "show", show: showOf("a") },
        { atMs: 0, kind: "glide", glide: { moves: [{ id: "a", bounds: place }], durationMs: 160 } },
      ]),
      port,
      { shown: (show) => shown.push(show.id) },
    );
    expect(calls).toEqual(["show a", "glide a"]);
    expect(shown).toEqual([]);
    await playing.finished;
    expect(shown).toEqual(["a"]);
  });

  it("keeps a later cue until its moment", async () => {
    vi.useFakeTimers();
    const { port, calls } = recordingPort();
    const playing = perform(
      planOf([
        { atMs: 0, kind: "show", show: showOf("a") },
        { atMs: 40, kind: "show", show: showOf("b") },
        { atMs: 200, kind: "hide", id: "a" },
      ]),
      port,
    );
    expect(calls).toEqual(["show a"]);
    await vi.advanceTimersByTimeAsync(40);
    expect(calls).toEqual(["show a", "show b"]);
    await vi.advanceTimersByTimeAsync(160);
    expect(calls).toEqual(["show a", "show b", "hide a"]);
    await expect(playing.finished).resolves.toBeUndefined();
  });

  it("leaves out a pane that is no longer wanted when its cue comes due", async () => {
    vi.useFakeTimers();
    const { port, calls } = recordingPort();
    const gone = new Set<string>();
    const playing = perform(
      planOf([
        { atMs: 0, kind: "show", show: showOf("a") },
        { atMs: 40, kind: "show", show: showOf("b") },
        {
          atMs: 40,
          kind: "glide",
          glide: {
            moves: [
              { id: "a", bounds: place },
              { id: "b", bounds: place },
            ],
            durationMs: 100,
          },
        },
        {
          atMs: 80,
          kind: "glide",
          glide: { moves: [{ id: "b", bounds: place }], durationMs: 100 },
        },
        { atMs: 80, kind: "hide", id: "b" },
      ]),
      port,
      { skips: (id) => gone.has(id) },
    );
    gone.add("b");
    await vi.advanceTimersByTimeAsync(80);
    await playing.finished;
    expect(calls).toEqual(["show a", "glide a"]);
  });

  it("drops what has not come due when it is cancelled, and still finishes", async () => {
    vi.useFakeTimers();
    const { port, calls } = recordingPort();
    const playing = perform(
      planOf([
        { atMs: 0, kind: "show", show: showOf("a") },
        { atMs: 40, kind: "show", show: showOf("b") },
      ]),
      port,
    );
    playing.cancel();
    await vi.advanceTimersByTimeAsync(100);
    await expect(playing.finished).resolves.toBeUndefined();
    expect(calls).toEqual(["show a"]);
  });

  it("fails when the host refuses a cue, and never says that pane was shown", async () => {
    const { port } = recordingPort(["show a"]);
    const shown: string[] = [];
    const playing = perform(planOf([{ atMs: 0, kind: "show", show: showOf("a") }]), port, {
      shown: (show) => shown.push(show.id),
    });
    await expect(playing.finished).rejects.toThrow("show a was refused");
    expect(shown).toEqual([]);
  });
});
