import { createSignal } from "solid-js";

export interface FileLanding {
  readonly path: string;
  readonly line: number;
  readonly lines: number;
}

const [requested, setRequested] = createSignal<FileLanding>();

export function landFileAt(landing: FileLanding): void {
  setRequested({ ...landing });
}

export function landingFor(path: string): FileLanding | undefined {
  const landing = requested();
  return landing?.path === path ? landing : undefined;
}

export function landed(landing: FileLanding): void {
  if (requested() === landing) setRequested(undefined);
}
