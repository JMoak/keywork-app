export const riseHeldMs = 4000;

export function noteRise(skin: string, name: string, aspect: number, now = Date.now()): void {
  risen.set(keyOf(skin, name), { aspect, at: now });
}

export function aspectAtRise(skin: string, name: string, now = Date.now()): number | undefined {
  const held = risen.get(keyOf(skin, name));
  return held !== undefined && now - held.at <= riseHeldMs ? held.aspect : undefined;
}

interface Rise {
  readonly aspect: number;
  readonly at: number;
}

const risen = new Map<string, Rise>();

function keyOf(skin: string, name: string): string {
  return `${skin}\n${name}`;
}
