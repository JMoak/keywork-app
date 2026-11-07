import { describe, expect, it } from "vitest";
import { grantBook, minute, viewGrantTerms } from "./grants.ts";
import { display, grantA, keeper, manualClock, sessionA, tokenA } from "./testing.ts";

function issued() {
  const clock = manualClock();
  const book = grantBook(clock);
  const grant = book.issue({
    id: grantA,
    sessionId: sessionA,
    token: tokenA,
    grantee: keeper,
    displays: [display.id],
  });
  return { clock, book, grant };
}

describe("the screen grant book", () => {
  it("issues a view grant with the expiry, idle timeout and maximum duration of the terms", () => {
    const { clock, grant } = issued();
    expect(grant).toMatchObject({
      scope: "view",
      issuedAt: clock.now(),
      expiresAt: clock.now() + 60 * minute,
      idleTimeoutMs: 5 * minute,
      maxDurationMs: 60 * minute,
      reconfirmEveryMs: 30 * minute,
    });
    expect(viewGrantTerms.scope).toBe("view");
  });

  it("lapses as idle when the viewer stops touching it and stays live while it does", () => {
    const { clock, book } = issued();
    book.started(grantA);
    clock.advance(4 * minute);
    book.touched(grantA);
    clock.advance(4 * minute);
    expect(book.standing(grantA)).toMatchObject({ live: true });
    clock.advance(minute);
    expect(book.standing(grantA)).toEqual({ live: false, reason: "idle" });
    expect(book.due()).toEqual([{ grant: expect.objectContaining({ id: grantA }), due: "idle" }]);
    book.touched(grantA);
    expect(book.standing(grantA)).toEqual({ live: false, reason: "idle" });
  });

  it("caps the session at its maximum duration and the grant at its expiry", () => {
    const clock = manualClock();
    const book = grantBook(clock, {
      ...viewGrantTerms,
      lifetimeMs: 90 * minute,
      reconfirmEveryMs: 120 * minute,
    });
    book.issue({ id: grantA, sessionId: sessionA, token: tokenA, grantee: keeper, displays: [] });
    clock.advance(2 * minute);
    book.started(grantA);
    for (let elapsed = 0; elapsed < 59; elapsed += 1) {
      clock.advance(minute);
      book.touched(grantA);
    }
    expect(book.standing(grantA)).toMatchObject({ live: true });
    clock.advance(minute);
    expect(book.standing(grantA)).toEqual({ live: false, reason: "max-duration" });

    const { clock: other, book: unstarted } = issued();
    other.advance(60 * minute);
    expect(unstarted.standing(grantA)).toEqual({ live: false, reason: "expired" });
  });

  it("asks for reconfirmation once per period and resets when the keeper keeps sharing", () => {
    const { clock, book } = issued();
    book.started(grantA);
    const keepTouching = (minutes: number) => {
      for (let elapsed = 0; elapsed < minutes; elapsed += 1) {
        clock.advance(minute);
        book.touched(grantA);
      }
    };
    keepTouching(29);
    expect(book.due()).toEqual([]);
    keepTouching(1);
    expect(book.due().map((due) => due.due)).toEqual(["reconfirm"]);
    expect(book.due()).toEqual([]);
    book.reconfirmed(grantA);
    keepTouching(29);
    expect(book.due()).toEqual([]);
  });

  it("finds live grants by token, allows only the granted displays, and forgets on revoke", () => {
    const { clock, book } = issued();
    expect(book.byToken(tokenA)?.id).toBe(grantA);
    expect(book.byToken("token-wrong")).toBeUndefined();
    expect(book.allows(grantA, display.id)).toBe(true);
    expect(book.allows(grantA, "another-display")).toBe(false);
    expect(book.bySession(sessionA)?.id).toBe(grantA);
    expect(book.live()).toHaveLength(1);
    expect(book.revoke(grantA)?.id).toBe(grantA);
    expect(book.standing(grantA)).toEqual({ live: false, reason: "unknown" });
    expect(book.byToken(tokenA)).toBeUndefined();
    expect(book.live()).toEqual([]);
    expect(grantBook(clock).live()).toEqual([]);
  });

  it("stops honoring a token once the grant lapses", () => {
    const { clock, book } = issued();
    clock.advance(5 * minute);
    expect(book.byToken(tokenA)).toBeUndefined();
    expect(book.allows(grantA, display.id)).toBe(false);
  });
});
