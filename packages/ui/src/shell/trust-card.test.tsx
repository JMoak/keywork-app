import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { trustExplains, trustPrompt, trustStaysOff } from "./trust.ts";
import { notNowWord, TrustCard } from "./trust-card.tsx";
import { inertTrust } from "./trust-testing.ts";

afterEach(cleanup);

describe("the trust card", () => {
  it("asks in keywork's words and claims only what trust changes, since the agent's tools still reach an untrusted folder", () => {
    const { container } = render(() => (
      <TrustCard trust={inertTrust({ kind: "undecided", root: "C:/work" })} chord="ctrl+k u" />
    ));
    const text = container.textContent ?? "";
    expect(text).toContain(trustPrompt("C:/work"));
    expect(text).toContain(trustStaysOff);
    expect(text).not.toContain("read-only");
    expect(text).not.toContain("terminal");
  });

  it("names the folder, says what trusting risks and what still asks, and steps aside on not now", () => {
    const root = "C:\\Users\\keeper\\AppData\\Local\\Temp\\runs\\a-long-folder\\workspace";
    const { container } = render(() => (
      <TrustCard trust={inertTrust({ kind: "undecided", root })} chord="ctrl+k u" />
    ));
    expect(screen.getByText("trust workspace?").getAttribute("title")).toBe(root);
    expect(trustExplains).toContain("can reach your model");
    expect(trustExplains).toContain("still ask you first");
    expect(container.textContent).toContain(trustExplains);
    fireEvent.click(screen.getByRole("button", { name: notNowWord }));
    expect(container.querySelector(".kw-trust")).toBeNull();
  });
});
