import type { McpServerStatus } from "@keywork-app/protocol";
import { cleanup } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { cursorRow, mountPane, overviewShell, rowTexts, settle } from "../overview/rows.test.tsx";
import { mcpPane, serverAside, serverDensity, serverMark, stateTally } from "./index.tsx";

afterEach(cleanup);

const server = (extra: Partial<McpServerStatus>): McpServerStatus => ({
  name: "fs",
  state: "connected",
  enabled: true,
  toolCount: 2,
  ...extra,
});

describe("the mcp pane", () => {
  it("marks connected at full density, connecting with the tile fill, down with a missing tile", () => {
    expect(serverMark(server({}), 0)).toBe("█");
    expect(serverMark(server({ state: "connecting" }), 1)).toBe("▀");
    expect(serverMark(server({ state: "down" }), 0)).toBe(" ");
    expect(serverMark(server({ enabled: false, state: "down" }), 0)).toBe("·");
    expect(serverDensity(server({}))).toBe("full");
    expect(serverDensity(server({ enabled: false }))).toBe("light");
    expect(serverAside(server({ transport: "stdio", toolCount: 1 }))).toBe("stdio · 1 tool");
    expect(stateTally([server({}), server({ state: "down" })])).toBe(
      "2 servers · 1 connected · 1 down",
    );
  });

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

  it("teaches from the empty state", async () => {
    const harness = overviewShell({ empty: true });
    await harness.surfaces.load();
    const { container } = mountPane(mcpPane.component, { kind: "mcp" }, harness.shell);
    expect(container.querySelector(".kw-empty")?.textContent).toContain("no mcp servers");
    harness.dispose();
  });
});
