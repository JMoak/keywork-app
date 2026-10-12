import { createSignal } from "solid-js";
import type { PaneId } from "../layout/index.ts";
import type { PaneMarks } from "../panes/registry.ts";

export function createPaneMarks(isOpen: (paneId: PaneId) => boolean = () => true): PaneMarks {
  const [marked, setMarked] = createSignal<readonly PaneId[]>([]);
  const all = (): readonly PaneId[] => marked().filter(isOpen);
  return {
    toggle: (paneId) =>
      setMarked((ids) =>
        ids.includes(paneId) ? ids.filter((id) => id !== paneId) : [...ids.filter(isOpen), paneId],
      ),
    has: (paneId) => all().includes(paneId),
    all,
    clear: () => setMarked([]),
  };
}
