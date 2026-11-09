import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceFailure } from "../host/port.ts";
import {
  connectFix,
  notOpenedLine,
  OpenFailureCard,
  type OpenFailureNotice,
  openFailureView,
} from "./open-failure.tsx";

afterEach(cleanup);

const noModel: WorkspaceFailure = {
  kind: "unresolved",
  message: "no inference provider is configured",
  nextAction: "run keywork connect",
};

describe("a project that did not open", () => {
  it("says so in stead words, with connecting a model as the fix", () => {
    expect(openFailureView("C:\\work\\keyless", noModel, steadProfile)).toEqual({
      path: "C:\\work\\keyless",
      line: "no model is connected",
      fix: connectFix,
      connectsAModel: true,
    });
    expect(notOpenedLine("C:\\work\\keyless\\")).toBe("keyless did not open");
    expect(notOpenedLine("/home/keeper/keyless")).toBe("keyless did not open");
  });

  it("keeps the engine's reason when connecting is the fix but the reason has no stead words yet", () => {
    const missingKey: WorkspaceFailure = {
      kind: "unresolved",
      message: "anthropic has no credential",
      nextAction: "run keywork connect anthropic",
    };
    expect(openFailureView("/p", missingKey, steadProfile)).toMatchObject({
      line: "anthropic has no credential",
      fix: connectFix,
      connectsAModel: true,
    });
  });

  it("offers the engine's own next step when connecting would not fix it", () => {
    const ambiguous: WorkspaceFailure = {
      kind: "unresolved",
      message: "3 models could be the default",
      nextAction: "pick one with --model",
    };
    expect(openFailureView("/p", ambiguous, steadProfile)).toMatchObject({
      line: "3 models could be the default",
      fix: "pick one with --model, then open it again",
      connectsAModel: false,
    });
    expect(
      openFailureView("/p", { kind: "port-in-use", port: 4770, detail: "" }, steadProfile),
    ).toEqual({ path: "/p", line: "port 4770 is taken", connectsAModel: false });
  });

  it("keeps the classic layout's words under keywork", () => {
    expect(openFailureView("/p", noModel, keyworkProfile)).toEqual({
      path: "/p",
      line: "no inference provider is configured · run keywork connect",
      connectsAModel: false,
    });
  });

  it("draws one card in the workspace that connects, opens again or steps aside", () => {
    const retry = vi.fn();
    const dismiss = vi.fn();
    const connect = vi.fn();
    const notice: OpenFailureNotice = {
      view: openFailureView("/work/keyless", noModel, steadProfile),
      retry,
      dismiss,
    };
    render(() => <OpenFailureCard notice={notice} onConnect={connect} />);
    const card = screen.getByRole("complementary", { name: "keyless did not open" });
    expect(card.querySelector(".kw-open-failure")?.textContent).toBe("no model is connected");
    expect(card.querySelector(".kw-open-fix")?.textContent).toBe(connectFix);
    fireEvent.click(screen.getByRole("button", { name: "connect a model" }));
    fireEvent.click(screen.getByRole("button", { name: "open it again" }));
    fireEvent.click(screen.getByRole("button", { name: "dismiss" }));
    expect([connect, retry, dismiss].map((called) => called.mock.calls.length)).toEqual([1, 1, 1]);
  });
});
