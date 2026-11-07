import type { ConsoleClient } from "@keywork-app/client";
import { cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserHost } from "../../host/browser.ts";
import { mountPane, overviewShell, settle } from "../overview/testing.tsx";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import {
  acknowledgementUnserved,
  benchUnserved,
  emptyStateLine,
  modelRowFirst,
  noReportLine,
} from "./copy.ts";
import { type MillsSpec, millsActions, millsPane, profilePaneKind } from "./index.tsx";
import {
  allOperations,
  fakeFeed,
  fakeMillsServer,
  localKeys,
  moakLlama,
  moakOllama,
  paneText,
  servedOperations18,
} from "./testing.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bindings: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(millsPane.localActions ?? {}).map(([name, action]) => [
    name,
    typeof action.chords === "string" ? action.chords : (action.chords[0] ?? ""),
  ]),
);

interface HarnessOptions {
  operations?: readonly string[];
  spec?: MillsSpec;
  prepare?: (server: ReturnType<typeof fakeMillsServer>) => void;
}

async function millsHarness(options: HarnessOptions = {}) {
  const server = fakeMillsServer(Date.now());
  options.prepare?.(server);
  const { feed, emit } = fakeFeed();
  const base = overviewShell();
  const opened: PaneSpecBase[] = [];
  const shell: ShellSeams = {
    ...base.shell,
    keys: localKeys(bindings),
    host: browserHost({
      server: { url: "http://127.0.0.1:4770", token: "t" },
      fetch: server.fetch,
    }),
    client: {
      document: async () => ({
        version: "0.0.0",
        contract: "1.8",
        operationIds: [...(options.operations ?? allOperations)],
      }),
    } as unknown as ConsoleClient,
    feed,
    openPane: (spec) => {
      opened.push(spec);
    },
  };
  const mounted = mountPane(millsPane.component, options.spec ?? { kind: "mills" }, shell);
  await settled();
  const walkTo = (name: string): void => {
    for (let step = 0; step < 40 && cursorName(mounted.container) !== name; step++) {
      mounted.act(millsActions.down);
    }
  };
  return { ...mounted, server, emit, opened, walkTo, dispose: base.dispose };
}

async function settled(): Promise<void> {
  for (let round = 0; round < 4; round++) await settle();
}

