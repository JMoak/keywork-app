export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens));
  if (tokens < 10_000) return `${trimmed(tokens / 1000)}k`;
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
  return `${trimmed(tokens / 1_000_000)}M`;
}

export function formatCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${trimToTwoDecimalsMinimum(usd.toFixed(4))}`;
}

function trimmed(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function trimToTwoDecimalsMinimum(fixed: string): string {
  const shortest = fixed.indexOf(".") + 3;
  let end = fixed.length;
  while (end > shortest && fixed[end - 1] === "0") end -= 1;
  return fixed.slice(0, end);
}
