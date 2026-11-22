import { createSignal, onCleanup, onMount } from "solid-js";
import { type Detach, inWindowOf, type Realm } from "./realm.ts";

export function windowFocusOf(node: () => Node | undefined): () => boolean {
  const [focused, setFocused] = createSignal(document.hasFocus());
  onMount(() => {
    const held = node();
    if (held !== undefined) onCleanup(inWindowOf(held, (realm) => followFocus(realm, setFocused)));
  });
  return focused;
}

function followFocus(realm: Realm, report: (focused: boolean) => void): Detach {
  const gained = (): void => report(true);
  const lost = (): void => report(false);
  report(realm.document.hasFocus());
  realm.addEventListener("focus", gained);
  realm.addEventListener("blur", lost);
  return () => {
    realm.removeEventListener("focus", gained);
    realm.removeEventListener("blur", lost);
  };
}
