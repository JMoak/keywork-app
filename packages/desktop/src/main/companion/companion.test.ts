import { describe, expect, it } from "vitest";
import { companionChannels } from "./channels.ts";
import { startCompanion, warmAfterLaunchMs } from "./companion.ts";
import { layoutKeyOf } from "./placement.ts";
import {
  fakePorts,
  idleSnapshot,
  lastConditions,
  porchSnapshot,
  primaryDisplay,
  secondDisplay,
  workingSnapshot,
} from "./testing.ts";
import { firstPaintBudgetMs } from "./tiers.ts";

const home = { x: 1760, y: 844, width: 144, height: 180 };

describe("the master switch", () => {
  it("off creates no window, registers no shortcut and never wakes on a publish", async () => {
    const ports = fakePorts({ prefs: { shortcut: "Control+Alt+K" } });
    const companion = await startCompanion(ports);
    companion.publish(porchSnapshot);
    await companion.settle();
    expect(companion.presence()).toEqual({
      mode: "off",
      window: "none",
      reason: "companions are off",
    });
    expect(ports.windows.created).toHaveLength(0);
    expect(ports.shortcuts.registered.size).toBe(0);
    expect(ports.book.writes).toBe(0);
  });

  it("off with the opt-in answered creates no window, at launch and after the warm-up timer", async () => {
    const ports = fakePorts({ prefs: { optInOffered: true, shortcut: "Control+Alt+K" } });
    const companion = await startCompanion(ports);
    expect(ports.windows.created).toHaveLength(0);
    ports.clock.advance(warmAfterLaunchMs);
    await companion.settle();
    companion.publish(porchSnapshot);
    await companion.settle();
    expect(ports.windows.created).toHaveLength(0);
    expect(ports.shortcuts.registered.size).toBe(0);
    expect(companion.presence()).toEqual({
      mode: "off",
      window: "none",
      reason: "companions are off",
    });
  });

  it("turning it off destroys the window and releases the shortcut", async () => {
    const ports = fakePorts({ prefs: { enabled: true, shortcut: "Control+Alt+K" } });
    const companion = await startCompanion(ports);
    expect(ports.shortcuts.registered.has("Control+Alt+K")).toBe(true);
    await companion.setPreferences({ enabled: false });
    expect(ports.windows.created[0]?.destroyed).toBe(true);
    expect(ports.shortcuts.registered.size).toBe(0);
    expect(companion.presence().mode).toBe("off");
  });
});

