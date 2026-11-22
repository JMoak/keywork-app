import type { ConsoleClient, ServerFeed } from "@keywork-app/client";
import type {
  BusEnvelope,
  PermissionRule,
  PermissionsView,
  RevokeOutcome,
  SessionSummary,
  SurfaceKind,
} from "@keywork-app/protocol";
import { cleanup, fireEvent } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import grantAnswers from "../../../../client/src/fixtures/grants.json";
import { quietMark } from "../../chrome/title-row.tsx";
import { inertFeed } from "../../shell/trust-testing.ts";
import { mountPane, overviewShell, settle } from "../overview/testing.tsx";
import type { ShellSeams } from "../registry.ts";
import { grantRows, permissionsPane, quietGrantedNothing, sessionGrantGroups } from "./index.tsx";
import { changesPermissions, createPermissionsStore } from "./store.ts";

afterEach(cleanup);

const recordedView = grantAnswers.permissions.body as PermissionsView;
const revokedView = grantAnswers.afterRevoke.body as PermissionsView;
const gitAdd: PermissionRule = { action: "bash", resource: "git add *", effect: "allow" };
const mkdir: PermissionRule = { action: "bash", resource: "mkdir -p *", effect: "allow" };
const sessionRevokedView: PermissionsView = { ...recordedView, session: {} };

const summaries = [{ id: "s1", title: "Build and stage" }] as SessionSummary[];

interface Harness {
  shell: ShellSeams;
  revoked: PermissionRule[];
  sessionRevoked: Array<[string, PermissionRule]>;
  reads: () => number;
  emit: (envelope: BusEnvelope) => void;
}

