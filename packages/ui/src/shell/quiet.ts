import type { KeyworkClient } from "@keywork-app/client";
import { createSignal } from "solid-js";

export interface QuietSessions {
  has(sessionId: string | undefined): boolean;
  toggle(sessionId: string): boolean;
  all(): readonly string[];
}

export interface QuietChords {
  readonly approve: string;
  readonly quiet: string;
  readonly permissions: string;
}

export interface QuietToggleSeams {
  readonly quiet: QuietSessions;
  readonly client: Pick<KeyworkClient, "permissions">;
  readonly chords: QuietChords;
}

export function createQuietSessions(): QuietSessions {
  const [quiet, setQuiet] = createSignal<readonly string[]>([]);
  const has = (sessionId: string | undefined): boolean =>
    sessionId !== undefined && quiet().includes(sessionId);
  return {
    has,
    toggle: (sessionId) => {
      const quieting = !has(sessionId);
      setQuiet((ids) => (quieting ? [...ids, sessionId] : ids.filter((id) => id !== sessionId)));
      return quieting;
    },
    all: quiet,
  };
}

export async function toggleSessionQuiet(
  seams: QuietToggleSeams,
  sessionId: string | undefined,
): Promise<string> {
  if (sessionId === undefined) return noQuietSession;
  if (seams.quiet.toggle(sessionId)) return quietOnNotice(seams.chords);
  return quietOffNotice(await sessionGrantsHeld(seams.client, sessionId), seams.chords);
}

export const noQuietSession = "no session is focused · quiet is kept per session";

export function quietOnNotice(chords: QuietChords): string {
  return `quiet · ${chords.approve} now grants an ask for the rest of this session · ${chords.quiet} ends it`;
}

export function quietOffNotice(grants: number | undefined, chords: QuietChords): string {
  if (grants === undefined) return `quiet off · ${chords.permissions} shows the grants it left`;
  if (grants === 0) return `quiet off · ${chords.approve} answers once again`;
  return `quiet off · ${grantsStillHeld(grants, chords.permissions)}`;
}

export async function sessionGrantsHeld(
  client: Pick<KeyworkClient, "permissions">,
  sessionId: string,
): Promise<number | undefined> {
  const view = await client.permissions().catch(() => undefined);
  return view === undefined ? undefined : (view.session[sessionId]?.length ?? 0);
}

function grantsStillHeld(count: number, permissions: string): string {
  return count === 1
    ? `1 session grant still holds · ${permissions} revokes it`
    : `${count} session grants still hold · ${permissions} revokes them`;
}