describe("the floating window", () => {
  it("is built per the construction rules, shown inactive at home, and never focused", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    const window = ports.windows.created[0];
    expect(window).toBeDefined();
    if (window === undefined) return;
    expect(window.options).toMatchObject({
      frame: false,
      transparent: true,
      resizable: false,
      hasShadow: false,
      roundedCorners: false,
      thickFrame: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      focusable: false,
      acceptFirstMouse: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: true,
      },
    });
    expect(window.getBounds()).toEqual(home);
    expect(window.calls).toEqual([
      "setAlwaysOnTop:true:floating",
      "setIgnoreMouseEvents:true:forward",
      "showInactive",
    ]);
    expect(window.calls).not.toContain("focus");
    expect(window.calls).not.toContain("show");
    expect(lastConditions(window)?.ceiling).toBe("ambient");
    expect(companion.presence().window).toBe("shown");
  });

  it("uses a panel on macOS and leaves focusable alone off Windows", async () => {
    const mac = fakePorts({ platform: "darwin", prefs: { enabled: true } });
    await startCompanion(mac);
    expect(mac.windows.created[0]?.options).toMatchObject({
      type: "panel",
      hiddenInMissionControl: true,
    });
    expect(mac.windows.created[0]?.options.focusable).toBeUndefined();
    expect(mac.windows.created[0]?.calls).toContain("setVisibleOnAllWorkspaces:true:true");
    const linux = fakePorts({ platform: "linux", prefs: { enabled: true } });
    await startCompanion(linux);
    expect(linux.windows.created[0]?.calls).toContain("setIgnoreMouseEvents:true");
  });

  it("Hide is durable: no window, no wake on a publish, and still hidden after a relaunch", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const first = await startCompanion(ports);
    await first.hide();
    expect(ports.windows.created[0]?.destroyed).toBe(true);
    first.publish(porchSnapshot);
    await first.settle();
    expect(ports.windows.created).toHaveLength(1);
    first.dispose();
    const relaunched = await startCompanion(ports);
    relaunched.publish(porchSnapshot);
    await relaunched.settle();
    expect(ports.windows.created).toHaveLength(1);
    expect(relaunched.presence()).toMatchObject({ mode: "floating", window: "none" });
    await relaunched.show();
    expect(ports.windows.created).toHaveLength(2);
    expect(ports.windows.created[1]?.visible).toBe(true);
  });

  it("tucks under a hidden ceiling on lock and comes back inactive on unlock", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    const window = ports.windows.created[0];
    if (window === undefined) throw new Error("no window");
    ports.power.lock();
    await companion.settle();
    expect(companion.presence()).toMatchObject({ window: "tucked" });
    expect(window.visible).toBe(false);
    expect(lastConditions(window)?.ceiling).toBe("hidden");
    ports.power.unlock();
    await companion.settle();
    expect(window.visible).toBe(true);
    expect(window.calls.filter((call) => call === "showInactive")).toHaveLength(2);
    expect(lastConditions(window)?.ceiling).toBe("ambient");
  });

  it("tucks while a fullscreen or presenting app is in front", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    ports.foreground.set("busy");
    await companion.settle();
    expect(companion.presence().reason).toBe("a fullscreen or presenting app is in front");
    expect(ports.windows.created[0]?.visible).toBe(false);
    ports.foreground.set("free");
    await companion.settle();
    expect(ports.windows.created[0]?.visible).toBe(true);
  });

  it("rests when the system has been idle, and wakes when it is active again", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    const window = ports.windows.created[0];
    if (window === undefined) throw new Error("no window");
    ports.power.idle = "idle";
    ports.clock.advance(30_000);
    await companion.settle();
    expect(lastConditions(window)?.ceiling).toBe("rest");
    ports.power.idle = "active";
    ports.clock.advance(30_000);
    await companion.settle();
    expect(lastConditions(window)?.ceiling).toBe("ambient");
  });

  it("floats only while something works when asked to", async () => {
    const ports = fakePorts({ prefs: { enabled: true, onlyWhileBusy: true } });
    const companion = await startCompanion(ports);
    expect(companion.presence()).toMatchObject({ window: "tucked" });
    expect(ports.windows.created).toHaveLength(0);
    companion.publish(workingSnapshot);
    await companion.settle();
    expect(ports.windows.created[0]?.visible).toBe(true);
    companion.publish(idleSnapshot);
    await companion.settle();
    expect(ports.windows.created[0]?.visible).toBe(false);
  });
});

