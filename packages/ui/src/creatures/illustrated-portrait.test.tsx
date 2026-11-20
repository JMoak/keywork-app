import type { Facing } from "@keywork-app/habitat";
import type { Illustration } from "@keywork-app/habitat/render";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { artworkFor } from "./artwork.ts";
import { IllustratedPortrait } from "./illustrated-portrait.tsx";
import { type DecodedIllustration, illustrationLibrary } from "./illustrations.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the full-color creature portrait", () => {
  it("paints the authored neutral crop once, preserves its pigments and original facing, and honors an explicit turn", async () => {
    const context = canvasContext();
    const art = registered("folio");
    const asset = decoded(art);
    const load = vi.spyOn(illustrationLibrary, "load").mockResolvedValue(asset);
    const [hue, setHue] = createSignal(1);
    const [facing, setFacing] = createSignal<Facing>();
    const view = render(() => (
      <IllustratedPortrait
        skin="folio"
        name="Fig"
        hueStop={hue()}
        facing={facing()}
        class="studio-creature"
        size={2}
      />
    ));
    expect(view.getByRole("img").getAttribute("aria-busy")).toBe("true");
    expect(view.container.querySelector("[data-artwork]")).toBeNull();
    await waitFor(() => expect(context.drawImage).toHaveBeenCalledTimes(1));
    const canvas = view.getByRole("img", { name: "Fig, still portrait" }) as HTMLCanvasElement;
    expect(canvas.tagName).toBe("CANVAS");
    expect(canvas.dataset.artwork).toBe("illustrated");
    expect(canvas.dataset.skin).toBe("folio");
    expect(canvas.className).toBe("studio-creature");
    expect(canvas.style.width).toContain("192px");
    expect(canvas.style.imageRendering).toBe("auto");
    const crop = art.still;
    if (!crop) throw new Error("Missing Folio crop");
    expect(context.drawImage.mock.calls[0]?.slice(0, 5)).toEqual([
      asset.image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
    ]);
    expect(context.scale).not.toHaveBeenCalled();
    setHue(4);
    window.dispatchEvent(new Event("resize"));
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    setFacing(art.facing === "left" ? "right" : "left");
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(asset.alphaAt).not.toHaveBeenCalled();
  });

  it("tracks the real stage dimensions and display density without allocating oversized canvases", async () => {
    const context = canvasContext();
    const artwork = registered("cairn");
    vi.spyOn(illustrationLibrary, "load").mockResolvedValue(decoded(artwork));
    let width = 360;
    let dpr = 1.5;
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 0, width, (width * 52) / 48),
    );
    vi.spyOn(window, "devicePixelRatio", "get").mockImplementation(() => dpr);
    const view = render(() => (
      <IllustratedPortrait skin="cairn" name="Clay" hueStop={2} size={2} />
    ));
    await waitFor(() => expect(context.drawImage).toHaveBeenCalledTimes(1));
    const canvas = view.getByRole("img") as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([540, 585]);
    width = 720;
    dpr = 4;
    window.dispatchEvent(new Event("resize"));
    expect(canvas.height).toBe(1024);
    expect(canvas.width).toBe(Math.round((1024 * 48) / 52));
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    dpr = 8;
    window.dispatchEvent(new Event("resize"));
    expect(context.drawImage).toHaveBeenCalledTimes(2);
  });

  it("discards obsolete decodes and removes the previous creature immediately on a change of identity", async () => {
    const context = canvasContext();
    const pending = new Map<string, (asset: DecodedIllustration) => void>();
    vi.spyOn(illustrationLibrary, "load").mockImplementation(
      (art) => new Promise((resolve) => pending.set(art.id, resolve)),
    );
    const [skin, setSkin] = createSignal("folio");
    const view = render(() => <IllustratedPortrait skin={skin()} name={skin()} hueStop={1} />);
    const complete = (skin: string) => {
      const art = registered(skin);
      const asset = decoded(art);
      const resolve = pending.get(art.id);
      if (!resolve) throw new Error("Missing pending image");
      resolve(asset);
      return asset;
    };
    setSkin("tessera");
    complete("folio");
    await Promise.resolve();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(view.getByRole("img", { name: "tessera, loading portrait" })).toBeDefined();
    const tessera = complete("tessera");
    await waitFor(() => expect(context.drawImage).toHaveBeenCalledTimes(1));
    expect(context.drawImage.mock.calls[0]?.[0]).toBe(tessera.image);
    setSkin("cairn");
    expect(view.container.querySelector("[data-artwork]")).toBeNull();
    expect(view.getByRole("img").dataset.skin).toBe("cairn");
    view.unmount();
    complete("cairn");
    await Promise.resolve();
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  });

  it("falls back to the requested creature's still indexed portrait when art is absent, broken or cannot paint", async () => {
    const context = canvasContext();
    const load = vi
      .spyOn(illustrationLibrary, "load")
      .mockRejectedValueOnce(new Error("bad PNG"))
      .mockResolvedValueOnce(decoded(registered("tessera")));
    const [skin, setSkin] = createSignal("kid");
    const view = render(() => <IllustratedPortrait skin={skin()} name="Keeper" hueStop={2} />);
    const current = () => view.getByRole("img", { name: "Keeper, idle" });
    expect(current().dataset.skin).toBe("kid");
    expect(current().hasAttribute("data-still")).toBe(true);
    expect(load).not.toHaveBeenCalled();
    setSkin("folio");
    await waitFor(() => expect(current().dataset.skin).toBe("folio"));
    context.drawImage.mockImplementationOnce(() => {
      throw new Error("canvas unavailable");
    });
    setSkin("tessera");
    await waitFor(() => expect(current().dataset.skin).toBe("tessera"));
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(current().dataset.artwork).toBeUndefined();
    expect(current().hasAttribute("data-still")).toBe(true);
  });

  it("switches to a high-contrast still in forced colors and releases all media and geometry listeners", async () => {
    const context = canvasContext();
    const forcedQuery = "(forced-colors: active)";
    let contrast = false;
    const listeners = new Map<string, Set<() => void>>();
    vi.stubGlobal("matchMedia", (query: string) => {
      const held = listeners.get(query) ?? new Set<() => void>();
      listeners.set(query, held);
      return {
        matches: query === forcedQuery && contrast,
        addEventListener: (_: string, fn: () => void) => held.add(fn),
        removeEventListener: (_: string, fn: () => void) => held.delete(fn),
      };
    });
    const changeContrast = (active: boolean) => {
      contrast = active;
      for (const notify of [...(listeners.get(forcedQuery) ?? [])]) notify();
    };
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect = disconnect;
      },
    );
    const remove = vi.spyOn(window, "removeEventListener");
    vi.spyOn(illustrationLibrary, "load").mockResolvedValue(decoded(registered("cairn")));
    const view = render(() => <IllustratedPortrait skin="cairn" name="Clay" hueStop={3} />);
    await waitFor(() => expect(view.getByRole("img").dataset.artwork).toBe("illustrated"));
    changeContrast(true);
    const fallback = view.getByRole("img", { name: "Clay, idle" });
    expect(fallback.dataset.artwork).toBeUndefined();
    expect(fallback.hasAttribute("data-still")).toBe(true);
    expect(fallback.dataset.skin).toBe("cairn");
    changeContrast(false);
    await waitFor(() => expect(view.getByRole("img").dataset.artwork).toBe("illustrated"));
    view.unmount();
    expect([...listeners.values()].every((held) => held.size === 0)).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls.some(([kind]) => kind === "resize")).toBe(true);
    window.dispatchEvent(new Event("resize"));
    expect(context.drawImage).toHaveBeenCalledTimes(2);
  });
});

function canvasContext() {
  const context = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn<(...args: unknown[]) => void>(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return context;
}

function registered(skin: string): Illustration {
  const art = artworkFor(skin);
  if (!art) throw new Error(`Missing illustrated skin ${skin}`);
  return art;
}

function decoded(art: Illustration): DecodedIllustration {
  return {
    image: { naturalWidth: art.source.width, naturalHeight: art.source.height } as HTMLImageElement,
    alphaAt: vi.fn(),
  };
}
