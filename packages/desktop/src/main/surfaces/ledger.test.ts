import { describe, expect, it } from "vitest";
import { moveLedger, placementsRemembered } from "./ledger.ts";

const home = { x: 100, y: 100, width: 480, height: 360 };
const away = { x: 900, y: 420, width: 480, height: 360 };

describe("who moved a pane outside the window", () => {
  it("is the keeper when the host placed nothing", () => {
    expect(
      moveLedger().moverOf(
        () => away,
        () => false,
      ),
    ).toBe("keeper");
  });

  it("is the host for a move reported while the host is placing it, wherever it lands", () => {
    const ledger = moveLedger();
    const seen: string[] = [];
    ledger.hostPlaces(home, () =>
      seen.push(
        ledger.moverOf(
          () => away,
          () => false,
        ),
      ),
    );
    expect(seen).toEqual(["host"]);
  });

  it("is the host when the desktop reports a placement late, a pixel off, or twice", () => {
    const ledger = moveLedger();
    ledger.hostPlaces(home, () => undefined);
    ledger.hostPlaces(away, () => undefined);
    expect(
      ledger.moverOf(
        () => ({ ...home, x: home.x + 1 }),
        () => false,
      ),
    ).toBe("host");
    expect(
      ledger.moverOf(
        () => away,
        () => false,
      ),
    ).toBe("host");
    expect(
      ledger.moverOf(
        () => away,
        () => false,
      ),
    ).toBe("host");
  });

  it("is the keeper for a place the host has already moved on from", () => {
    const ledger = moveLedger();
    ledger.hostPlaces(home, () => undefined);
    ledger.hostPlaces(away, () => undefined);
    expect(
      ledger.moverOf(
        () => away,
        () => false,
      ),
    ).toBe("host");
    expect(
      ledger.moverOf(
        () => home,
        () => false,
      ),
    ).toBe("keeper");
  });

  it("is the keeper from the grab to the release, even back onto a place the host chose", () => {
    const ledger = moveLedger();
    ledger.hostPlaces(home, () => undefined);
    ledger.grabbed();
    expect(
      ledger.moverOf(
        () => away,
        () => true,
      ),
    ).toBe("keeper");
    expect(
      ledger.moverOf(
        () => home,
        () => false,
      ),
    ).toBe("keeper");
    ledger.released();
    expect(
      ledger.moverOf(
        () => ({ ...away, y: 2 }),
        () => false,
      ),
    ).toBe("keeper");
  });

  it("is the host again once the host places a pane the keeper never let go of", () => {
    const ledger = moveLedger();
    ledger.grabbed();
    ledger.hostPlaces(home, () => undefined);
    expect(
      ledger.moverOf(
        () => home,
        () => false,
      ),
    ).toBe("host");
  });

  it("is the host for where the host sent a pane, though nothing was placed and the keeper never let go", () => {
    const ledger = moveLedger();
    ledger.grabbed();
    ledger.hostSends(away);
    expect(
      ledger.moverOf(
        () => away,
        () => false,
      ),
    ).toBe("host");
    expect(
      ledger.moverOf(
        () => home,
        () => false,
      ),
    ).toBe("keeper");
  });

  it("is the host for any unmatched report while the pane glides", () => {
    expect(
      moveLedger().moverOf(
        () => away,
        () => true,
      ),
    ).toBe("host");
  });

  it("forgets placements older than it remembers", () => {
    const ledger = moveLedger();
    ledger.hostPlaces(home, () => undefined);
    for (let step = 1; step <= placementsRemembered; step += 1) {
      ledger.hostPlaces({ ...away, x: away.x + step * 3 }, () => undefined);
    }
    expect(
      ledger.moverOf(
        () => home,
        () => false,
      ),
    ).toBe("keeper");
  });

  it("stops calling a move the host's when placing throws", () => {
    const ledger = moveLedger();
    expect(() =>
      ledger.hostPlaces(home, () => {
        throw new Error("the window is gone");
      }),
    ).toThrow("the window is gone");
    expect(
      ledger.moverOf(
        () => away,
        () => false,
      ),
    ).toBe("keeper");
  });
});
