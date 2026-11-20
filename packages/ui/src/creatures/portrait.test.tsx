import type { PoseName } from "@keywork-app/habitat";
import { loadSkin } from "@keywork-app/habitat/skins";
import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreaturePortrait, portraitFit } from "./portrait.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the shared creature portrait", () => {
  it("keeps native and detailed artwork at the same display size and caps backing storage", () => {
    for (const dpr of [1, 1.25, 2, 3, 12]) {
      const native = portraitFit({ width: 48, height: 52 }, 2, dpr);
      const detailed = portraitFit({ width: 96, height: 104 }, 2, dpr);
      expect([native.cssWidth, native.cssHeight]).toEqual([192, 208]);
      expect([detailed.cssWidth, detailed.cssHeight]).toEqual([192, 208]);
      expect(native.scale).toBeLessThanOrEqual(8);
      expect(detailed.width * detailed.height * 4).toBeLessThan(4 * 1024 * 1024);
    }
    expect(portraitFit({ width: 48, height: 52 }, Number.NaN, Infinity).scale).toBe(2);
    expect(portraitFit({ width: 96, height: 52 }, 1, 1).cssWidth).toBe(96);
  });

  it("previews authored poses with their own timing, freezes on pause, and resets a changed pose", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const [clip, setClip] = createSignal<PoseName>("work");
    const [playing, setPlaying] = createSignal(true);
    const view = render(() => (
      <CreaturePortrait skin="folio" hueStop={1} clip={clip()} playing={playing()} />
    ));
    const canvas = () => view.getByRole("img");
    const loaded = loadSkin("folio");
    if (!loaded.ok) throw new Error("Folio missing");
    const hold = loaded.skin.rows.work.ms[0] ?? 0;
    vi.advanceTimersByTime(hold - 1);
    expect(canvas().dataset.frame).toBe("0");
    vi.advanceTimersByTime(1);
    expect(canvas().dataset.frame).toBe("1");
    setPlaying(false);
    vi.advanceTimersByTime(10_000);
    expect(canvas().dataset.frame).toBe("1");
    expect(vi.getTimerCount()).toBe(0);
    setClip("nap");
    expect(canvas().dataset.frame).toBe("0");
    expect(canvas().dataset.clip).toBe("nap");
    setPlaying(true);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reuses resolved pigments during animation and ignores unchanged display density", () => {
    vi.useFakeTimers();
    let paints = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      imageSmoothingEnabled: false,
      clearRect: () => {
        paints += 1;
      },
      fillRect: () => undefined,
    } as unknown as CanvasRenderingContext2D);
    const styles = vi.spyOn(window, "getComputedStyle");
    const view = render(() => <CreaturePortrait skin="folio" hueStop={1} clip="work" />);
    const reads = styles.mock.calls.length;
    const before = paints;
    const loaded = loadSkin("folio");
    if (!loaded.ok) throw new Error("Missing Folio");
    vi.advanceTimersByTime((loaded.skin.rows.work.ms[0] ?? 0) + 1);
    expect(paints).toBeGreaterThan(before);
    expect(styles.mock.calls.length).toBe(reads);
    const animated = paints;
    window.dispatchEvent(new Event("resize"));
    expect(paints).toBe(animated);
    expect(styles.mock.calls.length).toBe(reads);
    view.unmount();
  });

  it("suspends hidden and offscreen previews, leaves thumbnails still, and disconnects observers", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const observations: Array<{
      element: Element | undefined;
      notify: IntersectionObserverCallback;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        readonly held;
        constructor(notify: IntersectionObserverCallback) {
          this.held = { element: undefined as Element | undefined, notify, disconnect: vi.fn() };
          observations.push(this.held);
        }
        observe(element: Element) {
          this.held.element = element;
        }
        disconnect() {
          this.held.disconnect();
        }
      },
    );
    const view = render(() => (
      <>
        <CreaturePortrait skin="tessera" hueStop={1} />
        <CreaturePortrait skin="folio" hueStop={1} playing={false} />
        <CreaturePortrait skin="cairn" hueStop={1} playing={false} />
      </>
    ));
    expect(vi.getTimerCount()).toBe(1);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(1);
    const first = observations.find(
      (observation) => observation.element?.getAttribute("data-skin") === "tessera",
    );
    if (first === undefined) throw new Error("No visibility observer");
    const notify = (intersecting: boolean) =>
      first.notify(
        [{ target: first.element, isIntersecting: intersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    notify(false);
    expect(vi.getTimerCount()).toBe(0);
    notify(true);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(
      observations.every((observation) => observation.disconnect.mock.calls.length === 1),
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
