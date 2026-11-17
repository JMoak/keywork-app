import { type CourtyardDistrict, courtyardDistricts, districtCapacity } from "@keywork-app/habitat";

export function savedChoice<T>(
  choices: Readonly<Record<string, T>> | undefined,
  slug: string,
): T | undefined {
  return choices !== undefined && Object.hasOwn(choices, slug) ? choices[slug] : undefined;
}

export function settlementDistricts(
  order: readonly string[],
  live: readonly string[],
): readonly CourtyardDistrict[] {
  const saved = courtyardDistricts(order);
  const assigned = new Set(order);
  const arriving = live.filter((slug) => !assigned.has(slug)).sort();
  const additional = Array.from(
    { length: Math.ceil(arriving.length / districtCapacity) },
    (_, offset) => {
      const slugs = arriving.slice(offset * districtCapacity, (offset + 1) * districtCapacity);
      const start = order.length + offset * districtCapacity;
      return {
        index: saved.length + offset,
        start,
        end: start + slugs.length,
        address: `Additional neighborhood ${offset + 1}`,
        slugs,
      };
    },
  );
  return [...saved, ...additional];
}
