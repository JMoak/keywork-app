// First-light driver: launches the built console (packages/desktop/out) through Playwright's
// Electron harness and keeps it open behind a loopback control port, so a runbook step can
// look, press, type and take a screenshot into keywork-app's artifacts/first-light/ one request
// at a time.
//
//   FIRST_LIGHT_RUN=run-2 node packages/desktop/e2e/first-light/driver.mjs <workspace> [port]
//
// Requests (JSON bodies): POST /eval {js}, /main {js}, /shot {name}, /press {key},
// /type {text}, /click {selector}, /local-input, /close; GET /text, /windows.
import { spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(desktopRoot, "../..");
const shots = join(repoRoot, "artifacts", "first-light", process.env.FIRST_LIGHT_RUN ?? "");
const requireFromUi = createRequire(join(repoRoot, "packages", "ui", "package.json"));
const { _electron: electron } = requireFromUi("@playwright/test");
const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
const electronBinary = requireFromDesktop("electron");

const workspace = process.argv[2];
const port = Number(process.argv[3] ?? 47999);
mkdirSync(shots, { recursive: true });
const consoleLog = createWriteStream(join(shots, "console-main.log"), { flags: "a" });
const stamp = (line) => `${new Date().toISOString()} ${line}`;

const app = await electron.launch({
  executablePath: electronBinary,
  args: [".", ...(workspace ? [workspace] : [])],
  cwd: desktopRoot,
  env: { ...process.env },
  timeout: 60_000,
});
for (const stream of [app.process().stdout, app.process().stderr]) {
  stream?.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/))
      if (line !== "") consoleLog.write(`${stamp(line)}\n`);
  });
}
app.on("window", (opened) => consoleLog.write(`${stamp(`window opened ${opened.url()}`)}\n`));
let page = await consoleWindow();

async function consoleWindow() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const found = app.windows().find((candidate) => candidate.url().endsWith("index.html"));
    if (found !== undefined) return found;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return app.firstWindow();
}

async function mainWindow() {
  const windows = app.windows();
  const main = windows.find((candidate) => !candidate.url().includes("companion")) ?? windows[0];
  if (main !== undefined) page = main;
  return page;
}

async function body(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return text === "" ? {} : JSON.parse(text);
}

const routes = {
  "GET /text": async () => (await mainWindow()).evaluate(() => document.body.innerText),
  "GET /windows": async () => app.windows().map((candidate) => candidate.url()),
  "POST /eval": async ({ js }) => (await mainWindow()).evaluate(js),
  "POST /evalIn": async ({ url, js }) => {
    const target = app.windows().find((candidate) => candidate.url().includes(url));
    return target === undefined ? `no window matching ${url}` : target.evaluate(js);
  },
  "POST /main": async ({ js }) =>
    app.evaluate(new Function("electron", `return (${js})(electron)`)),
  "POST /shot": async ({ name, url }) => {
    const target = url
      ? app.windows().find((candidate) => candidate.url().includes(url))
      : await mainWindow();
    if (target === undefined) return `no window matching ${url}`;
    const file = join(shots, name);
    await target.screenshot({ path: file });
    return file;
  },
  "POST /press": async ({ key }) => {
    await (await mainWindow()).keyboard.press(key);
    return `pressed ${key}`;
  },
  "POST /type": async ({ text }) => {
    await (await mainWindow()).keyboard.type(text, { delay: 20 });
    return `typed ${text.length} characters`;
  },
  "POST /click": async ({ selector }) => {
    await (await mainWindow()).click(selector, { timeout: 5_000 });
    return `clicked ${selector}`;
  },
  "POST /local-input": async () => {
    const standIn = join(desktopRoot, "src", "main", "screen", "helper", "stand-in.ts");
    const pipe = process.env.KEYWORK_STAND_IN_PIPE;
    if (pipe === undefined || pipe === "")
      return "KEYWORK_STAND_IN_PIPE is unset: no stand-in to signal";
    const sent = spawnSync(process.execPath, [standIn, "local-input"], {
      env: { ...process.env, KEYWORK_STAND_IN_PIPE: pipe },
      encoding: "utf8",
    });
    return { exit: sent.status, stdout: sent.stdout, stderr: sent.stderr };
  },
  "POST /close": async () => {
    setTimeout(async () => {
      await app.close();
      server.close();
      consoleLog.end();
    }, 50);
    return "closing";
  },
};

const server = createServer(async (request, response) => {
  const route = routes[`${request.method} ${request.url}`];
  if (route === undefined) {
    response.writeHead(404).end("no such route");
    return;
  }
  try {
    const result = await route(await body(request));
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(result ?? null));
  } catch (error) {
    response.writeHead(500).end(String(error?.stack ?? error));
  }
});
server.listen(port, "127.0.0.1", () => console.log(`first-light driver on 127.0.0.1:${port}`));
app.process().on("exit", (code) => {
  console.log(`console exited ${code}`);
  server.close();
});
