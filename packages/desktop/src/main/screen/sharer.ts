import type { ScreenAuditRecord } from "@keywork-app/protocol";
import {
  type AskConsent,
  admissionGate,
  type Clock,
  type ConsentTimers,
  type ControlState,
  chooseDisplay,
  controlReconfirmCard,
  type DeniedReason,
  type DisplayTarget,
  decideConsent,
  deniedReasonFor,
  describePeer,
  type EndReason,
  type GrantBook,
  type InputChannel,
  isHumanPeer,
  type PathClass,
  type PeerIdentity,
  type PeerSignal,
  parseSignal,
  peerSignalMessage,
  peerSignalOf,
  presetFor,
  publicDisplays,
  reconfirmCard,
  requestCard,
  type ScreenGrant,
  type ScreenScope,
  type SenderPreset,
  type SessionLogRow,
  type Signaler,
  type SignalingTransport,
  type SignalMessage,
  samePreset,
  signaler,
  signalingVersion,
  viewGrantTerms,
} from "@keywork-app/screen";
import type { SenderCommand } from "./channels.ts";
import {
  type Control,
  type DisplayGeometry,
  type InputVerdict,
  noInputs,
  openControl,
} from "./control.ts";
import type { HelperPort } from "./helper/port.ts";

export interface SenderWindows {
  open(sessionId: string): Promise<void>;
  command(sessionId: string, command: SenderCommand): void;
  close(sessionId: string): void;
}

export interface IndicatorBanner {
  readonly who: string;
  readonly mode: "view" | "control";
  readonly shortcut: string | undefined;
  readonly controller?: "human" | "agent" | undefined;
  readonly paused?: boolean | undefined;
}

export interface Indicator {
  show(
    sessionId: string,
    display: DisplayTarget,
    banner: IndicatorBanner,
    stop: () => void,
    resume?: () => void,
  ): void;
  hide(sessionId: string): void;
}

export const agentControlRefusal =
  "a creature may control only its own workshop's display, never a keeper's desktop";

export const noHelperRefusal =
  "this machine has no input helper, so it shares its screen for viewing only";

export interface KillSwitch {
  arm(kill: () => void): { chord: string; registered: boolean };
  disarm(): void;
}

export interface SessionLogStore {
  append(row: SessionLogRow): Promise<void>;
  read(): Promise<SessionLogRow[]>;
}

export interface Mint {
  id(kind: "session" | "grant"): string;
  token(): string;
}

export interface SharerSeams {
  readonly clock: Clock;
  readonly timers: ConsentTimers;
  readonly mint: Mint;
  readonly consent: AskConsent;
  readonly grants: GrantBook;
  readonly displays: () => Promise<DisplayTarget[]>;
  readonly pathTo: (peer: PeerIdentity) => Promise<PathClass>;
  readonly senders: SenderWindows;
  readonly indicator: Indicator;
  readonly killSwitch: KillSwitch;
  readonly log: SessionLogStore;
  readonly screenAccess: () => "granted" | "needs-onboarding";
  readonly helper?: (() => Promise<HelperPort | undefined>) | undefined;
  readonly geometry?: ((displayId: string) => DisplayGeometry | undefined) | undefined;
  readonly audit?: ((record: ScreenAuditRecord) => Promise<void>) | undefined;
}

export interface Sharer {
  receive(raw: unknown): Promise<void>;
  senderSignal(sessionId: string, signal: PeerSignal): Promise<void>;
  senderState(sessionId: string, state: RTCPeerConnectionState): Promise<void>;
  senderPath(sessionId: string, path: PathClass): Promise<void>;
  senderInput(sessionId: string, channel: InputChannel, raw: unknown): InputVerdict;
  localInput(sessionId: string): Promise<void>;
  resume(sessionId: string): Promise<void>;
  dropControl(sessionId: string, reason: string): Promise<void>;
  captureTarget(sessionId: string): DisplayTarget | undefined;
  isCapturing(sessionId: string): boolean;
  displaysChanged(): Promise<void>;
  tick(): Promise<void>;
  end(sessionId: string, reason: EndReason): Promise<void>;
  endAll(reason: EndReason): Promise<void>;
  sessions(): readonly string[];
  onEnded(listener: (sessionId: string) => void): () => void;
}

