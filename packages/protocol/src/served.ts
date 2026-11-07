export type ServedRefusalKind =
  | "invalid"
  | "unauthenticated"
  | "forbidden"
  | "missing"
  | "conflict"
  | "deferred"
  | "failed"
  | "unserved";

export interface ServedRefusal {
  refused: ServedRefusalKind;
  detail: string;
}

export function isServedRefusal(value: unknown): value is ServedRefusal {
  return (
    typeof value === "object" &&
    value !== null &&
    "refused" in value &&
    "detail" in value &&
    typeof (value as { detail: unknown }).detail === "string"
  );
}

export function servedRefusalKindOf(status: number): ServedRefusalKind | undefined {
  switch (status) {
    case 400:
      return "invalid";
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "missing";
    case 409:
      return "conflict";
    case 422:
      return "invalid";
    case 500:
    case 502:
      return "failed";
    case 501:
      return "deferred";
    case 503:
      return "unserved";
    default:
      return undefined;
  }
}
