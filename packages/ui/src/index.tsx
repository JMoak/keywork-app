import { render } from "solid-js/web";
import { App } from "./app.tsx";
import "./app.css";
import { browserHost } from "./host/browser.ts";
import { hostFromWindow } from "./host/port.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");

render(() => <App host={hostFromWindow() ?? browserHost()} />, root);

export { App } from "./app.tsx";
export type { HostPort } from "./host/port.ts";
