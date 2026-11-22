import { cleanup } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { cursorRow, mountPane, overviewShell, rowTexts, settle } from "../overview/testing.tsx";
import { mcpPane } from "./index.tsx";

afterEach(cleanup);

describe("the mcp pane", () => {
  it("renders the fixture rows with the error line under the broken server", async () => {
    const harness = overviewShell();
    await harness.surfaces.load();
    const { container } = mountPane(mcpPane.component, { kind: "mcp" }, harness.shell);
    expect(rowTexts(container)).toEqual([
      "█ filesystem stdio · 11 tools",
      "▌ remote-docs http · 0 tools",
      "broken stdio · 0 tools",
      "· parked off",
    ]);
    expect(container.querySelector(".kw-ov-sub[data-tone='error']")?.textContent).toBe(
      "spawn nonexistent-server ENOENT",
    );
    harness.dispose();
  });

  it("walks the cursor and drives tools, restart, and toggle through the verbs", async () => {
    const calls: string[] = [];
    const harness = overviewShell({
      client: {
        mcpServerTools: async (name) => {
          calls.push(`tools:${name}`);
          return ["read", "write"];
        },
        restartMcpServer: async (name) => {
          calls.push(`restart:${name}`);
          return { name, state: "connected", enabled: true, toolCount: 11 };
        },
        setMcpServerEnabled: async (name, enabled) => {
          calls.push(`enabled:${name}:${enabled}`);
          return { name, state: "down", enabled, toolCount: 0 };
        },
      },
    });
    await harness.surfaces.load();
    const { container, act } = mountPane(mcpPane.component, { kind: "mcp" }, harness.shell);
    act("mcp.down");
    expect(cursorRow(container)).toBe("remote-docs");
    act("mcp.up");
    act("mcp.tools");
    await settle();
    expect(container.querySelector(".kw-ov-sub")?.textContent).toBe("read  write");
    act("mcp.restart");
    await settle();
    act("mcp.toggle");
    await settle();
    expect(calls).toEqual(["tools:filesystem", "restart:filesystem", "enabled:filesystem:false"]);
    expect(container.textContent).toContain("filesystem disabled");
    harness.dispose();
  });
});
