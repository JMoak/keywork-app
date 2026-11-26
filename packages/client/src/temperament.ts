import { type Temperament, temperaments } from "@keywork-app/protocol";

export { type Temperament, temperaments };

export const temperamentWords: Readonly<Record<Temperament, string>> = {
  calm: "calm",
  brisk: "brisk",
  eager: "eager",
  playful: "playful",
  decisive: "decisive",
  tentative: "careful",
};

export function temperamentFor(seed: number): Temperament {
  const at = Math.abs(Math.trunc(seed)) % temperaments.length;
  return temperaments[at] ?? "calm";
}

export function isTemperament(value: unknown): value is Temperament {
  return (temperaments as readonly unknown[]).includes(value);
}