export function sharer(transport: SignalingTransport, seams: SharerSeams): Sharer {
  const sharing = new Map<string, Sharing>();
  const endedListeners = new Set<(sessionId: string) => void>();
  const admission = admissionGate(seams.clock);
  let killChord: string | undefined;

  const at = (): string => new Date(seams.clock.now()).toISOString();
  const append = (row: SessionLogRow): Promise<void> =>
    seams.log.append(row).catch(() => undefined);

  const audited = (record: ScreenAuditRecord): Promise<void> =>
    seams.audit?.(record).catch(() => undefined) ?? Promise.resolve();

  const auditPeer = (peer: PeerIdentity): ScreenAuditRecord["peer"] => ({
    stableId: peer.node.stableId,
    name: peer.node.name,
    userId: peer.user?.id ?? null,
    ...(peer.user !== undefined && { loginName: peer.user.loginName }),
    tags: peer.tags,
  });

  const controllerOf = (peer: PeerIdentity): "human" | "agent" =>
    isHumanPeer(peer) ? "human" : "agent";

  const controlExpiry = (record: Sharing): string | undefined =>
    record.controlGrant === undefined
      ? undefined
      : new Date(record.controlGrant.expiresAt).toISOString();

  const controlRow = async (
    record: Sharing,
    state: "granted" | "refused" | "paused" | "resumed",
    reason: string,
  ): Promise<void> => {
    const grant = record.grant;
    if (grant === undefined) return;
    const controlGrantId = record.controlGrant?.id;
    const expiresAt = state === "granted" ? controlExpiry(record) : undefined;
    await append({
      kind: "control",
      at: at(),
      sessionId: record.sessionId,
      grantId: grant.id,
      ...(controlGrantId !== undefined && { controlGrantId }),
      state,
      reason,
      ...(expiresAt !== undefined && { expiresAt }),
    });
    if (state !== "granted" && state !== "refused") return;
    await audited({
      kind: "control",
      sessionId: record.sessionId,
      grantId: grant.id,
      ...(controlGrantId !== undefined && { controlGrantId }),
      peer: auditPeer(record.peer),
      controller: controllerOf(record.peer),
      decision: state === "granted" ? "allow" : "deny",
      reason,
      ...(expiresAt !== undefined && { expiresAt }),
    });
  };

  const tellControl = async (
    record: Sharing,
    state: ControlState,
    reason?: string,
  ): Promise<void> => {
    const grant = record.grant;
    if (grant === undefined) return;
    await record.signals
      .send({
        v: signalingVersion,
        kind: "control",
        sessionId: record.sessionId,
        grantId: grant.id,
        state,
        ...(reason !== undefined && { reason }),
      })
      .catch(() => undefined);
  };

  const deny = async (signals: Signaler, reason: DeniedReason): Promise<void> => {
    const sessionId = signals.session().sessionId;
    sharing.delete(sessionId);
    await signals
      .send({ v: signalingVersion, kind: "denied", sessionId, reason })
      .catch(() => undefined);
    await append({ kind: "decided", at: at(), sessionId, verdict: "denied", reason });
  };

  const armKillSwitch = async (): Promise<string | undefined> => {
    if (killChord !== undefined) return killChord;
    const armed = seams.killSwitch.arm(() => void endAll("kill-switch"));
    killChord = armed.registered ? armed.chord : undefined;
    await append({
      kind: "kill-switch",
      at: at(),
      chord: armed.chord,
      registered: armed.registered,
    });
    return killChord;
  };

  const showIndicator = (record: Sharing, target: DisplayTarget): void => {
    const paused = record.control?.paused() === true;
    seams.indicator.show(
      record.sessionId,
      target,
      {
        who: describePeer(record.peer),
        mode: record.control === undefined ? "view" : "control",
        shortcut: killChord,
        controller: controllerOf(record.peer),
        paused,
      },
      () => void end(record.sessionId, "local-user"),
      paused ? () => void resume(record.sessionId) : undefined,
    );
  };

  const geometryOf = (target: DisplayTarget): DisplayGeometry => {
    const area = {
      x: 0,
      y: 0,
      width: Math.round(target.width / target.scaleFactor),
      height: Math.round(target.height / target.scaleFactor),
    };
    return (
      seams.geometry?.(target.id) ?? {
        bounds: area,
        workArea: area,
        scaleFactor: target.scaleFactor,
      }
    );
  };

  const startControl = async (record: Sharing, target: DisplayTarget): Promise<void> => {
    const controlGrant = record.controlGrant;
    const helper = await seams.helper?.().catch(() => undefined);
    const opened =
      helper === undefined || controlGrant === undefined
        ? undefined
        : await openControl({
            grant: controlGrant,
            helper,
            geometry: geometryOf(target),
            live: () => seams.grants.standing(controlGrant.id).live,
            touched: () => {
              seams.grants.touched(controlGrant.id);
              if (record.grant !== undefined) seams.grants.touched(record.grant.id);
            },
            localInput: () => void localInput(record.sessionId),
          });
    if (sharing.get(record.sessionId) !== record) {
      await opened?.stop();
      return;
    }
    if (opened === undefined) {
      await dropControl(record.sessionId, "the input helper did not start");
      return;
    }
    record.control = opened;
    await controlRow(record, "granted", "the keeper allowed control");
    showIndicator(record, target);
  };

  const dropControl = async (sessionId: string, reason: string): Promise<void> => {
    const record = sharing.get(sessionId);
    const controlGrant = record?.controlGrant;
    if (record === undefined || controlGrant === undefined) return;
    const control = record.control;
    record.control = undefined;
    if (control !== undefined) {
      record.inputs = summed(record.inputs, control.counts());
      await control.stop();
    }
    seams.grants.revoke(controlGrant.id);
    await tellControl(record, "revoked", reason);
    await append({
      kind: "control",
      at: at(),
      sessionId,
      grantId: record.grant?.id ?? controlGrant.id,
      controlGrantId: controlGrant.id,
      state: "revoked",
      reason,
    });
    if (record.current !== undefined) showIndicator(record, record.current);
  };

  const localInput = async (sessionId: string): Promise<void> => {
    const record = sharing.get(sessionId);
    const control = record?.control;
    if (record === undefined || control === undefined || control.paused()) return;
    await control.pause();
    await tellControl(record, "paused", "the keeper is using this machine");
    await controlRow(record, "paused", "physical input on this machine");
    if (record.current !== undefined) showIndicator(record, record.current);
  };

  const resume = async (sessionId: string): Promise<void> => {
    const record = sharing.get(sessionId);
    const control = record?.control;
    if (record === undefined || control === undefined || !control.paused()) return;
    control.resume();
    await tellControl(record, "resumed");
    await controlRow(record, "resumed", "the keeper resumed control");
    if (record.current !== undefined) showIndicator(record, record.current);
  };

  const grantSession = async (
    record: Sharing,
    targets: DisplayTarget[],
    withControl: boolean,
  ): Promise<void> => {
    const target = chooseDisplay(targets);
    if (target === undefined) return deny(record.signals, "unavailable");
    const grant = seams.grants.issue({
      id: seams.mint.id("grant"),
      sessionId: record.sessionId,
      token: seams.mint.token(),
      grantee: record.peer,
      displays: targets.map((candidate) => candidate.id),
    });
    record.grant = grant;
    record.controlGrant = withControl
      ? seams.grants.allowControl(grant.id, seams.mint.id("grant"))
      : undefined;
    record.targets = targets;
    record.current = target;
    record.path = await seams.pathTo(record.peer);
    record.preset = presetFor(record.path, target.height);
    await record.signals.send({
      v: signalingVersion,
      kind: "granted",
      sessionId: record.sessionId,
      grantId: grant.id,
      token: grant.token,
      expiresAt: new Date(grant.expiresAt).toISOString(),
      displays: publicDisplays(targets),
      current: target.id,
      ...(record.controlGrant !== undefined && {
        control: {
          grantId: record.controlGrant.id,
          expiresAt: new Date(record.controlGrant.expiresAt).toISOString(),
        },
      }),
    });
    await append({
      kind: "decided",
      at: at(),
      sessionId: record.sessionId,
      verdict: "granted",
      grantId: grant.id,
      expiresAt: new Date(grant.expiresAt).toISOString(),
    });
    await armKillSwitch();
    showIndicator(record, target);
    if (record.controlGrant !== undefined) await startControl(record, target);
    if (sharing.get(record.sessionId) !== record) return;
    await seams.senders.open(record.sessionId);
    seams.senders.command(record.sessionId, {
      kind: "start",
      preset: record.preset,
      frameRate: record.preset.idealFrameRate,
      ...(record.control !== undefined && { control: true as const }),
    });
  };

  const request = async (
    raw: unknown,
    message: SignalMessage & { kind: "request" },
  ): Promise<void> => {
    const signals = signaler("sharer", message.sessionId, transport);
    if (signals.receive(raw).kind !== "accepted") return;
    const peer = message.from;
    if (peer !== undefined) {
      await append({
        kind: "requested",
        at: at(),
        sessionId: message.sessionId,
        peer,
        scope: message.scope,
      });
    }
    if (message.scope === "control" && peer !== undefined && !isHumanPeer(peer)) {
      return refuseAgentControl(signals, peer);
    }
    const admitted = admission.admit(peer);
    if (admitted !== "admit" || peer === undefined) {
      return deny(signals, admitted === "admit" ? "unverified" : admitted);
    }
    const record: Sharing = {
      sessionId: message.sessionId,
      signals,
      peer,
      targets: [],
      path: "unknown",
      scopes: ["view"],
      inputs: noInputs,
    };
    const offersControl = message.scope === "control" && seams.helper !== undefined;
    sharing.set(record.sessionId, record);
    try {
      if (seams.screenAccess() !== "granted") return await deny(signals, "needs-permission");
      const answer = await decideConsent(
        requestCard(peer, viewGrantTerms, offersControl ? "control" : "view"),
        seams.consent,
        seams.timers,
      );
      if (sharing.get(record.sessionId) !== record) return;
      if (answer === "decline" || answer === "timed-out") {
        return await deny(signals, deniedReasonFor(answer));
      }
      const withControl = offersControl && answer === "allow";
      if (withControl) record.scopes = ["view", "control"];
      await grantSession(record, await seams.displays(), withControl);
      if (message.scope === "control" && !withControl) {
        await controlRow(
          record,
          "refused",
          offersControl ? "the keeper chose view only" : noHelperRefusal,
        );
      }
    } finally {
      admission.settled();
    }
  };

  const refuseAgentControl = async (signals: Signaler, peer: PeerIdentity): Promise<void> => {
    const sessionId = signals.session().sessionId;
    await signals
      .send({ v: signalingVersion, kind: "denied", sessionId, reason: "agent-control" })
      .catch(() => undefined);
    await append({
      kind: "decided",
      at: at(),
      sessionId,
      verdict: "denied",
      reason: agentControlRefusal,
    });
    await audited({
      kind: "control",
      sessionId,
      grantId: "none",
      peer: auditPeer(peer),
      controller: "agent",
      decision: "deny",
      reason: agentControlRefusal,
    });
  };

  const reconfirmControl = async (record: Sharing, grant: ScreenGrant): Promise<void> => {
    const answer = await decideConsent(
      controlReconfirmCard(record.peer, seams.clock.now() - grant.issuedAt),
      seams.consent,
      seams.timers,
    );
    if (record.controlGrant?.id !== grant.id) return;
    await append({
      kind: "reconfirmed",
      at: at(),
      sessionId: record.sessionId,
      grantId: grant.id,
      answer,
    });
    if (answer === "decline" || answer === "timed-out") {
      await end(record.sessionId, "not-reconfirmed");
      return;
    }
    if (record.grant !== undefined) seams.grants.reconfirmed(record.grant.id);
    if (answer === "allow") seams.grants.reconfirmed(grant.id);
    else await dropControl(record.sessionId, "the keeper chose view only");
  };

  const remote = (record: Sharing, message: SignalMessage): Promise<void> | undefined => {
    switch (message.kind) {
      case "answer":
      case "candidate": {
        const signal = peerSignalOf(message);
        if (signal !== undefined)
          seams.senders.command(record.sessionId, { kind: "remote", signal });
        return;
      }
      case "keepalive":
        if (record.grant !== undefined) seams.grants.touched(record.grant.id);
        return;
      case "switch-display":
        return switchDisplay(record, message.displayId);
      case "end":
        return end(record.sessionId, message.reason);
      default:
        return;
    }
  };

  const switchDisplay = async (record: Sharing, displayId: string): Promise<void> => {
    const grant = record.grant;
    if (grant === undefined || !seams.grants.allows(grant.id, displayId)) return;
    const targets = await seams.displays();
    const target = targets.find((candidate) => candidate.id === displayId);
    if (target === undefined) return;
    await moveTo(record, grant, targets, target);
  };

  const moveTo = async (
    record: Sharing,
    grant: ScreenGrant,
    targets: DisplayTarget[],
    target: DisplayTarget,
  ): Promise<void> => {
    record.targets = targets;
    record.current = target;
    showIndicator(record, target);
    seams.senders.command(record.sessionId, { kind: "recapture" });
    followPreset(record, target);
    await record.signals.send({
      v: signalingVersion,
      kind: "displays",
      sessionId: record.sessionId,
      grantId: grant.id,
      displays: publicDisplays(
        targets.filter((candidate) => grant.displays.includes(candidate.id)),
      ),
      current: target.id,
    });
    await append({
      kind: "switched",
      at: at(),
      sessionId: record.sessionId,
      grantId: grant.id,
      displayId: target.id,
    });
  };

  const followPreset = (record: Sharing, target: DisplayTarget): void => {
    const preset = presetFor(record.path, target.height);
    if (samePreset(preset, record.preset)) return;
    record.preset = preset;
    seams.senders.command(record.sessionId, { kind: "preset", preset });
  };

  const followPathPreset = (record: Sharing): void => {
    if (record.current !== undefined) followPreset(record, record.current);
  };

  const reconfirm = async (record: Sharing, grant: ScreenGrant): Promise<void> => {
    const sharedFor = seams.clock.now() - grant.issuedAt;
    const answer = await decideConsent(
      reconfirmCard(record.peer, sharedFor),
      seams.consent,
      seams.timers,
    );
    if (sharing.get(record.sessionId) !== record) return;
    await append({
      kind: "reconfirmed",
      at: at(),
      sessionId: record.sessionId,
      grantId: grant.id,
      answer,
    });
    if (answer === "allow") seams.grants.reconfirmed(grant.id);
    else await end(record.sessionId, "not-reconfirmed");
  };

  const end = async (sessionId: string, reason: EndReason): Promise<void> => {
    const record = sharing.get(sessionId);
    if (record === undefined) return;
    sharing.delete(sessionId);
    const control = record.control;
    record.control = undefined;
    const inputs = summed(record.inputs, control?.counts() ?? noInputs);
    await control?.stop();
    await record.signals.end(reason);
    seams.senders.close(sessionId);
    seams.indicator.hide(sessionId);
    if (record.grant !== undefined) {
      seams.grants.revoke(record.grant.id);
      await append({
        kind: "ended",
        at: at(),
        sessionId,
        grantId: record.grant.id,
        reason,
        scopes: record.scopes,
        inputs,
        clipboardBytes: { in: 0, out: 0 },
      });
      await audited({
        kind: "session",
        sessionId,
        grantId: record.grant.id,
        ...(record.controlGrant !== undefined && { controlGrantId: record.controlGrant.id }),
        peer: auditPeer(record.peer),
        controller: controllerOf(record.peer),
        scopes: record.scopes,
        displays: record.current === undefined ? [] : [record.current.id],
        path: record.path,
        ...(record.startedAt !== undefined && { startedAt: record.startedAt }),
        endedAt: at(),
        reason,
        inputs,
      });
    }
    for (const listener of endedListeners) listener(sessionId);
    if (sharing.size === 0 && killChord !== undefined) {
      seams.killSwitch.disarm();
      killChord = undefined;
    }
  };

  const endAll = async (reason: EndReason): Promise<void> => {
    await Promise.all([...sharing.keys()].map((sessionId) => end(sessionId, reason)));
  };

  return {
    receive: async (raw) => {
      const parsed = parseSignal(raw);
      if (!parsed.ok) return;
      const record = sharing.get(parsed.message.sessionId);
      if (record === undefined) {
        if (parsed.message.kind === "request") await request(raw, parsed.message);
        return;
      }
      const delivery = record.signals.receive(raw);
      if (delivery.kind === "accepted") await remote(record, delivery.message);
    },
    senderSignal: async (sessionId, signal) => {
      const record = sharing.get(sessionId);
      const grantId = record?.grant?.id;
      if (record === undefined || grantId === undefined) return;
      await record.signals
        .send(peerSignalMessage(sessionId, grantId, signal))
        .catch(() => undefined);
    },
    senderState: async (sessionId, state) => {
      const record = sharing.get(sessionId);
      if (record?.grant === undefined) return;
      if (state === "failed" || state === "closed") return end(sessionId, "connection-lost");
      if (state !== "connected" || record.started) return;
      record.started = true;
      record.startedAt = at();
      record.signals.connected();
      seams.grants.started(record.grant.id);
      await append({
        kind: "started",
        at: at(),
        sessionId,
        grantId: record.grant.id,
        displays: record.current === undefined ? [] : [record.current.id],
        path: record.path,
        preset: record.preset?.name ?? "text",
      });
    },
    senderPath: async (sessionId, path) => {
      const record = sharing.get(sessionId);
      if (record?.grant === undefined || record.path === path) return;
      record.path = path;
      followPathPreset(record);
      if (!record.started) return;
      await append({ kind: "path", at: at(), sessionId, grantId: record.grant.id, path });
    },
    senderInput: (sessionId, channel, raw) =>
      sharing.get(sessionId)?.control?.input(channel, raw) ?? "no-control",
    localInput,
    resume,
    dropControl,
    captureTarget: (sessionId) => {
      const record = sharing.get(sessionId);
      const grant = record?.grant;
      if (grant === undefined || record?.current === undefined) return undefined;
      return seams.grants.allows(grant.id, record.current.id) ? record.current : undefined;
    },
    isCapturing: (sessionId) => {
      const grant = sharing.get(sessionId)?.grant;
      return grant !== undefined && seams.grants.standing(grant.id).live;
    },
    displaysChanged: async () => {
      const capturing = [...sharing.values()].filter(
        (record) => record.grant !== undefined && record.current !== undefined,
      );
      if (capturing.length === 0) return;
      const targets = await seams.displays();
      for (const record of capturing) {
        const grant = record.grant;
        if (grant === undefined || record.current === undefined) continue;
        if (sameDisplays(targets, record.targets)) continue;
        const still = targets.find((target) => target.id === record.current?.id);
        const fallback =
          still ?? chooseDisplay(targets.filter((target) => grant.displays.includes(target.id)));
        if (fallback === undefined) await end(record.sessionId, "display-lost");
        else await moveTo(record, grant, targets, fallback);
      }
    },
    tick: async () => {
      for (const due of seams.grants.due()) {
        const record = sharing.get(due.grant.sessionId);
        if (record === undefined) continue;
        if (due.grant.scope === "control") {
          if (due.due === "reconfirm") void reconfirmControl(record, due.grant);
          else await dropControl(record.sessionId, `control ${lapseWords[due.due]}`);
          continue;
        }
        if (due.due === "reconfirm" && record.controlGrant !== undefined) continue;
        if (due.due === "reconfirm") void reconfirm(record, due.grant);
        else await end(record.sessionId, due.due);
      }
    },
    end,
    endAll,
    sessions: () => [...sharing.keys()],
    onEnded: (listener) => {
      endedListeners.add(listener);
      return () => endedListeners.delete(listener);
    },
  };
}