describe("the transparency self-test", () => {
  it("falls back to the pane on a black result, keeps the preference, and reruns only on a new GPU", async () => {
    const ports = fakePorts({ prefs: { enabled: true }, transparency: "opaque" });
    const first = await startCompanion(ports);
    expect(first.presence()).toMatchObject({ mode: "pane", window: "none" });
    expect(ports.windows.created[0]?.destroyed).toBe(true);
    expect(first.preferences().mode).toBe("floating");
    expect(first.preferences().selfTest).toMatchObject({ result: "opaque", gpu: "gpu-a" });
    expect(ports.logs.at(-1)).toContain("transparency self-test failed");
    first.dispose();
    const again = await startCompanion(ports);
    expect(ports.selfTest.runs).toBe(1);
    expect(again.presence().mode).toBe("pane");
    again.dispose();
    ports.selfTest.gpuName = "gpu-b";
    ports.selfTest.verdict = "clear";
    const newGpu = await startCompanion(ports);
    expect(ports.selfTest.runs).toBe(2);
    expect(newGpu.presence()).toMatchObject({ mode: "floating", window: "shown" });
  });

  it("runs on every enable, even when this GPU already has a clear record", async () => {
    const ports = fakePorts({
      prefs: { selfTest: { result: "clear", gpu: "gpu-a", at: "earlier" } },
    });
    const companion = await startCompanion(ports);
    await companion.setPreferences({ enabled: true });
    expect(ports.selfTest.runs).toBe(1);
    expect(companion.presence()).toMatchObject({ mode: "floating", window: "shown" });
    expect(ports.logs).toContain(
      "companion: transparency self-test clear: the fake capture reads clear",
    );
    await companion.setPreferences({ enabled: false });
    await companion.setPreferences({ enabled: true });
    expect(ports.selfTest.runs).toBe(2);
  });

  it("retests an opaque record when the keeper turns the companion back on", async () => {
    const ports = fakePorts({
      prefs: { enabled: true, selfTest: { result: "opaque", gpu: "gpu-a", at: "earlier" } },
    });
    const companion = await startCompanion(ports);
    expect(companion.presence().mode).toBe("pane");
    expect(ports.windows.created).toHaveLength(0);
    await companion.setPreferences({ enabled: false });
    ports.selfTest.verdict = "clear";
    await companion.setPreferences({ enabled: true });
    expect(ports.selfTest.runs).toBe(1);
    expect(companion.presence()).toMatchObject({ mode: "floating", window: "shown" });
    expect(companion.preferences().selfTest?.result).toBe("clear");
  });

  it("floats on an inconclusive verdict and retests on the next display change", async () => {
    const ports = fakePorts({ prefs: { enabled: true }, transparency: "unknown" });
    const companion = await startCompanion(ports);
    expect(ports.selfTest.runs).toBe(1);
    expect(companion.presence()).toMatchObject({ mode: "floating", window: "shown" });
    expect(ports.windows.created[0]?.visible).toBe(true);
    ports.selfTest.verdict = "opaque";
    ports.screen.set([primaryDisplay]);
    await companion.settle();
    expect(ports.selfTest.runs).toBe(2);
    expect(companion.presence()).toMatchObject({ mode: "pane", window: "none" });
    expect(ports.windows.created[0]?.destroyed).toBe(true);
    ports.screen.set([primaryDisplay, secondDisplay]);
    await companion.settle();
    expect(ports.selfTest.runs).toBe(2);
  });

  it("stops retesting on display changes once a verdict is conclusive", async () => {
    const ports = fakePorts({ prefs: { enabled: true }, transparency: "unknown" });
    const companion = await startCompanion(ports);
    ports.selfTest.verdict = "clear";
    ports.screen.set([primaryDisplay]);
    await companion.settle();
    expect(ports.selfTest.runs).toBe(2);
    expect(ports.windows.created[0]?.visible).toBe(true);
    ports.screen.set([primaryDisplay, secondDisplay]);
    await companion.settle();
    expect(ports.selfTest.runs).toBe(2);
    expect(companion.preferences().selfTest?.result).toBe("clear");
  });

  it("paints within the first-paint budget on enable and tests transparency on the shown window after", async () => {
    const ports = fakePorts({
      prefs: { selfTest: { result: "clear", gpu: "gpu-a", at: "earlier" } },
    });
    const pageLoadMs = 150;
    const captureMs = 900;
    const order: string[] = [];
    ports.windows.load = async () => {
      ports.clock.advance(pageLoadMs);
      ports.ipc.emit(companionChannels.ready, ports.petSender());
      order.push("painted");
    };
    const shownAtTest: boolean[] = [];
    const capture = ports.selfTest.run;
    ports.selfTest.run = async (window) => {
      shownAtTest.push(window.isVisible());
      ports.clock.advance(captureMs);
      order.push("self-test");
      return capture(window);
    };
    const companion = await startCompanion(ports);
    await companion.setPreferences({ enabled: true });
    expect(ports.logs).toContain(
      `companion painted in ${pageLoadMs} ms (within ${firstPaintBudgetMs} ms)`,
    );
    expect(order).toEqual(["painted", "self-test"]);
    expect(shownAtTest).toEqual([true]);
    expect(ports.windows.created[0]?.visible).toBe(true);
    expect(companion.presence()).toMatchObject({ mode: "floating", window: "shown" });
  });

  it("an opaque verdict on the shown window still sends the creature to the pane", async () => {
    const ports = fakePorts({ transparency: "opaque" });
    const companion = await startCompanion(ports);
    await companion.setPreferences({ enabled: true });
    expect(ports.selfTest.runs).toBe(1);
    expect(companion.presence()).toMatchObject({ mode: "pane", window: "none" });
    expect(ports.windows.created[0]?.destroyed).toBe(true);
  });

  it("Wayland defaults to the pane without creating a window", async () => {
    const ports = fakePorts({ platform: "linux", wayland: true, prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    expect(companion.presence().mode).toBe("pane");
    expect(ports.windows.created).toHaveLength(0);
  });
});

describe("position", () => {
  it("drags, settles onto the edge, remembers per layout, and re-homes on a display change", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    const window = ports.windows.created[0];
    if (window === undefined) throw new Error("no window");
    const pet = ports.petSender();
    ports.ipc.emit(companionChannels.drag, pet, { dx: -1700, dy: -300 });
    ports.ipc.emit(companionChannels.drag, pet, { dx: -100, dy: 0 });
    expect(window.getBounds()).toMatchObject({ x: 0, y: 544 });
    ports.ipc.emit(companionChannels.dragEnd, pet);
    await companion.settle();
    const key = layoutKeyOf([primaryDisplay, secondDisplay]);
    expect(companion.preferences().positions[key]).toMatchObject({
      displayId: 1,
      edge: "left",
      u: 0.075,
    });
    ports.screen.set([secondDisplay]);
    await companion.settle();
    expect(window.getBounds()).toEqual({ x: 4320, y: 1204, width: 144, height: 180 });
    ports.screen.set([primaryDisplay, secondDisplay]);
    await companion.settle();
    expect(window.getBounds()).toMatchObject({ x: 0, y: 544 });
  });

  it("nudges by arrow steps and Escape sends it home", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    const window = ports.windows.created[0];
    if (window === undefined) throw new Error("no window");
    const pet = ports.petSender();
    ports.ipc.emit(companionChannels.nudge, pet, { dx: -1, dy: -1 });
    expect(window.getBounds()).toMatchObject({ x: 1752, y: 836 });
    ports.ipc.emit(companionChannels.home, pet);
    await companion.settle();
    expect(window.getBounds()).toEqual(home);
  });

  it("grows upward from its anchor for a needs-you bubble and shrinks back under Quiet", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    const window = ports.windows.created[0];
    if (window === undefined) throw new Error("no window");
    companion.publish(porchSnapshot);
    await companion.settle();
    expect(window.getBounds()).toEqual({ x: 1616, y: 788, width: 288, height: 236 });
    await companion.setPreferences({ quiet: true });
    expect(window.getBounds()).toEqual(home);
    expect(lastConditions(window)?.quiet).toBe(true);
  });
});

