import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type { BusEnvelope, SessionState } from "@keywork-app/protocol";
import { createSignal } from "solid-js";
import { onReconnected } from "./surfaces-store.ts";

export interface QuietPosture {
  has(sessionId: string | undefined): boolean;
}

export interface QuietSessions extends QuietPosture {
  refetch(): Promise<void>;
  dispose(): void;
}

export interface QuietSources {
  readonly client: Pick<KeyworkClient, "permissions">;
  readonly feed: Pick<ServerFeed, "subscribe" | "onNotice">;
  standing(sessionId: string): Pick<SessionState, "quiet"> | undefined;
}

export interface QuietChords {
  readonly quiet: string;
  readonly permissions: string;
}

export interface QuietToggleSeams {
  readonly quiet: QuietPosture;
  readonly client: Pick<KeyworkClient, "setQuiet" | "permissions">;
  readonly chords: QuietChords;
}

export function createQuietSessions(sources: QuietSources): QuietSessions {
  const [listed, setListed] = createSignal<readonly string[]>([]);
  const refetch = async (): Promise<void> => {
    try {
      setListed((await sources.client.permissions()).quiet ?? []);
    } catch {}
  };
  const stops = [
    sources.feed.subscribe((envelopes) => {
      if (envelopes.some(movesQuiet)) void refetch();
    }),
    onReconnected(sources.feed, () => void refetch()),
  ];
  void refetch();
  return {
    has: (sessionId) =>
      sessionId !== undefined &&
      (sources.standing(sessionId)?.quiet ?? listed().includes(sessionId)),
    refetch,
    dispose: () => {
      for (const stop of stops) stop();
    },
  };
}

export async function toggleSessionQuiet(
  seams: QuietToggleSeams,
  sessionId: string | undefined,
): Promise<string> {
  if (sessionId === undefined) return noQuietSession;
  const quieting = !seams.quiet.has(sessionId);
  const reading = await seams.client.setQuiet(sessionId, quieting).catch(failureOf);
  if (reading instanceof Error) return `quiet unchanged · ${reading.message}`;
  if (reading === "missing") return quietSessionGone;
  if (reading.quiet) return quietOnNotice(seams.chords);
  return quietOffNotice(await sessionGrantsHeld(seams.client, sessionId), seams.chords);
}

export const noQuietSession = "no session is focused · quiet is kept per session";

export const quietSessionGone = "that session is gone · quiet is kept per session";

export function quietOnNotice(chords: QuietChords): string {
  return `quiet · the gate now grants what this session already covers · ${chords.quiet} ends it`;
}

export function quietOffNotice(grants: number | undefined, chords: QuietChords): string {
  if (grants === undefined) return `quiet off · ${chords.permissions} shows the grants it left`;
  if (grants === 0) return "quiet off · asks come to you again";
  return `quiet off · ${grantsStillHeld(grants, chords.permissions)}`;
}

export async function sessionGrantsHeld(
  client: Pick<KeyworkClient, "permissions">,
  sessionId: string,
): Promise<number | undefined> {
  const view = await client.permissions().catch(() => undefined);
  return view === undefined ? undefined : (view.session[sessionId]?.length ?? 0);
}

function movesQuiet(envelope: BusEnvelope): boolean {
  return envelope.type === "surface.changed" && envelope.payload.kind === "permissions";
}

function failureOf(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function grantsStillHeld(count: number, permissions: string): string {
  return count === 1
    ? `1 session grant still holds · ${permissions} revokes it`
    : `${count} session grants still hold · ${permissions} revokes them`;
}
