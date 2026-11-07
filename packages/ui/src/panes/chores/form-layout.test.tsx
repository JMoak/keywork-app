import { readFileSync } from "node:fs";
import { type Browser, chromium, type Page } from "@playwright/test";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import type { ShellSeams } from "../registry.ts";
import { type ChoresSpec, choresPaneWith } from "./index.tsx";
import { reading, recordingPort, testZone, thursdayMorning } from "./testing.ts";

afterEach(cleanup);

const paneWidth = 640;
const halfColumn = 360;

describe("the new-chore form in a half-height pane above another pane", () => {
  it("scrolls inside its own pane and every radio takes the click", async () => {
    const browser = await chromium.launch();
    onTestFinished(() => browser.close());
    const page = await stackedPanesPage(browser, await openedFormMarkup());
    expect(await choresStayInsideTheirPane(page)).toBe(true);
    expect(await formOpensInView(page)).toBe(true);
    for (const value of ["manual", "interval", "file", "write", "act"]) {
      const radio = page.locator(`.kw-chores input[value="${value}"]`);
      await radio.click({ timeout: 2_000 });
      expect(await radio.isChecked()).toBe(true);
      expect(await hitAtCentre(page, `.kw-chores input[value="${value}"]`)).toBe(true);
    }
  }, 30_000);
});

async function openedFormMarkup(): Promise<string> {
  const recorded = recordingPort(reading());
  const pane = choresPaneWith({
    port: () => recorded.port,
    clock: { now: () => thursdayMorning, zone: () => testZone },
  });
  let act: (action: string) => void = () => undefined;
  const spec: ChoresSpec = { kind: "chores" };
  const { container } = render(() => (
    <pane.component
      id="p1"
      spec={spec}
      focused
      shell={inertShell()}
      onAction={(handler) => {
        act = handler;
      }}
    />
  ));
  await settle();
  act("chores.new");
  await settle();
  return container.innerHTML;
}

async function stackedPanesPage(browser: Browser, chores: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: paneWidth, height: halfColumn * 2 } });
  await page.setContent(`<!doctype html>
<html>
  <head><style>${stylesheets()}</style><style>body { margin: 0; }</style></head>
  <body>
    ${slot(0, `<div class="kw-frame-body">${chores}</div>`)}
    ${slot(halfColumn, `<div class="kw-frame-body"><ul class="kw-workshop-limits">${"<li>a limitation of the workshop below</li>".repeat(40)}</ul></div>`)}
  </body>
</html>`);
  return page;
}

function slot(top: number, body: string): string {
  return `<div class="kw-slot" style="left: 0; top: ${top}px; width: ${paneWidth}px; height: ${halfColumn}px"><section class="kw-frame">${body}</section></div>`;
}

function stylesheets(): string {
  return [
    "../../shell/shell.css",
    "../../chrome/pane-frame.css",
    "../overview/overview.css",
    "./chores.css",
  ]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n");
}

function choresStayInsideTheirPane(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const chores = document.querySelector(".kw-chores");
    const slot = chores?.closest(".kw-slot");
    if (!chores || !slot) return false;
    return chores.getBoundingClientRect().bottom <= slot.getBoundingClientRect().bottom + 0.5;
  });
}

function formOpensInView(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const heading = document.querySelector(".kw-chores-form .kw-chores-heading");
    const slot = heading?.closest(".kw-slot");
    if (!heading || !slot) return false;
    const shown = slot.getBoundingClientRect();
    const box = heading.getBoundingClientRect();
    return box.top >= shown.top && box.bottom <= shown.bottom;
  });
}

function hitAtCentre(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((wanted) => {
    const radio = document.querySelector(wanted);
    if (!radio) return false;
    radio.scrollIntoView({ block: "nearest" });
    const box = radio.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === radio || hit === radio.closest("label");
  }, selector);
}

function inertShell(): ShellSeams {
  return {
    store: {},
    keys: { chord: (action: string) => `⟦${action}⟧`, leader: () => "ctrl+k" },
    sessions: {
      openSession: () => undefined,
      newSession: async () => undefined,
      startSession: async () => undefined,
    },
    host: {},
    workspace: "C:/work",
    currentSession: () => undefined,
    focusedPane: () => undefined,
    rebind: () => undefined,
    unseen: () => false,
    client: {},
    feed: { subscribe: () => () => undefined, onNotice: () => () => undefined },
    trust: {},
    openPane: () => undefined,
  } as unknown as ShellSeams;
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 6; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
