export interface SpillSlice {
  spillId: string;
  bytes: number;
  from: number;
  to: number;
  text: string;
  truncated: boolean;
  eof: boolean;
  encoding: "utf-8";
}

export type SpillRefusal = "missing-session" | "missing" | "binary" | "invalid-range";

export type SpillReading = SpillSlice | SpillRefusal;

export const spillRoutes = [
  { method: "GET", path: "/sessions/{id}/spills/{spillId}", operationId: "readSpill" },
] as const;
