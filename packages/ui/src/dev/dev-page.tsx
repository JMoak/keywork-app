import {
  batchPerFrame,
  emptyProjection,
  type FrameBatcher,
  projectAll,
  type SessionProjection,
} from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { createEffect, createSignal, For, onCleanup } from "solid-js";
import { Composer } from "../composer/composer.tsx";
import { applyFlavor, type Flavor, gallery, keyworkDay, keyworkNight } from "../flavor/index.ts";
import { ConversationPane } from "../page/pane.tsx";
import { tierPresetPx, type WidthTier } from "../page/tiers.ts";
import { type Replay, replayEnvelopes } from "./replay.ts";
import { scenarios } from "./scenarios.ts";
import "./dev.css";

export type FlavorChoice = "system" | (typeof gallery)[number]["name"];

const widths = Object.keys(tierPresetPx) as WidthTier[];

export function DevPage() {
  const [scenario, setScenario] = createSignal(scenarios[0]?.name ?? "plain");
  const [flavorChoice, setFlavorChoice] = createSignal<FlavorChoice>("system");
  const [width, setWidth] = createSignal<WidthTier>("column");
  const [projection, setProjection] = createSignal<SessionProjection>(emptyProjection);
  const [take, setTake] = createSignal(0);

  let replay: Replay | undefined;
  let batcher: FrameBatcher | undefined;
  const absorb = (envelopes: readonly BusEnvelope[]): void => {
    setProjection((state) => projectAll(state, envelopes));
  };
  const absorbNow = (envelope: BusEnvelope): void => {
    batcher?.flush();
    absorb([envelope]);
  };

  createEffect(() => {
    const chosen = scenarios.find((candidate) => candidate.name === scenario());
    take();
    replay?.stop();
    batcher?.flush();
    setProjection(emptyProjection);
    batcher = batchPerFrame(absorb, (flush) => requestAnimationFrame(flush));
    if (chosen === undefined) return;
    replay = replayEnvelopes(chosen.envelopes, (envelope) => batcher?.push(envelope));
  });

  createEffect(() => applyFlavor(resolveFlavor(flavorChoice())));

  onCleanup(() => replay?.stop());

  const sessionId = () => (projection().entries.length > 0 ? "s1" : "s1");
  const nextId = () => (projection().lastEventId ?? 0) + 1000;
  const now = () => new Date().toISOString();
  const steer = (text: string): void =>
    absorbNow({
      id: nextId(),
      ts: now(),
      sessionId: sessionId(),
      type: "turn.started",
      payload: { userText: text },
    });
  const queue = (text: string): void =>
    absorbNow({
      id: nextId(),
      ts: now(),
      sessionId: sessionId(),
      type: "queue.changed",
      payload: {
        queued: [...projection().queue, { id: `local-${nextId()}`, text, behavior: "queue" }],
      },
    });
  const interrupt = (): void => {
    replay?.stop();
    if (projection().turn === undefined) return;
    absorbNow({
      id: nextId(),
      ts: now(),
      sessionId: sessionId(),
      type: "turn.interrupted",
      payload: { message: { role: "assistant", parts: [] } },
    });
  };

  return (
    <main class="kw-dev">
      <header class="kw-dev-bar">
        <span class="kw-dev-brand">keywork · the page</span>
        <label class="kw-dev-field">
          scenario
          <select value={scenario()} onChange={(event) => setScenario(event.currentTarget.value)}>
            <For each={scenarios}>{(item) => <option value={item.name}>{item.name}</option>}</For>
          </select>
        </label>
        <label class="kw-dev-field">
          flavor
          <select
            value={flavorChoice()}
            onChange={(event) => setFlavorChoice(event.currentTarget.value as FlavorChoice)}
          >
            <option value="system">system</option>
            <For each={gallery}>
              {(flavor) => <option value={flavor.name}>{flavor.name}</option>}
            </For>
          </select>
        </label>
        <label class="kw-dev-field">
          width
          <select
            value={width()}
            onChange={(event) => setWidth(event.currentTarget.value as WidthTier)}
          >
            <For each={widths}>
              {(tier) => (
                <option value={tier}>
                  {tier} · {tierPresetPx[tier]}px
                </option>
              )}
            </For>
          </select>
        </label>
        <button type="button" class="kw-dev-replay" onClick={() => setTake((count) => count + 1)}>
          replay
        </button>
      </header>
      <div class="kw-dev-stage">
        <div class="kw-dev-frame" style={{ width: `${tierPresetPx[width()]}px` }}>
          <div class="kw-dev-title">
            <span
              class="kw-dev-stamp"
              data-live={projection().turn !== undefined ? "" : undefined}
              aria-hidden="true"
            >
              {projection().turn !== undefined ? "▌" : " "}
            </span>
            <span class="kw-dev-name">{scenario()}</span>
            <span class="kw-dev-telemetry">{telemetry(projection())}</span>
          </div>
          <div class="kw-dev-pane">
            <ConversationPane projection={projection()} />
          </div>
          <Composer
            queue={projection().queue}
            busy={projection().turn !== undefined}
            onSteer={steer}
            onQueue={queue}
            onInterrupt={interrupt}
          />
        </div>
      </div>
    </main>
  );
}

export function telemetry(projection: SessionProjection): string {
  const { usage } = projection;
  if (usage.turns === 0) return "";
  const tokens = `${usage.inputTokens + usage.outputTokens} tokens`;
  return usage.unpricedTurns === 0
    ? `${tokens} · $${usage.costUsd.toFixed(4)}`
    : `${tokens} · unpriced`;
}

export function resolveFlavor(choice: FlavorChoice): Flavor {
  if (choice !== "system") return gallery.find((flavor) => flavor.name === choice) ?? keyworkNight;
  const prefersDark =
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? keyworkNight : keyworkDay;
}
