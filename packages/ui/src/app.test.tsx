import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { App } from "./app.tsx";
import type { HostPort } from "./host/port.ts";

const host: HostPort = {
  about: async () => ({ shell: "browser", platform: "test", version: "0" }),
};

describe("App", () => {
  it("shows the masthead and the host it is mounted in", async () => {
    render(() => <App host={host} />);
    expect(screen.getByText("keywork")).toBeTruthy();
    expect(await screen.findByText("browser · test")).toBeTruthy();
  });
});
