import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createYardControl } from "./control.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("the yard's control", () => {
  it("lets go of the rail without moving focus when the keeper's focus goes elsewhere", () => {
    const run = controlled();
    run.control.focusRail();
    const composer = document.createElement("textarea");
    document.body.append(composer);
    run.control.railLeftFor(composer);
    expect(run.control.railActive()).toBe(false);
    expect(run.homes).toBe(0);
    run.dispose();
  });

  it("sends the keeper home when focus falls out of the rail to nothing", () => {
    const run = controlled();
    run.control.focusRail();
    run.control.railLeftFor(null);
    expect(run.control.railActive()).toBe(false);
    expect(run.homes).toBe(1);
    run.dispose();
  });

  it("asks for the rail at a node each time, even the same node twice", () => {
    const run = controlled();
    const asked: Array<string | undefined> = [];
    createRoot(() => {
      run.control.focusRail("file");
      asked.push(run.control.railAt());
    });
    run.control.focusRail("file");
    asked.push(run.control.railAt());
    expect(asked).toEqual(["file", "file"]);
    expect(run.control.railActive()).toBe(true);
    run.dispose();
  });

  it("toggles the rail between now and the trail and says which", () => {
    const run = controlled();
    expect(run.control.view()).toBe("now");
    run.control.toggleView();
    run.control.toggleView();
    expect(run.said).toEqual(["the trail · newest branch first", "now · by depth"]);
    expect(run.control.view()).toBe("now");
    run.dispose();
  });
});

function controlled() {
  const said: string[] = [];
  let homes = 0;
  return createRoot((dispose) => {
    const control = createYardControl({
      firstFrame: "yard",
      chord: (action) => `chord for ${action}`,
      say: (line) => said.push(line),
      returnHome: () => {
        homes += 1;
      },
    });
    return {
      control,
      said,
      dispose,
      get homes() {
        return homes;
      },
    };
  });
}