describe("input", () => {
  it("ignores strangers, toggles click-through from the hit test, and never mid-drag", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    await startCompanion(ports);
    const window = ports.windows.created[0];
    if (window === undefined) throw new Error("no window");
    const pet = ports.petSender();
    ports.ipc.emit(companionChannels.interactive, { id: 999 }, true);
    expect(window.ignores).toEqual([{ ignore: true, forward: true }]);
    ports.ipc.emit(companionChannels.interactive, pet, true);
    expect(window.ignores.at(-1)).toEqual({ ignore: false, forward: undefined });
    ports.ipc.emit(companionChannels.drag, pet, { dx: 1, dy: 0 });
    ports.ipc.emit(companionChannels.interactive, pet, false);
    expect(window.ignores).toHaveLength(2);
    ports.ipc.emit(companionChannels.dragEnd, pet);
    ports.ipc.emit(companionChannels.interactive, pet, false);
    expect(window.ignores.at(-1)).toEqual({ ignore: true, forward: true });
  });

  it("opens the console on the highest-priority thread and relays answers", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    const pet = ports.petSender();
    companion.publish(porchSnapshot);
    await companion.settle();
    ports.ipc.emit(companionChannels.open, pet, undefined);
    expect(ports.console.focused).toEqual(["t1"]);
    expect(ports.console.sent).toContainEqual([companionChannels.openRequested, "t1"]);
    ports.ipc.emit(companionChannels.answer, pet, { callId: "c1", pick: "deny" });
    expect(ports.console.sent.at(-1)).toEqual([
      companionChannels.answerRequested,
      { callId: "c1", pick: "deny" },
    ]);
  });

  it("the context menu offers Hide, Still, Quiet, Size and Settings and acts on them", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    const window = ports.windows.created[0];
    if (window === undefined) throw new Error("no window");
    ports.ipc.emit(companionChannels.menu, ports.petSender(), { x: 4, y: 4 });
    const popup = ports.popups[0];
    if (popup === undefined) throw new Error("no popup");
    const labels = popup.items.flatMap((item) => ("label" in item ? [item.label] : []));
    expect(labels).toEqual(["Open the console", "Hide", "Still", "Quiet", "Size", "Settings…"]);
    popup.act("still");
    popup.act("size", "150");
    await companion.settle();
    expect(companion.preferences()).toMatchObject({ still: true, size: 150 });
    expect(window.getBounds()).toEqual({ x: 1712, y: 778, width: 192, height: 246 });
    expect(lastConditions(window)).toMatchObject({ still: true, scale: 150 });
    popup.act("settings");
    expect(ports.console.sent.at(-1)).toEqual([companionChannels.settingsRequested, undefined]);
    popup.act("hide");
    await companion.settle();
    expect(window.destroyed).toBe(true);
  });
});

