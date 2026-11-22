import { clearDelegatedEvents, delegateEvents } from "solid-js/web";
import type { Detach } from "./realm.ts";

export function shareDelegatedEvents(target: Document, source: Document = document): Detach {
  const audience = audienceOf(source);
  audience.add(target);
  delegateEvents([...announcedNames(source, audience)], target);
  return () => {
    audience.delete(target);
    clearDelegatedEvents(target);
  };
}

// solid-js/web 1.9 keeps the event names it delegates for a document in a Set stored on that
// document under this key, and its handler is private: delegateEvents is the only way to attach it.
const delegatedNamesKey = "_$DX_DELEGATE";

type Delegating = Document & { [delegatedNamesKey]?: Set<string> };

const audiences = new WeakMap<Document, Set<Document>>();
const announcing = new WeakSet<Set<string>>();

function audienceOf(source: Document): Set<Document> {
  const known = audiences.get(source);
  if (known !== undefined) return known;
  const audience = new Set<Document>();
  audiences.set(source, audience);
  return audience;
}

function announcedNames(source: Delegating, audience: Set<Document>): Set<string> {
  const names = source[delegatedNamesKey] ?? new Set<string>();
  source[delegatedNamesKey] = names;
  if (!announcing.has(names)) announceAdditions(names, audience);
  return names;
}

function announceAdditions(names: Set<string>, audience: Set<Document>): void {
  const add = names.add.bind(names);
  names.add = (name) => {
    const known = names.has(name);
    add(name);
    if (!known) for (const target of audience) delegateEvents([name], target);
    return names;
  };
  announcing.add(names);
}
