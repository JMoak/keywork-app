import { CourtyardCapacityError, courtyardCapacity } from "./index.ts";

export const districtCapacity = 16;

export interface CourtyardDistrict {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly address: string;
  readonly slugs: readonly string[];
}

export function districtOfCourt(index: number): number {
  if (!Number.isSafeInteger(index) || index < 0 || index >= courtyardCapacity)
    throw new RangeError(`A court index must be between 0 and ${courtyardCapacity - 1}.`);
  return Math.floor(index / districtCapacity);
}

export function courtyardDistricts(order: readonly string[]): readonly CourtyardDistrict[] {
  assertCapacity(order);
  return Array.from({ length: Math.ceil(order.length / districtCapacity) }, (_, index) =>
    districtAt(order, index),
  );
}

export function courtyardDistrictAt(
  order: readonly string[],
  index: number,
): CourtyardDistrict | undefined {
  assertCapacity(order);
  if (!Number.isSafeInteger(index) || index < 0 || index * districtCapacity >= order.length)
    return undefined;
  return districtAt(order, index);
}

function districtAt(order: readonly string[], index: number): CourtyardDistrict {
  const start = index * districtCapacity;
  const end = Math.min(start + districtCapacity, order.length);
  return {
    index,
    start,
    end,
    address: `District ${index + 1}`,
    slugs: order.slice(start, end),
  };
}

function assertCapacity(order: readonly string[]): void {
  if (order.length > courtyardCapacity) throw new CourtyardCapacityError();
}
