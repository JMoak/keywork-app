import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type {
  BusEnvelope,
  PermissionRule,
  PermissionsView,
  RevokeOutcome,
  SessionSummary,
} from "@keywork-app/protocol";
import { cleanup, fireEvent } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import grantAnswers from "../../../../client/src/fixtures/grants.json";
import { inertFeed } from "../../shell/trust.test.ts";
import { mountPane, overviewShell, settle } from "../overview/rows.test.tsx";
import type { ShellSeams } from "../registry.ts";
import {
  bundleRuleText,
  hasGrants,
  permissionsPane,
  postureWord,
  sessionGrantGroups,
} from "./index.tsx";
import { createPermissionsStore, recordsGrant } from "./store.ts";

afterEach(cleanup);

const recordedView = grantAnswers.permissions.body as PermissionsView;
const revokedView = grantAnswers.afterRevoke.body as PermissionsView;
const gitAdd: PermissionRule = { action: "bash", resource: "git add *", effect: "allow" };

const untrustedView: PermissionsView = { trusted: false, bundle: [], workspace: [], session: {} };

const summaries = [{ id: "s1", title: "Build and stage" }] as SessionSummary[];

interface Harness {
  shell: ShellSeams;
  revoked: PermissionRule[];
  reads: () => number;
  emit: (envelope: BusEnvelope) => void;
}

function permissionsShell(
  views: PermissionsView[],
  revoke: (rule: PermissionRule) => RevokeOutcome = (rule) => ({ revoked: rule }),
): Harness {
  const base = overviewShell({ summaries }).shell;
  const revoked: PermissionRule[] = [];
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
  } as unknown as KeyworkClient;
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
  it("lists the trusted bundle read-only, the workspace grants, and session grants by title", async () => {
    const { container } = mount(permissionsShell([recordedView]));
    await settle();
    expect(container.querySelector(".kw-ov-head")?.textContent).toContain("bundle · trusted");
    expect(texts(container, "[aria-label='bundle'] .kw-perm-rule")).toContain("git status*");
    expect(texts(container, "[aria-label='bundle'] .kw-perm-rule")).toContain(
      "find *-delete* asks",
    );
    expect(texts(container, ".kw-perm-grants .kw-ov-name")).toEqual(["git add *"]);
    expect(texts(container, ".kw-perm-session-title")).toEqual(["Build and stage"]);
    expect(texts(container, ".kw-perm-session .kw-perm-rule")).toEqual(["mkdir -p *"]);
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
    expect(texts(container, ".kw-perm-grants .kw-ov-name")).toEqual([]);
    expect(texts(container, ".kw-ov-line")).toContain("revoked git add * · it asks again");
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

  it("teaches from an empty state when nothing is granted and says the workspace is untrusted", async () => {
    const { container } = mount(permissionsShell([untrustedView]));
    await settle();
    expect(container.querySelector(".kw-ov-head")?.textContent).toContain("bundle · untrusted");
    expect(container.querySelector(".kw-perm-quiet")?.textContent).toBe(
      "no read posture until the workspace is trusted",
    );
    expect(container.querySelector(".kw-empty")?.textContent).toBe(
      "no grants yet · ctrl+k ask.workspace answers an ask and remembers it for the workspace",
    );
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
  it("words the posture, the bundle's asks, and the grant groups", () => {
    expect(postureWord(recordedView)).toBe("trusted");
    expect(postureWord(untrustedView)).toBe("untrusted");
    expect(bundleRuleText({ action: "bash", resource: "rg *--pre*", effect: "ask" })).toBe(
      "rg *--pre* asks",
    );
    expect(hasGrants(recordedView)).toBe(true);
    expect(hasGrants({ ...untrustedView, session: { s2: [] } })).toBe(false);
    expect(sessionGrantGroups(recordedView, () => undefined)).toEqual([
      { sessionId: "s1", title: "s1", rules: [{ ...gitAdd, resource: "mkdir -p *" }] },
    ]);
  });

  it("recognises only the decisions that record a grant", () => {
    expect(recordsGrant(permissionDecision("session"))).toBe(true);
    expect(recordsGrant(permissionDecision("workspace"))).toBe(true);
    expect(recordsGrant(permissionDecision("once"))).toBe(false);
    expect(recordsGrant(permissionDecision(undefined))).toBe(false);
  });

  it("keeps the last good reading and says why when a refetch fails", async () => {
    let fail = false;
    const client = {
      permissions: async () => {
        if (fail) throw new Error("the server answered 500");
        return recordedView;
      },
      revokeWorkspaceGrant: async (rule: PermissionRule) => ({ revoked: rule }),
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
