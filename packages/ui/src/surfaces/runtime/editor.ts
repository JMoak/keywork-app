import type { EditorView } from "@codemirror/view";
import { type Detach, whenWindowChanges } from "./realm.ts";

export function followWindow(view: EditorView): Detach {
  return whenWindowChanges(view.dom, (realm) => {
    view.setRoot(realm.document);
    view.requestMeasure();
  });
}
