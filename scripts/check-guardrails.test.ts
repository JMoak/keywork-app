import { describe, expect, it } from "vitest";
import { findGuardrailViolations, scanKind, scannedPath } from "./check-guardrails.ts";

describe("check:guardrails", () => {
  it("fails an engine import", () => {
    expect(findGuardrailViolations('import { Agent } from "@keywork/engine";')).toEqual([
      "engine import (the app is a client, keywork D7)",
    ]);
  });

  it("allows the protocol and client workspace packages", () => {
    expect(
      findGuardrailViolations('import type { BusEnvelope } from "@keywork-app/protocol";'),
    ).toEqual([]);
  });

  it("fails credential handling and oauth in code", () => {
    expect(findGuardrailViolations('headers["x-api-key"] = key')).toEqual([
      "anthropic api key handled in the app",
    ]);
    expect(findGuardrailViolations("const url = 'https://claude.ai/oauth/authorize'")).toEqual([
      "anthropic subscription oauth",
    ]);
  });

  it("fails a microtask focus claim where the keyboard claim owns focus, and nowhere else", () => {
    const claim = "ref={(input) => queueMicrotask(() => input.focus())}";
    const name =
      "focus claimed in a microtask (one focus policy: the onboarding card owns the keyboard through shell/keyboard-claim.ts; focus on mount or yield to the claim)";
    expect(findGuardrailViolations(claim, "code", "packages/ui/src/onboarding/index.tsx")).toEqual([
      name,
    ]);
    expect(
      findGuardrailViolations(
        "queueMicrotask(() => card?.focus())",
        "code",
        "packages/ui/src/panes/stead/index.tsx",
      ),
    ).toEqual([name]);
    expect(findGuardrailViolations(claim, "code", "packages/ui/src/panes/tree/index.tsx")).toEqual(
      [],
    );
    expect(
      findGuardrailViolations(claim, "code", "packages/ui/src/onboarding/onboarding.test.tsx"),
    ).toEqual([]);
  });

  it("scans prose only for the everywhere patterns", () => {
    expect(findGuardrailViolations("we read the x-api-key header", "prose")).toEqual([]);
  });

  it("scans source and config, not the docs or the pattern table", () => {
    expect(scannedPath("packages/ui/src/app.tsx")).toBe(true);
    expect(scannedPath("scripts/guardrail-patterns.json")).toBe(false);
    expect(scannedPath("docs/plan.md")).toBe(false);
    expect(scanKind("README.md")).toBe("prose");
  });
});
