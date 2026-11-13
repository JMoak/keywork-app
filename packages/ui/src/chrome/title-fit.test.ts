import { afterEach, describe, expect, it } from "vitest";
import { fitTelemetry, keepNameReadable, type TelemetryFit } from "./title-fit.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("fitTelemetry", () => {
  it("keeps the full telemetry while the name fits", () => {
    const header = titleRow({ room: 120, nameNeeds: { full: 100, compact: 100, hidden: 100 } });
    expect(fitTelemetry(header)).toBe("full");
    expect(header.dataset.telemetry).toBe("full");
  });

  it("compacts the telemetry before the name clips", () => {
    const header = titleRow({ room: 70, nameNeeds: { full: 100, compact: 60, hidden: 40 } });
    expect(fitTelemetry(header)).toBe("compact");
  });

  it("hides the telemetry when even the compact form would clip the name", () => {
    const header = titleRow({ room: 50, nameNeeds: { full: 100, compact: 60, hidden: 40 } });
    expect(fitTelemetry(header)).toBe("hidden");
  });

  it("lets a name too long for the whole row ellipsize once the telemetry is gone", () => {
    const header = titleRow({ room: 30, nameNeeds: { full: 100, compact: 60, hidden: 40 } });
    expect(fitTelemetry(header)).toBe("hidden");
  });
});

describe("keepNameReadable", () => {
  it("refits when the title's words change and stops when released", async () => {
    const needs = { full: 100, compact: 60, hidden: 40 };
    const header = titleRow({ room: 120, nameNeeds: needs });
    const release = keepNameReadable(header);
    expect(header.dataset.telemetry).toBe("full");
    needs.full = 200;
    header.append(document.createTextNode("$0.01"));
    await Promise.resolve();
    expect(header.dataset.telemetry).toBe("compact");
    release();
    needs.compact = 200;
    header.append(document.createTextNode("$0.02"));
    await Promise.resolve();
    expect(header.dataset.telemetry).toBe("compact");
  });
});

interface Measures {
  readonly room: number;
  readonly nameNeeds: Record<TelemetryFit, number>;
}

function titleRow(measures: Measures): HTMLElement {
  const header = document.createElement("header");
  const name = document.createElement("h2");
  name.className = "kw-frame-name";
  header.append(name);
  document.body.append(header);
  const fit = (): TelemetryFit => (header.dataset.telemetry as TelemetryFit | undefined) ?? "full";
  Object.defineProperty(name, "clientWidth", { get: () => measures.room });
  Object.defineProperty(name, "scrollWidth", {
    get: () => Math.max(measures.room, measures.nameNeeds[fit()]),
  });
  return header;
}
