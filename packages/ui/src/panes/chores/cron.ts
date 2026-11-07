export type CronField = readonly number[] | "any";

export interface CronFields {
  readonly minutes: readonly number[];
  readonly hours: readonly number[];
  readonly days: CronField;
  readonly months: CronField;
  readonly weekdays: CronField;
  readonly eitherDay: boolean;
}

export function cronFieldsOf(expr: string): CronFields | undefined {
  const fields = (macros[expr.trim()] ?? expr).trim().split(/\s+/);
  if (fields.length !== 5) return undefined;
  const [minute, hour, day, month, weekday] = fields as [string, string, string, string, string];
  const minutes = valuesOf(minute, minuteSpan);
  const hours = valuesOf(hour, hourSpan);
  const days = valuesOf(day, daySpan);
  const months = valuesOf(month, monthSpan);
  const weekdays = valuesOf(weekday, weekdaySpan);
  if ([minutes, hours, days, months, weekdays].some((values) => values === undefined)) {
    return undefined;
  }
  return {
    minutes: minutes as number[],
    hours: hours as number[],
    days: anyWhenWhole(days as number[], daySpan),
    months: anyWhenWhole(months as number[], monthSpan),
    weekdays: anyWhenWhole(weekdaysOnce(weekdays as number[]), sundayToSaturday),
    eitherDay: !day.startsWith("*") && !weekday.startsWith("*"),
  };
}

export function progressionStep(values: readonly number[], span: Span): number | undefined {
  const [first, second] = values;
  if (first !== span.min || second === undefined) return undefined;
  const step = second - first;
  const whole = Math.floor((span.max - span.min) / step) + 1;
  if (step < 2 || values.length !== whole) return undefined;
  return values.every((value, index) => value === span.min + index * step) ? step : undefined;
}

export interface Span {
  readonly min: number;
  readonly max: number;
  readonly names?: readonly string[];
}

export const minuteSpan: Span = { min: 0, max: 59 };
export const hourSpan: Span = { min: 0, max: 23 };

const daySpan: Span = { min: 1, max: 31 };
const monthSpan: Span = {
  min: 1,
  max: 12,
  names: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
};
const weekdaySpan: Span = {
  min: 0,
  max: 7,
  names: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
};
const sundayToSaturday: Span = { min: 0, max: 6 };

const macros: Readonly<Record<string, string>> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

function valuesOf(text: string, span: Span): number[] | undefined {
  const values = new Set<number>();
  for (const item of text.split(",")) {
    const expanded = itemValues(item, span);
    if (expanded === undefined) return undefined;
    for (const value of expanded) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

function itemValues(item: string, span: Span): number[] | undefined {
  const [range = "", stepText, extra] = item.split("/");
  if (extra !== undefined) return undefined;
  const step = stepText === undefined ? 1 : Number(stepText);
  if (!Number.isInteger(step) || step < 1) return undefined;
  const bounds = boundsOf(range, span, stepText !== undefined);
  if (bounds === undefined) return undefined;
  const values: number[] = [];
  for (let value = bounds[0]; value <= bounds[1]; value += step) values.push(value);
  return values;
}

function boundsOf(range: string, span: Span, stepped: boolean): [number, number] | undefined {
  if (range === "*") return [span.min, span.max];
  const [startText = "", endText, extra] = range.split("-");
  if (extra !== undefined) return undefined;
  const start = numberOf(startText, span);
  if (start === undefined) return undefined;
  if (endText === undefined) return [start, stepped ? span.max : start];
  const end = numberOf(endText, span);
  return end === undefined || end < start ? undefined : [start, end];
}

function numberOf(text: string, span: Span): number | undefined {
  const named = span.names?.indexOf(text.toLowerCase()) ?? -1;
  const value = named >= 0 ? named + span.min : /^\d+$/.test(text) ? Number(text) : Number.NaN;
  return Number.isInteger(value) && value >= span.min && value <= span.max ? value : undefined;
}

function weekdaysOnce(values: readonly number[]): number[] {
  return [...new Set(values.map((day) => day % 7))].sort((a, b) => a - b);
}

function anyWhenWhole(values: readonly number[], span: Span): CronField {
  return values.length === span.max - span.min + 1 ? "any" : values;
}
