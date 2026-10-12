import { emptyProjection } from "@keywork-app/client";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { StatusLine, type StatusLineProps, statusItems } from "./status-line.tsx";

afterEach(cleanup);

const quiet: StatusLineProps = {
  serverLabel: "127.0.0.1:4770",
  projection: emptyProjection,
  usage: "",
  preset: "careful",
  trust: undefined,
  leader: undefined,
  notice: undefined,
  gap: undefined,
  lost: undefined,
};

describe("statusItems", () => {
  it("speaks the C18 grammar in order and leaves out what has nothing to say", () => {
    expect(statusItems(quiet).map((item) => [item.tone, item.text])).toEqual([
      ["mark", "keywork"],
      ["where", "127.0.0.1:4770"],
      ["word", "careful"],
    ]);
  });

  it("puts an untrusted workspace beside the server, where the eye lands first", () => {
    const items = statusItems({ ...quiet, trust: "untrusted · ctrl+k u trusts" });
    expect(items[2]).toEqual({ tone: "warn", text: "untrusted · ctrl+k u trusts" });
  });

  it("says the same usage words the focused frame's title row says", () => {
    const items = statusItems({ ...quiet, usage: "734k tokens · $0.1722" });
    expect(items.at(-1)).toEqual({ tone: "quiet", text: "734k tokens · $0.1722" });
  });
});

describe("StatusLine", () => {
  it("renders each item in its own ink and the moment zone only when something happens", () => {
    const { container } = render(() => <StatusLine {...quiet} />);
    const tones = [...container.querySelectorAll<HTMLElement>(".kw-status-item")].map(
      (item) => item.dataset.tone,
    );
    expect(tones).toEqual(["mark", "where", "word"]);
    expect(container.querySelector(".kw-status-moment")?.textContent).toBe("");
  });

  it("shows the armed leader, the notice, and a lost server", () => {
    const { container } = render(() => (
      <StatusLine {...quiet} leader="ctrl+k" notice="no room" lost="keywork serve exited" />
    ));
    expect(container.querySelector(".kw-status-leader")?.textContent).toBe("ctrl+k …");
    expect(container.querySelector(".kw-status-notice")?.textContent).toBe("no room");
    expect(container.querySelector(".kw-status")?.hasAttribute("data-lost")).toBe(true);
  });
});
