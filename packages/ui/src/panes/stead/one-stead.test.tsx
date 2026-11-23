import { cleanup, render, waitFor } from "@solidjs/testing-library";
import type { JSX } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createTiler } from "../../shell/tiler.ts";
import { definitionOf, parsePaneSpec } from "../index.ts";
import { overviewShell } from "../overview/testing.tsx";
import type { PaneProps, ShellSeams } from "../registry.ts";
import type { SteadSpec } from "./index.tsx";

afterEach(cleanup);

const screen = { width: 1600, height: 1000 };
const preferences: SteadSpec = { kind: "stead", courtOrder: ["ada"], kit: "deco", light: "day" };

describe("the one stead", () => {
  it("is found by a summon whatever its preferences hold, and keeps them", async () => {
    const tiler = createTiler();
    expect(tiler.summon({ kind: "stead" }, screen).ok).toBe(true);
    const id = tiler.focused() ?? "";
    const base = overviewShell().shell;
    const shell: ShellSeams = {
      ...base,
      rebind: (pane, spec) => {
        const parsed = parsePaneSpec(spec);
        if (parsed !== undefined) tiler.bind(pane, parsed);
      },
    };
    const Stead = definitionOf("stead").component as (props: PaneProps<SteadSpec>) => JSX.Element;
    render(() => (
      <Stead
        id={id}
        spec={(tiler.spec(id) ?? { kind: "stead" }) as SteadSpec}
        focused={true}
        shell={shell}
        onAction={() => undefined}
      />
    ));
    tiler.bind(id, preferences);

    expect(tiler.summon({ kind: "stead" }, screen).ok).toBe(true);

    expect(tiler.panes()).toEqual([id]);
    await waitFor(() => expect(tiler.spec(id)).toEqual(preferences));
  });
});