describe("the shortcut", () => {
  it("refuses an OS chord, registers a free one once, toggles Hide, and lets go when disabled", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    await companion.setPreferences({ shortcut: "Ctrl+Space" });
    expect(ports.shortcuts.registered.size).toBe(0);
    expect(ports.logs.some((line) => line.includes("belongs to the OS"))).toBe(true);
    await companion.setPreferences({ shortcut: "Ctrl+Alt+K" });
    await companion.setPreferences({ still: true });
    expect([...ports.shortcuts.registered.keys()]).toEqual(["Control+Alt+K"]);
    ports.shortcuts.registered.get("Control+Alt+K")?.();
    await companion.settle();
    expect(companion.preferences().hidden).toBe(true);
    await companion.setPreferences({ shortcut: null });
    expect(ports.shortcuts.registered.size).toBe(0);
  });
});

describe("the console port", () => {
  it("answers preference and presence calls only from the console and announces changes", async () => {
    const ports = fakePorts({ prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    const stranger = { id: 42 };
    expect(await ports.ipc.invoke(companionChannels.preferences, stranger)).toBeUndefined();
    expect(await ports.ipc.invoke(companionChannels.presence, ports.console.sender)).toEqual(
      companion.presence(),
    );
    await ports.ipc.invoke(companionChannels.hide, ports.console.sender);
    expect(ports.console.sent).toContainEqual([
      companionChannels.presenceChanged,
      { mode: "floating", window: "none", reason: "hidden until shown" },
    ]);
    ports.ipc.emit(companionChannels.publish, ports.console.sender, workingSnapshot);
    expect(companion.snapshot()).toEqual(workingSnapshot);
    companion.dispose();
    expect(ports.ipc.released).toBe(true);
  });
});

describe("the first enable after launch", () => {
  const coldPageMs = 900;
  const keeperWaitsMs = 180_000;

  function coldPages(ports: ReturnType<typeof fakePorts>): void {
    ports.windows.load = async () => {
      ports.clock.advance(coldPageMs);
      ports.ipc.emit(companionChannels.ready, ports.petSender());
    };
  }

  it("paints within budget from a window pre-created hidden while the opt-in is pending", async () => {
    const ports = fakePorts();
    coldPages(ports);
    const companion = await startCompanion(ports);
    expect(ports.windows.created).toHaveLength(0);
    ports.clock.advance(warmAfterLaunchMs);
    await companion.settle();
    const warm = ports.windows.created[0];
    if (warm === undefined) throw new Error("no window was pre-created");
    expect(warm.visible).toBe(false);
    expect(warm.options).toMatchObject({ show: false, skipTaskbar: true, focusable: false });
    expect(lastConditions(warm)?.ceiling).toBe("hidden");
    expect(ports.logs.filter((line) => line.startsWith("companion painted"))).toEqual([]);

    await companion.setPreferences({ optInOffered: true });
    expect(warm.destroyed).toBe(false);
    ports.clock.advance(keeperWaitsMs);
    await companion.setPreferences({ enabled: true, optInOffered: true });
    expect(ports.windows.created).toHaveLength(1);
    expect(warm.visible).toBe(true);
    expect(ports.logs).toContain(`companion painted in 0 ms (within ${firstPaintBudgetMs} ms)`);
    expect(ports.selfTest.runs).toBe(1);
    expect(companion.presence()).toMatchObject({ mode: "floating", window: "shown" });
  });

  it("pre-creates for a Show when the switch is on but the creature is hidden", async () => {
    const ports = fakePorts({ prefs: { enabled: true, hidden: true, optInOffered: true } });
    coldPages(ports);
    const companion = await startCompanion(ports);
    ports.clock.advance(warmAfterLaunchMs);
    await companion.settle();
    expect(ports.windows.created[0]?.visible).toBe(false);
    ports.clock.advance(keeperWaitsMs);
    await companion.show();
    expect(ports.windows.created).toHaveLength(1);
    expect(ports.logs).toContain(`companion painted in 0 ms (within ${firstPaintBudgetMs} ms)`);
  });

  it("drops the pre-created window once the keeper prefers a presence that never floats", async () => {
    const ports = fakePorts();
    const companion = await startCompanion(ports);
    ports.clock.advance(warmAfterLaunchMs);
    await companion.settle();
    await companion.setPreferences({ mode: "pane" });
    expect(ports.windows.created[0]?.destroyed).toBe(true);
    expect(companion.presence().mode).toBe("off");
  });

  it("creates nothing for a keeper who turned companions off, and logs a cold page over budget", async () => {
    const ports = fakePorts({ prefs: { optInOffered: true } });
    coldPages(ports);
    const companion = await startCompanion(ports);
    ports.clock.advance(warmAfterLaunchMs + keeperWaitsMs);
    await companion.settle();
    expect(ports.windows.created).toHaveLength(0);
    await companion.setPreferences({ enabled: true });
    expect(ports.logs).toContain(
      `companion painted in ${coldPageMs} ms (OVER ${firstPaintBudgetMs} ms)`,
    );
  });
});

describe("a launch with the companion on", () => {
  const pageLoadMs = 320;
  const gpuInfoMs = 400;

  it("creates and shows the window at launch, ahead of the GPU fingerprint, and paints within budget from launch", async () => {
    const ports = fakePorts({
      prefs: {
        enabled: true,
        optInOffered: true,
        selfTest: { result: "clear", gpu: "gpu-a", at: "earlier" },
      },
    });
    const launchedAt = ports.clock.now();
    const order: string[] = [];
    ports.windows.load = async () => {
      order.push(`load at ${ports.clock.now() - launchedAt}`);
      ports.clock.advance(pageLoadMs);
      ports.ipc.emit(companionChannels.ready, ports.petSender());
    };
    ports.selfTest.gpu = async () => {
      order.push("gpu");
      ports.clock.advance(gpuInfoMs);
      return ports.selfTest.gpuName;
    };
    const companion = await startCompanion(ports);
    expect(order[0]).toBe("load at 0");
    expect(ports.windows.created).toHaveLength(1);
    expect(ports.windows.created[0]?.visible).toBe(true);
    expect(ports.logs).toContain(
      `companion painted in ${pageLoadMs} ms (within ${firstPaintBudgetMs} ms)`,
    );
    expect(companion.presence()).toMatchObject({ mode: "floating", window: "shown" });
  });

  it("floats again, after the launch, when the GPU no longer matches a stored opaque verdict", async () => {
    const ports = fakePorts({
      prefs: { enabled: true, selfTest: { result: "opaque", gpu: "gpu-b", at: "earlier" } },
    });
    const companion = await startCompanion(ports);
    expect(companion.presence().window).toBe("shown");
    expect(ports.selfTest.runs).toBe(1);
  });
});

describe("a tucked companion", () => {
  function sampled(ports: ReturnType<typeof fakePorts>): void {
    ports.metrics = {
      mainUsage: () => ({ percentCPUUsage: 0.01 }),
      metrics: () => [
        { pid: 4001, cpu: { percentCPUUsage: 0 }, memory: { workingSetSize: 30_000 } },
      ],
      logicalProcessors: () => 8,
    };
  }

  it("sends its page nothing while tucked, reads hidden with zero wakeups, and resumes with the latest snapshot", async () => {
    const ports = fakePorts({ dev: true, prefs: { enabled: true, optInOffered: true } });
    sampled(ports);
    const companion = await startCompanion(ports);
    const window = ports.windows.created[0];
    if (window === undefined) throw new Error("no companion window");
    companion.publish(idleSnapshot);
    await companion.settle();
    ports.ipc.emit(companionChannels.wakeups, ports.petSender(), { count: 40, tier: "ambient" });
    ports.foreground.set("busy");
    await companion.settle();
    expect(companion.presence().window).toBe("tucked");
    expect(window.visible).toBe(false);
    expect(lastConditions(window)?.ceiling).toBe("hidden");
    const sentAtTuck = window.sent.length;
    companion.publish(workingSnapshot);
    companion.publish(porchSnapshot);
    await companion.settle();
    expect(window.sent.length).toBe(sentAtTuck);
    ports.logs.length = 0;
    ports.clock.advance(60_000);
    const lines = ports.logs.filter((line) => line.startsWith("companion "));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/^companion hidden · .* wakeups 0\.0\/s of 0\.0\/s/);
      expect(line).not.toContain("OVER");
    }
    ports.foreground.set("free");
    await companion.settle();
    expect(window.visible).toBe(true);
    expect(lastConditions(window)?.ceiling).not.toBe("hidden");
    const snapshots = window.sent.filter(([channel]) => channel === companionChannels.snapshot);
    expect(snapshots.at(-1)?.[1]).toEqual(porchSnapshot);
  });
});
