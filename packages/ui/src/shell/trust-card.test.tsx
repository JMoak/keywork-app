import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { trustPrompt, trustStaysOff } from "./trust.ts";
import { TrustCard } from "./trust-card.tsx";
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
  });
});
