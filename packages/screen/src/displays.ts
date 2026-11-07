import type { ScreenDisplay } from "./messages.ts";

export interface CaptureSource {
  readonly id: string;
  readonly name: string;
  readonly display_id: string;
}

export interface DisplayGeometry {
  readonly id: number;
  readonly label: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly scaleFactor: number;
}

export interface DisplayTarget extends ScreenDisplay {
  readonly sourceId: string;
}

export function mapDisplays(
  sources: readonly CaptureSource[],
  displays: readonly DisplayGeometry[],
  primaryId: number,
): DisplayTarget[] {
  return sources.flatMap((source, index): DisplayTarget[] => {
    const display = displays.find((candidate) => String(candidate.id) === source.display_id);
    if (display === undefined) return sources.length === 1 ? [soleSource(source, index)] : [];
    return [
      {
        id: String(display.id),
        sourceId: source.id,
        label: display.label === "" ? source.name : display.label,
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor),
        scaleFactor: display.scaleFactor,
        primary: display.id === primaryId,
      },
    ];
  });
}

export function chooseDisplay(
  targets: readonly DisplayTarget[],
  wanted?: string,
): DisplayTarget | undefined {
  return (
    targets.find((target) => target.id === wanted) ??
    targets.find((target) => target.primary) ??
    targets[0]
  );
}

export function nextDisplay(
  targets: readonly DisplayTarget[],
  current: string,
): DisplayTarget | undefined {
  const index = targets.findIndex((target) => target.id === current);
  return targets[(index + 1) % targets.length];
}

export function publicDisplays(targets: readonly DisplayTarget[]): ScreenDisplay[] {
  return targets.map(({ sourceId: _sourceId, ...display }) => display);
}

function soleSource(source: CaptureSource, index: number): DisplayTarget {
  return {
    id: source.display_id === "" ? `source-${index}` : source.display_id,
    sourceId: source.id,
    label: source.name,
    width: 1,
    height: 1,
    scaleFactor: 1,
    primary: true,
  };
}
