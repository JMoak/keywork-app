import { render } from "solid-js/web";
import { App } from "./app.tsx";
import "./app.css";
import { DevPage } from "./dev/dev-page.tsx";
import { browserHost } from "./host/browser.ts";
import { hostFromWindow } from "./host/port.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");

render(
  () => (devPageRequested() ? <DevPage /> : <App host={hostFromWindow() ?? browserHost()} />),
  root,
);

function devPageRequested(): boolean {
  const { pathname, search } = window.location;
  return pathname.endsWith("/dev") || new URLSearchParams(search).has("dev");
}

export { App } from "./app.tsx";
export { Composer } from "./composer/composer.tsx";
export * from "./flavor/index.ts";
export type { HostPort } from "./host/port.ts";
export { ConversationPane } from "./page/pane.tsx";
export { tierOf, type WidthTier } from "./page/tiers.ts";
