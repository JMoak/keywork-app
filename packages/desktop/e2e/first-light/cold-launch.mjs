// Cold-launch check: launches the built console (packages/desktop/out) twice through
// Playwright's Electron harness and types nothing. The first launch has no folder and
// screenshots the open screen; the second opens the given folder and screenshots the first
// frame the keeper sees there. Both windows close on their own.
//
//   node packages/desktop/e2e/first-light/cold-launch.mjs <workspace> [shotsDir] [userDataDir]
//
// Prints one JSON report per frame: what it showed, so a handoff can quote it. A frame that
// never reaches its expected state is still read and shot, with the wait that ran out named.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(desktopRoot, "../..");
const steadRoot = resolve(repoRoot, "../..");
const requireFromUi = createRequire(join(repoRoot, "packages", "ui", "package.json"));
const { _electron: electron } = requireFromUi("@playwright/test");
const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
const electronBinary = requireFromDesktop("electron");

const workspace = process.argv[2];
const shots = resolve(process.argv[3] ?? join(steadRoot, "artifacts", "first-launch"));
const userData = process.argv[4];
if (workspace === undefined) {
  console.error("usage: cold-launch.mjs <workspace> [shotsDir] [userDataDir]");
  process.exit(2);
}
mkdirSync(shots, { recursive: true });

const openScreen = await frame({
  args: [],
  waits: [[".kw-open", 60_000]],
  shot: "01-open-screen.png",
  read: readOpenScreen,
});
console.log(JSON.stringify({ openScreen }, null, 2));
const stead = await frame({
  args: [workspace],
  waits: [
    [".kw-stead, .kw-open-failure", 120_000],
    [".kw-onboard[data-phase=step]", 90_000],
  ],
  shot: "02-stead-onboarding.png",
  read: readStead,
});
console.log(JSON.stringify({ stead }, null, 2));
process.exitCode = openScreen.ranOut === undefined && stead.ranOut === undefined ? 0 : 1;

async function frame({ args, waits, shot, read }) {
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [".", ...(userData === undefined ? [] : [`--user-data-dir=${userData}`]), ...args],
    cwd: desktopRoot,
    env: { ...process.env },
    timeout: 60_000,
  });
  const mainLog = [];
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream?.on("data", (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) if (line !== "") mainLog.push(line);
    });
  }
  try {
    const page = await consoleWindow(app);
    const ranOut = await settle(page, waits);
    await page.waitForTimeout(1_500);
    const seen = await page.evaluate(read, args[0] ?? null);
    await page.screenshot({ path: join(shots, shot) });
    return {
      ...seen,
      screenshot: join(shots, shot),
      ...(ranOut === undefined ? {} : { ranOut }),
      mainLog: mainLog.slice(-20),
    };
  } finally {
    await app.close();
  }
}

async function settle(page, waits) {
  for (const [selector, timeout] of waits) {
    try {
      await page.waitForSelector(selector, { timeout });
    } catch {
      return `waited ${timeout} ms for ${selector}`;
    }
    const stopped = await page.evaluate(() => {
      const failure = document.querySelector(".kw-open-failure")?.textContent;
      if (failure) return `the folder did not open: ${failure}`;
      const trustAsk = document.body.innerText.match(/^trust .+\?.*$/m);
      return trustAsk
        ? `the folder is untrusted, so onboarding cannot start: ${trustAsk[0]}`
        : null;
    });
    if (stopped !== null) return stopped;
  }
  return undefined;
}

async function consoleWindow(app) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const found = app.windows().find((candidate) => candidate.url().endsWith("index.html"));
    if (found !== undefined) return found;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return app.firstWindow();
}

function readOpenScreen() {
  const text = (selector) => document.querySelector(selector)?.textContent ?? null;
  return {
    heading: text(".kw-open-name"),
    folderLine: text(".kw-open-folder"),
    lessons: [...document.querySelectorAll(".kw-first-run-row")].map((row) => ({
      chord: row.querySelector(".kw-first-run-chord")?.textContent ?? "",
      does: row.querySelector(".kw-first-run-does")?.textContent ?? "",
    })),
    recents: [...document.querySelectorAll(".kw-open-recent-path")].map(
      (recent) => recent.textContent ?? "",
    ),
    mentionsKeywork: /keywork/i.test(document.body.innerText),
  };
}

async function readStead(workspace) {
  const frames = [...document.querySelectorAll(".kw-frame")].map((held) => ({
    name: held.querySelector(".kw-frame-name")?.textContent ?? "",
    focused: held.hasAttribute("data-focused"),
    left: held.closest(".kw-slot")?.style.left ?? "",
  }));
  const card = document.querySelector(".kw-onboard");
  const served = async (path) => {
    const host = window.keyworkHost;
    if (host === undefined || workspace === null) return "no host port";
    const head = await host.serverFetch(workspace, path, { method: "GET", headers: {} });
    let text = "";
    for (let chunk = await head.read(); chunk !== undefined; chunk = await head.read()) {
      text += new TextDecoder().decode(chunk);
    }
    return `${head.status} ${text.slice(0, 200)}`;
  };
  return {
    served: { workspace: await served("/workspace"), creatures: await served("/creatures") },
    frames,
    composerMounted: document.querySelector("[aria-label=prompt]") !== null,
    onboarding:
      card === null
        ? null
        : {
            phase: card.getAttribute("data-phase"),
            step: card.querySelector(".kw-onboard-step[data-current]")?.textContent ?? null,
            title: card.querySelector(".kw-onboard-title")?.textContent ?? null,
            lines: [...card.querySelectorAll(".kw-onboard-line, .kw-onboard-ask")].map(
              (line) => line.textContent ?? "",
            ),
            focused: document.activeElement !== null && card.contains(document.activeElement),
          },
    statusLine: document.querySelector(".kw-status")?.textContent ?? null,
    openFailure: document.querySelector(".kw-open-failure")?.textContent ?? null,
    bodyText: document.body.innerText.slice(0, 1_200),
  };
}