function cursorName(container: HTMLElement): string {
  return (
    container
      .querySelector(".kw-mills-row[data-cursor] [data-cell='name']")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

function rowOf(container: HTMLElement, name: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>(".kw-mills-row")].find(
    (row) => row.querySelector("[data-cell='name']")?.firstChild?.textContent === name,
  );
}

function cell(row: HTMLElement | undefined, name: string): string {
  return row?.querySelector(`[data-cell='${name}']`)?.textContent?.trim() ?? "";
}

function answerAsk(container: HTMLElement, key: string): void {
  fireEvent.keyDown(container.querySelector(".kw-ov-line[data-tone='ask']") as HTMLElement, {
    key,
  });
}

describe("the mills pane", () => {
  it("draws every parcel's mills and the market road as the text golden", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const harness = await millsHarness();
    harness.walkTo("qwen3.8-27b");
    harness.act(millsActions.report);
    await settled();
    harness.walkTo("gemma-4-31b preview");
    await expect(paneText(harness.container)).toMatchFileSnapshot("./__goldens__/mills.txt");
    harness.dispose();
  });

  it("shows health, residency, classes, license, preview and cost per model", async () => {
    const harness = await millsHarness();
    const qwen = rowOf(harness.container, "qwen3.8-27b");
    expect(cell(qwen, "health")).toBe("up");
    expect(cell(qwen, "held")).toBe("loaded");
    expect(cell(qwen, "classes")).toBe("strong vision");
    expect(cell(qwen, "license")).toBe("Apache-2.0");
    expect(cell(qwen, "cost")).toBe("0.00/0.00 est");
    const gemma = rowOf(harness.container, "gemma-4-31b");
    expect(cell(gemma, "name")).toBe("gemma-4-31b preview");
    expect(cell(gemma, "held")).toBe("installed");
    expect(cell(gemma, "license")).toBe("Gemma · needs ack");
    expect(gemma?.dataset.tone).toBe("ask");
    expect(cell(rowOf(harness.container, "glm-5"), "cost")).toBe("unknown");
    expect(cell(rowOf(harness.container, "jev-1.14"), "license")).toBe("proprietary · acked");
    expect(cell(rowOf(harness.container, "jev-1.14"), "cost")).toBe("0.12/0.00");
    const spark = rowOf(harness.container, "ollama :11434");
    expect(spark?.dataset.tone).toBe("error");
    expect(harness.container.textContent).toContain("connect ECONNREFUSED 100.101.1.20:11434");
    expect(harness.container.textContent).toContain(
      "no mill found · install Ollama on port 11434 or llama.cpp on port 9931 here",
    );
    harness.dispose();
  });

  it("names the missing capability for each class the model at the cursor misses", async () => {
    const harness = await millsHarness();
    harness.walkTo("qwen3.8-27b");
    const details = [...harness.container.querySelectorAll(".kw-mills-sub")].map(
      (line) => line.textContent,
    );
    expect(details).toContain("not loop: needs decode measured on this node");
    expect(details).toContain("not decide: needs a decision endpoint or logprobs");
    expect(details).toContain("context allocated 131,072 tokens");
    harness.walkTo("qwen3.8-flash-next");
    expect(harness.container.textContent).toContain("classes unknown until probed · p probes");
    harness.dispose();
  });

  it("probes every mill on the parcel at the cursor and reads the inventory again", async () => {
    const harness = await millsHarness();
    harness.act(millsActions.probe);
    await settled();
    expect(harness.server.calls).toEqual([
      "GET /models",
      "GET /creatures",
      `POST /models/probe {"endpoint":"${moakOllama}","refresh":true}`,
      `POST /models/probe {"endpoint":"${moakLlama}","refresh":true}`,
      "GET /models",
    ]);
    expect(harness.container.textContent).toContain("moak-main probed · 2 recognized");
    harness.dispose();
  });

  it("asks before it acknowledges a non-permissive license, then records it on the node", async () => {
    const harness = await millsHarness();
    harness.walkTo("gemma-4-31b preview");
    harness.act(millsActions.acknowledge);
    expect(harness.container.textContent).toContain(
      "Acknowledge the Gemma license for gemma-4-31b on moak-main? It is not a permissive license; read its terms first.",
    );
    answerAsk(harness.container, "y");
    await settled();
    expect(harness.server.calls).toContain(
      `POST /models/acknowledgements {"endpoint":"${moakOllama}","model":"gemma-4-31b","license":"Gemma"}`,
    );
    expect(harness.container.textContent).toContain("gemma-4-31b · Gemma license acknowledged");
    expect(harness.server.calls.filter((call) => call === "GET /models")).toHaveLength(2);
    harness.dispose();
  });

  it("changes nothing when the keeper cancels or the license needs no acknowledgement", async () => {
    const harness = await millsHarness();
    harness.walkTo("gemma-4-31b preview");
    harness.act(millsActions.acknowledge);
    answerAsk(harness.container, "n");
    harness.walkTo("nimble");
    harness.act(millsActions.acknowledge);
    await settled();
    expect(harness.container.textContent).toContain(
      "nimble needs no acknowledgement · MIT is permissive",
    );
    expect(harness.server.calls.some((call) => call.includes("acknowledgements"))).toBe(false);
    harness.dispose();
  });

  it("says plainly when the node serves no acknowledgement or bench yet", async () => {
    const harness = await millsHarness({ operations: servedOperations18 });
    harness.walkTo("gemma-4-31b preview");
    harness.act(millsActions.acknowledge);
    answerAsk(harness.container, "y");
    await settled();
    expect(harness.container.textContent).toContain(acknowledgementUnserved);
    harness.act(millsActions.bench);
    await settled();
    expect(harness.container.textContent).toContain(benchUnserved("gemma-4-31b"));
    expect(harness.server.calls.some((call) => call.includes("/models/bench"))).toBe(false);
    harness.dispose();
  });

  it("runs the bench and shows the report as a table under the model", async () => {
    const harness = await millsHarness();
    harness.walkTo("qwen3.8-27b");
    harness.act(millsActions.bench);
    await settled();
    expect(harness.server.calls).toContain(
      `POST /models/bench {"endpoint":"${moakOllama}","model":"qwen3.8-27b"}`,
    );
    const rows = [...harness.container.querySelectorAll(".kw-mills-bench-table tr")].map((row) =>
      [...row.children].map((cell) => cell.textContent).join("|"),
    );
    expect(rows[0]).toBe("measure|mean|range");
    expect(rows).toContain("valid@1|0.94|0.83 to 1.00");
    expect(rows).toContain("parallel calls|n/a|");
    harness.dispose();
  });

  it("reads the last bench report on enter, hides it on the next, and says when there is none", async () => {
    const harness = await millsHarness({
      prepare: (server) => {
        server.lastBench = null;
      },
    });
    harness.walkTo("nimble");
    harness.act(millsActions.report);
    await settled();
    expect(harness.server.calls).toContain(
      `GET /models/bench?endpoint=${encodeURIComponent(moakOllama)}&model=nimble`,
    );
    expect(harness.container.textContent).toContain(noReportLine("nimble", "b"));
    harness.server.lastBench = harness.server.bench;
    harness.act(millsActions.report);
    await settled();
    expect(harness.container.querySelector(".kw-mills-bench")).not.toBeNull();
    harness.act(millsActions.report);
    expect(harness.container.querySelector(".kw-mills-bench")).toBeNull();
    harness.dispose();
  });

  it("acts on models only and says so on any other row", async () => {
    const harness = await millsHarness();
    harness.act(millsActions.bench);
    await settled();
    expect(harness.container.textContent).toContain(modelRowFirst);
    expect(harness.server.calls).toEqual(["GET /models", "GET /creatures"]);
    harness.dispose();
  });

  it("shows the creature's policy read only, cycles creatures and points to the profile", async () => {
    const harness = await millsHarness();
    const policy = () =>
      [...harness.container.querySelectorAll(".kw-mills-policy-row")].map((row) =>
        [...row.children].map((part) => part.textContent).join("|"),
      );
    expect(policy()).toEqual([
      "strong|inherit|from the workspace, then you, then the bot's model",
      "loop|ollama/qwen3.8-27b|on moak-main · lacks decode measured on this node",
      "decide|openrouter/jev-1.14|on the market road",
      "vision|inherit|from the workspace, then you, then the bot's model",
    ]);
    expect(harness.container.textContent).toContain(
      "read only here · change it in Wren's profile with o",
    );
    harness.act(millsActions.creature);
    expect(policy()[0]).toBe("strong|lmstudio/glm-4.6-air|not in any mill or on the market road");
    expect(policy()[3]).toBe("vision|ollama/gemma-4-31b|on moak-main");
    harness.act(millsActions.profile);
    expect(harness.opened).toEqual([{ kind: profilePaneKind, slug: "tam" }]);
    harness.dispose();
  });

  it("reads the inventory again on models.changed and the creatures on creature.changed", async () => {
    const harness = await millsHarness();
    harness.emit("models.changed");
    await settled();
    harness.emit("creature.changed", "session.state");
    await settled();
    expect(harness.server.calls).toEqual([
      "GET /models",
      "GET /creatures",
      "GET /models",
      "GET /creatures",
    ]);
    harness.dispose();
  });

  it("opens on the parcel the spec names", async () => {
    const harness = await millsHarness({ spec: { kind: "mills", node: "spark-ad4d" } });
    expect(cursorName(harness.container)).toBe("spark-ad4d");
    expect(millsPane.title({ kind: "mills", node: "spark-ad4d" }, {} as ShellSeams)).toBe(
      "mills · spark-ad4d",
    );
    harness.dispose();
  });

  it("teaches from the empty state with the installer hint for a local server", async () => {
    const harness = await millsHarness({
      prepare: (server) => {
        server.report = {
          generatedAt: "2026-11-05T09:00:00.000Z",
          nodes: [{ node: "moak-main", servers: [] }],
        };
      },
    });
    expect(harness.container.querySelector(".kw-empty")?.textContent).toBe(emptyStateLine("p"));
    expect(emptyStateLine("p")).toBe(
      "No mill on any parcel · install Ollama on port 11434 or llama.cpp on port 9931, then look again with p",
    );
    harness.act(millsActions.probe);
    await settled();
    expect(harness.server.calls.filter((call) => call === "GET /models")).toHaveLength(2);
    harness.dispose();
  });

  it("names the missing inventory with the next step when the node serves none", async () => {
    const harness = await millsHarness({
      prepare: (server) => {
        server.report = 503;
        server.creatures = 503;
      },
    });
    expect(harness.container.querySelector(".kw-empty")?.textContent).toBe(
      "No model inventory: this host serves no model inventory · a server on contract 1.8 serves one; look again with p",
    );
    harness.dispose();
  });
});
