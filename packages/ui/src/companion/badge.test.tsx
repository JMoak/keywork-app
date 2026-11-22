import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { Badge } from "./bubble.tsx";

afterEach(cleanup);

const badge = () => document.querySelector(".kw-companion-badge");

describe("the companion badge", () => {
  it("counts what needs you ahead of live threads, in the needs tone", () => {
    render(() => <Badge activeThreads={0} finishedUnseen={1} waiting={2} />);
    expect(badge()?.textContent).toBe("2");
    expect(badge()?.getAttribute("data-tone")).toBe("needs");
  });
});
