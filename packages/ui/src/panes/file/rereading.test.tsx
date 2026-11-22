import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { settleRealms } from "../../surfaces/runtime/realm.ts";
import { openChild } from "../../surfaces/runtime/testing.ts";
import { rereadOnReturn } from "./rereading.ts";

afterEach(cleanup);

describe("rereading when the keeper returns", () => {
  it("follows the window its pane stands in once the pane is outside", () => {
    const pane = rendered();
    const child = openChild();
    child.document.body.append(pane.root);
    settleRealms();
    window.dispatchEvent(new Event("focus"));
    expect(pane.rereads()).toBe(0);
    child.dispatchEvent(new Event("focus"));
    expect(pane.rereads()).toBe(1);
    document.body.append(pane.root);
    settleRealms();
    child.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
    expect(pane.rereads()).toBe(2);
    child.close();
  });
});

function rendered() {
  let rereads = 0;
  let root: HTMLElement | undefined;
  function Pane() {
    rereadOnReturn(
      () => true,
      () => (rereads += 1),
      () => root,
    );
    return <section ref={root} />;
  }
  render(() => <Pane />);
  return { root: root as unknown as HTMLElement, rereads: () => rereads };
}