const lapseWords = {
  expired: "ran out",
  idle: "went quiet for five minutes",
  "max-duration": "reached its maximum length",
} as const;

function summed(
  prior: { pointer: number; keys: number },
  more: { pointer: number; keys: number },
): { pointer: number; keys: number } {
  return { pointer: prior.pointer + more.pointer, keys: prior.keys + more.keys };
}

interface Sharing {
  readonly sessionId: string;
  readonly signals: Signaler;
  readonly peer: PeerIdentity;
  grant?: ScreenGrant;
  controlGrant?: ScreenGrant | undefined;
  control?: Control | undefined;
  scopes: ScreenScope[];
  inputs: { pointer: number; keys: number };
  startedAt?: string;
  targets: DisplayTarget[];
  current?: DisplayTarget;
  path: PathClass;
  preset?: SenderPreset;
  started?: boolean;
}

function sameDisplays(next: readonly DisplayTarget[], held: readonly DisplayTarget[]): boolean {
  return (
    next.length === held.length && next.every((target, index) => sameDisplay(target, held[index]))
  );
}

function sameDisplay(target: DisplayTarget, held: DisplayTarget | undefined): boolean {
  return (
    held !== undefined &&
    target.id === held.id &&
    target.sourceId === held.sourceId &&
    target.width === held.width &&
    target.height === held.height &&
    target.scaleFactor === held.scaleFactor &&
    target.primary === held.primary
  );
}
