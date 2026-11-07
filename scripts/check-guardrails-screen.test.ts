import { describe, expect, it } from "vitest";
import { findGuardrailViolations } from "./check-guardrails.ts";

const denyByDefault = "session.defaultSession.setPermissionCheckHandler(() => false);";

describe("the permission check trap", () => {
  it("refuses a permission check handler anywhere but the screen guard", () => {
    expect(
      findGuardrailViolations(denyByDefault, "code", "packages/desktop/src/main/shell.ts"),
    ).toEqual([
      "permission check handler outside the screen guard (a deny-by-default media check hides the tailnet interface from WebRTC, stead docs/spec/product/SCREEN.md section 1)",
    ]);
    expect(
      findGuardrailViolations(
        denyByDefault,
        "code",
        "packages/desktop/src/main/screen/electron.ts",
      ),
    ).toEqual([]);
  });

  it("still reads the other patterns on the exempt file", () => {
    expect(
      findGuardrailViolations(
        'import { Agent } from "@keywork/engine";',
        "code",
        "packages/desktop/src/main/screen/electron.ts",
      ),
    ).toEqual(["engine import (the app is a client, keywork D7)"]);
  });
});
