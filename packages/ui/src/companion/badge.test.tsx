import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { needsYouCount } from "../shell/needs-you-ledger.ts";
import { decidedItem } from "../shell/needs-you-testing.ts";
import { Badge } from "./bubble.tsx";

afterEach(cleanup);

const badge = () => document.querySelector(".kw-companion-badge");

describe("the companion badge", () => {
  it("counts what needs you ahead of live threads, in the needs tone", () => {
    render(() => <Badge activeThreads={0} finishedUnseen={1} waiting={2} />);
    expect(badge()?.textContent).toBe("2");
    expect(badge()?.getAttribute("data-tone")).toBe("needs");
  });

  it("counts a decided-for-you item on a finished thread from the one count function", () => {
    const waiting = needsYouCount([decidedItem("record-1")]);
    render(() => <Badge activeThreads={0} finishedUnseen={1} waiting={waiting} />);
    expect(badge()?.textContent).toBe("1");
  });

  it("keeps the live-thread count and the back check when nothing needs you", () => {
    const { unmount } = render(() => <Badge activeThreads={1} finishedUnseen={0} waiting={0} />);
    expect(badge()?.textContent).toBe("1");
    expect(badge()?.getAttribute("data-tone")).toBe("live");
    unmount();
    render(() => <Badge activeThreads={0} finishedUnseen={1} />);
    expect(badge()?.textContent).toBe("✓");
    expect(badge()?.getAttribute("data-tone")).toBe("back");
  });
});
