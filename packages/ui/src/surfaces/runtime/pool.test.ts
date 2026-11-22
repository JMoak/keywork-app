import { afterEach, describe, expect, it } from "vitest";
import {
  createWindowPool,
  type PooledWindow,
  type Prepared,
  type WindowPool,
  WindowRefused,
} from "./pool.ts";
import type { Realm } from "./realm.ts";
import { type FakeDesktop, type FakeDesktopOptions, fakeDesktop, turn } from "./testing.ts";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("the warm window pool", () => {
  it("opens blank windows ahead of need under the frame names the desktop adopts", async () => {
    const { desktop, pool, prepared } = bench();
    pool.warm();
    expect(desktop.calls).toEqual([
      "open about:blank kw-surface:1",
      "open about:blank kw-surface:2",
      "open about:blank kw-surface:3",
    ]);
    expect(prepared).toEqual(desktop.opened);
  });

  it("hands a warm window out at once, named by the id the desktop announced", async () => {
    const { desktop, pool } = bench();
    pool.warm();
    await turn();
    const order: string[] = [];
    const taking = pool.take().then((taken) => {
      order.push(`took ${taken.id}`);
      return taken;
    });
    await Promise.resolve();
    order.push("next microtask");
    expect(order).toEqual(["took kw-surface:1", "next microtask"]);
    expect((await taking).window).toBe(desktop.opened[0]);
  });

  it("accepts the bare number of a frame as its id too", async () => {
    const { desktop, pool } = bench({ announces: false });
    const taking = pool.take();
    desktop.emit({ kind: "ready", id: "1" });
    expect((await taking).id).toBe("1");
  });

  it("counts the windows standing warm, down as each is taken and up as the pool refills", async () => {
    const { pool } = bench();
    expect(pool.warmCount()).toBe(0);
    pool.warm(2);
    await turn();
    expect(pool.warmCount()).toBe(2);
    await pool.take();
    expect(pool.warmCount()).toBe(1);
    await turn();
    expect(pool.warmCount()).toBe(2);
  });

  it("keeps an announcement that arrives while the window is still opening", async () => {
    const desktop = fakeDesktop({ announces: false });
    const pool = createWindowPool({
      port: desktop.port,
      open: (url, frame) => {
        const child = desktop.open(url, frame);
        desktop.announce(frame);
        return child;
      },
      prepare: () => ready,
      lost: () => undefined,
    });
    cleanups.push(pool.dispose, desktop.closeEverything);
    expect((await pool.take()).id).toBe("kw-surface:1");
  });

  it("refills when idle after one is taken", async () => {
    const { desktop, pool } = bench();
    pool.warm(2);
    await turn();
    await pool.take();
    expect(desktop.opened).toHaveLength(2);
    await turn();
    expect(desktop.opened).toHaveLength(3);
  });

  it("waits for the announcement and for the document to be prepared before a window is warm", async () => {
    const preparing = deferredPreparation();
    const { desktop, pool } = bench({ announces: false }, preparing.prepare);
    let taken: PooledWindow | undefined;
    void pool.take().then((warm) => {
      taken = warm;
    });
    desktop.announce("kw-surface:1");
    await turn();
    expect(taken).toBeUndefined();
    preparing.settle();
    await turn();
    expect(taken?.window).toBe(desktop.opened[0]);
  });

  it("opens one on demand when none is warm, one per waiting taker", async () => {
    const { desktop, pool } = bench();
    const [first, second] = await Promise.all([pool.take(), pool.take()]);
    expect([first.id, second.id]).toEqual(["kw-surface:1", "kw-surface:2"]);
    expect(desktop.opened).toHaveLength(2);
  });

  it("refuses a taker when the desktop will not open a window", async () => {
    const { pool } = bench({ refusesToOpen: true });
    await expect(pool.take()).rejects.toBeInstanceOf(WindowRefused);
  });

  it("refuses a taker and closes the window when it is never announced", async () => {
    const { desktop, pool } = bench({ announces: false }, undefined, 5);
    await expect(pool.take()).rejects.toThrow("did not open in time");
    expect(desktop.opened[0]?.closed).toBe(true);
  });

  it("refuses a taker when the document cannot be prepared, and lets the window go", async () => {
    const preparing = deferredPreparation();
    const { desktop, pool } = bench({}, preparing.prepare);
    const taking = pool.take();
    preparing.fail(new Error("app.css did not load"));
    await expect(taking).rejects.toThrow("app.css did not load");
    expect(desktop.opened[0]?.closed).toBe(true);
    expect(preparing.disposed()).toBe(1);
  });

  it("hides a window that is given back and hands it out again", async () => {
    const { desktop, pool } = bench();
    pool.warm(1);
    await turn();
    const taken = await pool.take();
    pool.give(taken);
    pool.give(taken);
    expect(desktop.calls.filter((call) => call.startsWith("hide"))).toEqual(["hide kw-surface:1"]);
    expect(await pool.take()).toBe(taken);
    expect(desktop.opened).toHaveLength(1);
  });

  it("closes a returned window the pool has no room for", async () => {
    const { desktop, pool } = bench();
    pool.warm(1);
    await turn();
    const taken = await pool.take();
    await turn();
    pool.give(taken);
    expect(desktop.calls).toContain("close kw-surface:1");
    expect(desktop.calls).not.toContain("hide kw-surface:1");
  });

  it("forgets an idle window the desktop reports closed, and opens another when idle", async () => {
    const { desktop, pool, lost } = bench();
    pool.warm(1);
    await turn();
    desktop.emit({ kind: "closed", id: "kw-surface:1" });
    await turn();
    expect(lost).toEqual([]);
    expect((await pool.take()).id).toBe("kw-surface:2");
  });

  it("reports a taken window that closes underneath, by event or by its page going away", async () => {
    const { desktop, pool, lost } = bench();
    const first = await pool.take();
    const second = await pool.take();
    desktop.emit({ kind: "closed", id: first.id });
    desktop.emit({ kind: "closed", id: first.id });
    second.window.dispatchEvent(new Event("pagehide"));
    expect(lost).toEqual([first, second]);
  });

  it("keeps a whole burst warm one window a turn, hands it out at once, and keeps only the reserve after", async () => {
    const { desktop, pool } = bench({}, undefined, undefined, 12);
    pool.warm();
    expect(desktop.opened).toHaveLength(3);
    await turns(12);
    expect(pool.warmCount()).toBe(12);
    const burst = await Promise.all(Array.from({ length: 12 }, () => pool.take()));
    expect(desktop.opened).toHaveLength(12);
    await turns(6);
    expect(pool.warmCount()).toBe(3);
    for (const taken of burst) pool.give(taken);
    expect(pool.warmCount()).toBe(12);
    expect(desktop.calls.filter((call) => call.startsWith("close"))).toHaveLength(3);
  });

  it("closes every window and refuses takers once disposed", async () => {
    const { desktop, pool } = bench({ announces: false });
    pool.warm(1);
    desktop.announce("kw-surface:1");
    await turn();
    const taken = await pool.take();
    const refused = expect(pool.take()).rejects.toBeInstanceOf(WindowRefused);
    pool.dispose();
    await refused;
    expect(desktop.calls).toContain(`close ${taken.id}`);
    expect(desktop.opened.every((child) => child.closed)).toBe(true);
    await expect(pool.take()).rejects.toBeInstanceOf(WindowRefused);
  });
});

