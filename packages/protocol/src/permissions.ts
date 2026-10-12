export type PermissionEffect = "allow" | "ask" | "deny";

export interface PermissionRule {
  action: string;
  resource: string;
  effect: PermissionEffect;
}

export type AskScope = "once" | "session" | "workspace";

export type RememberedScope = Exclude<AskScope, "once">;

export const askScopes: readonly AskScope[] = ["once", "session", "workspace"];

export interface AskRefusal {
  refused: "write-once" | "nothing-to-remember";
  detail: string;
}

export const onceOnlyTools: ReadonlySet<string> = new Set(["write", "edit"]);

export interface PermissionsView {
  trusted: boolean;
  bundle: PermissionRule[];
  workspace: PermissionRule[];
  session: Record<string, PermissionRule[]>;
}

export interface GrantRevoked {
  revoked: PermissionRule;
}

export interface GrantRefusal {
  refused: "invalid" | "missing";
  detail: string;
}

export type RevokeOutcome = GrantRevoked | GrantRefusal;

export function isGrantRefusal(value: RevokeOutcome): value is GrantRefusal {
  return "refused" in value;
}

export function isAskRefusal(value: unknown): value is AskRefusal {
  return typeof value === "object" && value !== null && "refused" in value;
}

export const permissionRoutes = [
  { method: "GET", path: "/permissions", operationId: "listPermissions" },
  {
    method: "POST",
    path: "/permissions/workspace/revoke",
    operationId: "revokeWorkspaceGrant",
  },
  {
    method: "POST",
    path: "/permissions/session/{sessionId}/revoke",
    operationId: "revokeSessionGrant",
  },
] as const;