function permissionsShell(
  views: PermissionsView[],
  revoke: (rule: PermissionRule) => RevokeOutcome = (rule) => ({ revoked: rule }),
): Harness {
  const base = overviewShell({ summaries }).shell;
  const revoked: PermissionRule[] = [];
  const sessionRevoked: Array<[string, PermissionRule]> = [];
  const listeners = new Set<(envelopes: readonly BusEnvelope[]) => void>();
  let reads = 0;
  const client = {
    permissions: async () => {
      const view = views[Math.min(reads, views.length - 1)] as PermissionsView;
      reads += 1;
      return view;
    },
    revokeWorkspaceGrant: async (rule: PermissionRule) => {
      revoked.push(rule);
      return revoke(rule);
    },
    revokeSessionGrant: async (sessionId: string, rule: PermissionRule) => {
      sessionRevoked.push([sessionId, rule]);
      return revoke(rule);
    },
  } as unknown as ConsoleClient;
  const feed: ServerFeed = {
    ...inertFeed(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    shell: { ...base, client, feed },
    revoked,
    sessionRevoked,
    reads: () => reads,
    emit: (envelope) => {
      for (const listener of listeners) listener([envelope]);
    },
  };
}

function mount(harness: Harness) {
  return mountPane(permissionsPane.component, { kind: "permissions" }, harness.shell);
}

function texts(container: HTMLElement, selector: string): string[] {
  return [...container.querySelectorAll(selector)].map((node) => node.textContent?.trim() ?? "");
}

const workspaceRows = "[aria-label='workspace grants'] .kw-ov-name";
const sessionRows = ".kw-perm-session .kw-ov-name";

function cursorName(container: HTMLElement): string {
  return container.querySelector(".kw-ov-row[data-cursor] .kw-ov-name")?.textContent?.trim() ?? "";
}

function surfaceChanged(kind: SurfaceKind): BusEnvelope {
  return {
    id: 2,
    ts: "2026-09-07T12:00:01.000Z",
    sessionId: "",
    type: "surface.changed",
    payload: { kind },
  };
}

function permissionDecision(scope: "once" | "session" | "workspace" | undefined): BusEnvelope {
  return {
    id: 1,
    ts: "2026-09-07T12:00:00.000Z",
    sessionId: "s1",
    type: "gate.permission",
    payload: {
      decision: {
        tool: "bash",
        callId: "g1",
        verdict: "granted",
        gate: "user",
        ...(scope !== undefined && { scope }),
      },
    },
  };
}

describe("the permissions pane", () => {
  it("lists the trusted bundle folded until b, the workspace grants, and session grants by title", async () => {
    const { container, act } = mount(permissionsShell([recordedView]));
    await settle();
    const head = container.querySelector(".kw-ov-head") as HTMLElement;
    expect(head.textContent).toContain("bundle · trusted");
    expect(head.textContent).toContain("read rules · ctrl+k permissions.bundle shows them");
    expect(container.querySelector("[aria-label='bundle']")).toBeNull();
    act("permissions.bundle");
    expect(head.textContent).toContain("ctrl+k permissions.bundle folds them");
    expect(texts(container, "[aria-label='bundle'] .kw-perm-rule")).toContain("git status*");
    expect(texts(container, "[aria-label='bundle'] .kw-perm-rule")).toContain(
      "find *-delete* asks",
    );
    expect(texts(container, workspaceRows)).toEqual(["git add *"]);
    expect(texts(container, ".kw-perm-session-title")).toEqual(["Build and stage"]);
    expect(texts(container, sessionRows)).toEqual(["mkdir -p *"]);
  });

  it("revokes the workspace grant under the cursor after a one-line confirm, then refetches", async () => {
    const harness = permissionsShell([recordedView, revokedView]);
    const { container, act } = mount(harness);
    await settle();
    act("permissions.revoke");
    const confirm = container.querySelector(".kw-ov-line[data-tone='ask']") as HTMLElement;
    expect(confirm.textContent).toBe(
      "revoke git add * for every session · y confirms · any other key cancels",
    );
    fireEvent.keyDown(confirm, { key: "y" });
    await settle();
    expect(harness.revoked).toEqual([gitAdd]);
    expect(harness.reads()).toBe(2);
    expect(texts(container, workspaceRows)).toEqual([]);
    expect(texts(container, ".kw-ov-line")).toContain("revoked git add * · it asks again");
  });

  it("walks on from the workspace grants into a session's and revokes that one on its own route", async () => {
    const harness = permissionsShell([recordedView, sessionRevokedView]);
    const { container, act } = mount(harness);
    await settle();
    act("permissions.down");
    expect(cursorName(container)).toBe("mkdir -p *");
    act("permissions.revoke");
    const confirm = container.querySelector(".kw-ov-line[data-tone='ask']") as HTMLElement;
    expect(confirm.textContent).toBe(
      "revoke mkdir -p * for Build and stage · y confirms · any other key cancels",
    );
    fireEvent.keyDown(confirm, { key: "y" });
    await settle();
    expect(harness.sessionRevoked).toEqual([["s1", mkdir]]);
    expect(harness.revoked).toEqual([]);
    expect(texts(container, sessionRows)).toEqual([]);
    expect(texts(container, ".kw-ov-line")).toContain(
      "revoked mkdir -p * · it asks again in Build and stage",
    );
  });

  it("shows a quiet session that holds no grants yet, so the mark has a home", async () => {
    const quietOnly: PermissionsView = { ...recordedView, session: {}, quiet: ["s1"] };
    const { container } = mount(permissionsShell([quietOnly]));
    await settle();
    expect(texts(container, ".kw-perm-session-title")).toEqual([
      `Build and stage${quietMark} quiet`,
    ]);
    expect(container.querySelector(".kw-perm-session .kw-perm-quiet")?.textContent).toBe(
      quietGrantedNothing,
    );
  });

  it("keeps the grant when the confirm is answered with any other key", async () => {
    const harness = permissionsShell([recordedView]);
    const { container, act } = mount(harness);
    await settle();
    act("permissions.revoke");
    fireEvent.keyDown(container.querySelector(".kw-ov-line[data-tone='ask']") as HTMLElement, {
      key: "n",
    });
    await settle();
    expect(harness.revoked).toEqual([]);
    expect(container.querySelector(".kw-ov-line[data-tone='ask']")).toBeNull();
  });

  it("says the server's words when a revoke is refused", async () => {
    const detail = grantAnswers.revokedAgain.body.error;
    const harness = permissionsShell([recordedView], () => ({ refused: "missing", detail }));
    const { container, act } = mount(harness);
    await settle();
    act("permissions.revoke");
    fireEvent.keyDown(container.querySelector(".kw-ov-line[data-tone='ask']") as HTMLElement, {
      key: "y",
    });
    await settle();
    expect(texts(container, ".kw-ov-line")).toContain(detail);
  });

  it("refetches when a grant is recorded and not for a once answer", async () => {
    const harness = permissionsShell([recordedView]);
    mount(harness);
    await settle();
    harness.emit(permissionDecision("once"));
    harness.emit(permissionDecision(undefined));
    await settle();
    expect(harness.reads()).toBe(1);
    harness.emit(permissionDecision("session"));
    harness.emit(permissionDecision("workspace"));
    await settle();
    expect(harness.reads()).toBe(3);
  });
});

describe("the permissions readings", () => {
  it("lays every grant on one cursor, the workspace's first, each session's after", () => {
    const view: PermissionsView = {
      ...recordedView,
      session: { s1: [mkdir], s2: [], s3: [gitAdd, mkdir] },
    };
    expect(grantRows(view)).toEqual([
      { layer: "workspace", rule: gitAdd },
      { layer: "session", rule: mkdir, sessionId: "s1" },
      { layer: "session", rule: gitAdd, sessionId: "s3" },
      { layer: "session", rule: mkdir, sessionId: "s3" },
    ]);
    expect(sessionGrantGroups(view, () => undefined).map((group) => group.firstRow)).toEqual([
      1, 2,
    ]);
  });

  it("reads the permissions as changed on a recorded grant or keywork's own word", () => {
    expect(changesPermissions(permissionDecision("workspace"))).toBe(true);
    expect(changesPermissions(surfaceChanged("permissions"))).toBe(true);
    expect(changesPermissions(surfaceChanged("mcp"))).toBe(false);
    expect(changesPermissions(permissionDecision("once"))).toBe(false);
  });

  it("keeps the last good reading and says why when a refetch fails", async () => {
    let fail = false;
    const client = {
      permissions: async () => {
        if (fail) throw new Error("the server answered 500");
        return recordedView;
      },
      revokeWorkspaceGrant: async (rule: PermissionRule) => ({ revoked: rule }),
      revokeSessionGrant: async (_sessionId: string, rule: PermissionRule) => ({ revoked: rule }),
    };
    const [store, dispose] = createRoot((dispose) => [
      createPermissionsStore(client, inertFeed()),
      dispose,
    ]);
    await store.refetch();
    fail = true;
    await store.refetch();
    expect(store.state.view.workspace).toEqual([gitAdd]);
    expect(store.state.notice).toBe("the server answered 500");
    dispose();
  });
});
