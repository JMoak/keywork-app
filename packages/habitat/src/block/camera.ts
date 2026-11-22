export interface Camera {
  readonly angle: number;
  readonly eye: number;
}

export interface Axes {
  readonly c: number;
  readonly s: number;
  readonly k: number;
}

export const levelEye = 0;
export const raisedEye = 0.5;
export const quarterTurn = Math.PI / 2;
export const sideNames = ["front", "right", "back", "left"] as const;

export type SideName = (typeof sideNames)[number];

export const cornerTurn = Math.PI / 4;

export function restCamera(quarter: number, eye: number, corner = false): Camera {
  return { angle: quarter * quarterTurn + (corner ? cornerTurn : 0), eye };
}

export function quarterOf(angle: number): number {
  return ((Math.floor(angle / quarterTurn + 1e-6) % 4) + 4) % 4;
}

export function sideNameOf(angle: number): SideName {
  return sideNames[quarterOf(angle)] ?? "front";
}

export function atRest(camera: Camera): boolean {
  const quarters = camera.angle / quarterTurn;
  return (
    Math.abs(quarters - Math.round(quarters)) < snap &&
    (Math.abs(camera.eye - levelEye) < snap || Math.abs(camera.eye - raisedEye) < snap)
  );
}

export function axesOf(camera: Camera): Axes {
  return {
    c: snapped(Math.cos(camera.angle)),
    s: snapped(Math.sin(camera.angle)),
    k: Math.abs(camera.eye - raisedEye) < snap ? raisedEye : Math.max(0, snappedEye(camera.eye)),
  };
}

const snap = 1e-6;

function snapped(value: number): number {
  if (Math.abs(value) < snap) return 0;
  if (Math.abs(value) > 1 - snap) return value < 0 ? -1 : 1;
  return value;
}

function snappedEye(eye: number): number {
  return Math.abs(eye) < snap ? 0 : eye;
}