function bench(
  options: FakeDesktopOptions = {},
  prepare: (child: Realm) => Prepared = () => ready,
  warmWithinMs?: number,
  burst?: number,
): { desktop: FakeDesktop; pool: WindowPool; prepared: Realm[]; lost: PooledWindow[] } {
  const desktop = fakeDesktop(options);
  const prepared: Realm[] = [];
  const lost: PooledWindow[] = [];
  const pool = createWindowPool({
    port: desktop.port,
    open: desktop.open,
    prepare: (child) => {
      prepared.push(child);
      return prepare(child);
    },
    lost: (taken) => lost.push(taken),
    warmWithinMs,
    burst,
  });
  cleanups.push(pool.dispose, desktop.closeEverything);
  return { desktop, pool, prepared, lost };
}

const ready: Prepared = { settled: Promise.resolve(), dispose: () => undefined };

async function turns(count: number): Promise<void> {
  for (let passed = 0; passed < count; passed += 1) await turn();
}

function deferredPreparation() {
  let settle: () => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  let disposed = 0;
  const settled = new Promise<void>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return {
    prepare: (): Prepared => ({
      settled,
      dispose: () => {
        disposed += 1;
      },
    }),
    settle: () => settle(),
    fail: (error: Error) => fail(error),
    disposed: () => disposed,
  };
}
