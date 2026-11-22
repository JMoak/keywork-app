// Panes flicker guard: the built console (packages/desktop/out) spawned with its own debugging
// ports and driven by Runtime.evaluate alone, with a scripted engine and a scratch folder, home
// and user-data directory as the first-light smoke uses. No test driver attaches, because a
// debugger that attaches to the windows the pane pool opens pauses the page and paints its own
// veil over one frame.
//
// It moves focus, splits, closes, and sends a pane outside the window and back, with a
// conversation and a scrolled file pane on the stage, and holds each step to three rules:
//
//   frames   no frame the console presents may match neither the picture before the step nor
//            the settled one in 1% or more of the window (every frame is reduced to 64x40)
//   panes    no pane element may be removed or rebuilt, beyond the one pane the step is about
//   motion   nothing may animate but the title strip's own focus transition
//
//   bun run --cwd packages/desktop build      (once: the guard runs packages/desktop/out)
//   node packages/desktop/e2e/surfaces/flicker.mjs
//
// Exit 0 when every step holds, 1 when one does not or the console presented no frames (it was
// covered or minimised), 2 when there is no built console or no engine checkout.
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { printUncaught, uncaughtWatch } from "./uncaught.mjs";

const desktopRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(desktopRoot, "../..");
const keyworkRepo = resolve(process.env.KEYWORK_REPO ?? join(repoRoot, "..", "keywork"));
const keyworkCli = join(keyworkRepo, "packages", "cli", "src", "main.ts");
const scriptedEngine = join(import.meta.dirname, "..", "first-light", "scripted-engine.mjs");
const builtMain = join(desktopRoot, "out", "main", "index.js");

const pagePort = 9433;
const mainPort = 9434;
const settleMs = 900;
const transientShare = 1;
const stageSize = { width: 1600, height: 1000 };
const fileScrolledTo = 2400;

const titleStripMotion = new Set([
  "box-shadow@kw-frame-title",
  "color@kw-frame-name",
  "color@kw-composer-prompt",
  "opacity@kw-seam",
]);
const paneElement =
  /^(kw-slot|kw-frame|kw-conversation|kw-transcript|kw-stead|kw-surface|kw-yard|cm-editor)\b(?!-)/;

if (!existsSync(builtMain)) {
  console.error(`no built console at ${builtMain}`);
  console.error("build it first: bun run --cwd packages/desktop build");
  process.exit(2);
}
if (!existsSync(keyworkCli)) {
  console.error(`no engine checkout at ${keyworkRepo}`);
  console.error("name one: KEYWORK_REPO=<path to the keywork repo>");
  process.exit(2);
}

const electronBinary = createRequire(join(desktopRoot, "package.json"))("electron");
const electronModule =
  "process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron')";
const consoleWindow = `${electronModule}.BrowserWindow.getAllWindows().find(w=>w.getParentWindow()===null&&w.webContents.getURL().endsWith('/index.html'))`;

process.exitCode = await guard();

async function guard() {
  const scratch = scratchFolder();
  const held = { watch: uncaughtWatch(scratch.root) };
  try {
    trust(scratch, "trust");
    await launch(scratch, held);
    const walked = await walkThrough(held);
    const verdicts = [
      ...walked.steps.filter((step) => step.kept !== undefined).map(printStep),
      printFileScroll(walked.fileScroll),
    ];
    const clean = printUncaught("panes flicker", held.watch);
    return verdicts.every(Boolean) && clean ? 0 : 1;
  } catch (error) {
    console.error(`panes flicker · not measured · ${messageOf(error)}`);
    printUncaught("panes flicker", held.watch);
    return 1;
  } finally {
    for (const left of await cleanUp(scratch, held)) {
      console.error(`cleanup did not finish · ${left}`);
    }
  }
}

async function walkThrough({ page, main }) {
  await main.evaluate(
    `(()=>{const w=${consoleWindow};w.unmaximize();w.setContentSize(${stageSize.width},${stageSize.height});w.center();w.showInactive();w.moveTop();return true})()`,
  );
  await wait(settleMs);
  await startASession(page);
  await record(page, main);

  const steps = [];
  const step = async (label, kept, act) => {
    const visible = await page.evaluate("document.visibilityState");
    steps.push({ label, kept, visible, at: await main.evaluate("Date.now()") });
    await act();
    await wait(settleMs);
  };
  const press = (key, modifiers = "") => pressIn(page, key, modifiers);
  const leader = async (key) => {
    await press("k", "ctrlKey: true");
    await press(key);
  };
  const alt = (digit) => press(String(digit), "altKey: true");
  const nothing = { panes: [] };

  await step("focus left", nothing, () => leader("h"));
  await step("focus right", nothing, () => leader("l"));
  await step("focus by ordinal", nothing, () => alt(1));
  await step("focus by ordinal back", nothing, () => alt(2));
  await step("split seats a new pane", { panes: ["add kw-slot"] }, () => leader("s"));
  await step("focus left after the split", nothing, () => leader("h"));
  await step("focus right after the split", nothing, () => leader("l"));
  await step("close the new pane", { panes: ["remove kw-slot"] }, () => leader("x"));
  await step("(open a file pane and scroll it)", undefined, () => openTheFile(page, press));
  await step("focus left beside a file pane", nothing, () => leader("h"));
  await step("focus right beside a file pane", nothing, () => leader("l"));
  await step("focus by ordinal beside a file pane", nothing, () => alt(2));
  await step("send a pane outside", { panes: ["remove kw-frame"] }, () => leader("Enter"));
  await step("focus inside while a pane is outside", nothing, () => alt(1));
  await step("focus the file while a pane is outside", nothing, () => alt(3));
  await step("split while a pane is outside", { panes: ["add kw-slot"] }, () => leader("s"));
  await step("bring every pane inside", { panes: ["add kw-frame"] }, () => leader("Backspace"));
  steps.push({ label: "end", at: await main.evaluate("Date.now()") });

  const frames = await main.evaluate(
    `(()=>{try{${consoleWindow}.webContents.endFrameSubscription()}catch{};return globalThis.__frames})()`,
  );
  const log = await page.evaluate("window.__flicker");
  const fileScroll = await page.evaluate(`document.querySelector(".cm-scroller")?.scrollTop`);
  return {
    fileScroll,
    steps: steps
      .slice(0, -1)
      .map((held, at) => ({ ...held, ...readingOf(held, steps[at + 1].at, frames, log) })),
  };
}

function readingOf(step, until, frames, log) {
  const shots = frames.filter((frame) => frame.t >= step.at - 60 && frame.t < until);
  const before = shots.find((frame) => frame.t < step.at) ?? shots[0];
  const settled = shots[shots.length - 1];
  const strays = shots.slice(1).map(({ g }) => {
    const stray = g.filter(
      (value, px) => Math.abs(value - before.g[px]) > 10 && Math.abs(value - settled.g[px]) > 10,
    );
    return Math.round((stray.length / g.length) * 1000) / 10;
  });
  const within = (row) => row.t >= step.at && row.t < until;
  return {
    frames: shots.length,
    transients: strays.filter((share) => share >= transientShare),
    panes: log.mut.filter(within).filter((row) => paneElement.test(row.what)),
    motion: log.anim.filter(within).map((row) => `${row.name}@${row.on}`),
  };
}

function printStep(step) {
  const failures = [
    ...(step.visible === "visible" && step.frames > 0
      ? []
      : [`the console presented nothing to judge (page ${step.visible}, ${step.frames} frames)`]),
    ...(step.transients.length === 0
      ? []
      : [
          `${step.transients.length} transient frames, the largest ${Math.max(...step.transients)}% of the window`,
        ]),
    ...unexpectedPanes(step).map((row) => `pane element ${row}`),
    ...[...new Set(step.motion)]
      .filter((motion) => !titleStripMotion.has(motion))
      .map((motion) => `motion ${motion}`),
  ];
  const held = failures.length === 0;
  console.log(
    `panes flicker · ${step.label} · ${step.frames} frames · ${held ? "steady" : `FLICKER: ${failures.join("; ")}`}`,
  );
  return held;
}

function printFileScroll(fileScroll) {
  const held = fileScroll === fileScrolledTo;
  console.log(
    `panes flicker · the file pane's scroll · ${held ? `still ${fileScroll}, steady` : `FLICKER: ${fileScroll} where it was set to ${fileScrolledTo}`}`,
  );
  return held;
}

function unexpectedPanes(step) {
  const said = (row) => `${row.op} ${row.what.replace(/#.*$/, "")}`;
  const paneOf = (row) => row.what.replace(/^.*#/, "");
  const about = new Set(
    step.panes.filter((row) => step.kept.panes.includes(said(row))).map(paneOf),
  );
  return step.panes.filter((row) => !about.has(paneOf(row))).map((row) => `${row.op} ${row.what}`);
}

async function record(page, main) {
  await main.evaluate(`(()=>{
    const w=${consoleWindow};
    globalThis.__frames=[];
    w.webContents.beginFrameSubscription(false,(image)=>{
      const small=image.resize({width:64,height:40,quality:"good"});
      const size=small.getSize();const b=small.getBitmap();const g=new Array(size.width*size.height);
      for(let i=0;i<g.length;i++){const o=i*4;g[i]=Math.round(b[o]*0.114+b[o+1]*0.587+b[o+2]*0.299);}
      globalThis.__frames.push({t:Date.now(),g});
    });
    return true;
  })()`);
  await page.evaluate(`(()=>{
    const log={mut:[],anim:[]};
    const describe=n=>(typeof n.className==='string'?n.className:'').split(' ').slice(0,1).join('')+'#'+(n.getAttribute?.('data-pane-id')??n.closest?.('[data-pane-id]')?.getAttribute('data-pane-id')??'');
    new MutationObserver(records=>{for(const r of records){
      for(const n of r.addedNodes)if(n.nodeType===1)log.mut.push({t:Date.now(),op:'add',what:describe(n)});
      for(const n of r.removedNodes)if(n.nodeType===1)log.mut.push({t:Date.now(),op:'remove',what:describe(n)});
    }}).observe(document.body,{childList:true,subtree:true});
    const heard=e=>log.anim.push({t:Date.now(),name:e.animationName||e.propertyName,on:(typeof e.target.className==='string'?e.target.className:'').split(' ')[0]});
    document.addEventListener('animationstart',heard,true);document.addEventListener('transitionrun',heard,true);
    window.__flicker=log;
    return true;
  })()`);
}

async function startASession(page) {
  await page.evaluate(`(()=>{
    const input=document.querySelector(".kw-frame[data-focused] .kw-composer-input");
    input.focus();
    input.value="say hello";
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));
    return true;
  })()`);
  await wait(2 * settleMs);
}

async function openTheFile(page, press) {
  await press("p", "ctrlKey: true, shiftKey: true");
  await wait(settleMs / 2);
  await page.evaluate(`(()=>{
    const palette=document.querySelector("[aria-label=palette]");
    palette.value="/open README.md";
    palette.dispatchEvent(new Event("input",{bubbles:true}));
    return true;
  })()`);
  await wait(settleMs / 2);
  await page.evaluate(`(()=>{
    document.querySelector("[aria-label=palette]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));
    return true;
  })()`);
  await wait(2 * settleMs);
  await page.evaluate(
    `(()=>{const s=document.querySelector(".kw-frame[data-focused] .cm-scroller");if(s)s.scrollTop=${fileScrolledTo};return true})()`,
  );
}

function pressIn(page, key, modifiers) {
  return page.evaluate(`(()=>{
    const target=document.activeElement??document.body;
    target.dispatchEvent(new KeyboardEvent("keydown",{key:${JSON.stringify(key)},bubbles:true,cancelable:true,${modifiers}}));
    target.dispatchEvent(new KeyboardEvent("keyup",{key:${JSON.stringify(key)},bubbles:true,${modifiers}}));
    return true;
  })()`);
}

async function launch(scratch, held) {
  held.child = spawn(
    electronBinary,
    [
      ...held.watch.args,
      ".",
      `--user-data-dir=${scratch.userData}`,
      `--remote-debugging-port=${pagePort}`,
      `--inspect=127.0.0.1:${mainPort}`,
      scratch.workspace,
    ],
    {
      cwd: desktopRoot,
      env: { ...scratchEnv(scratch), ...held.watch.env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  held.watch.capture(held.child);
  const pageTarget = await eventually(async () =>
    (await targetsOn(pagePort)).find(
      (target) => target.type === "page" && target.url.endsWith("/index.html"),
    ),
  );
  if (pageTarget === undefined) {
    throw new Error("the console's page never reached its debugging port");
  }
  held.page = await debugSession(pageTarget.webSocketDebuggerUrl);
  held.main = await debugSession((await targetsOn(mainPort))[0].webSocketDebuggerUrl);
  const ready = await eventually(async () =>
    (await held.page.evaluate("document.querySelector('[aria-label=prompt]') !== null"))
      ? true
      : undefined,
  );
  if (ready === undefined) throw new Error("the console never showed a prompt");
  await wait(3 * settleMs);
}

async function eventually(find) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const found = await find();
    if (found !== undefined) return found;
    await wait(500);
  }
  return undefined;
}

async function targetsOn(port) {
  try {
    return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch {
    return [];
  }
}

async function debugSession(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let asked = 0;
  socket.addEventListener("message", (event) => {
    const answer = JSON.parse(String(event.data));
    const waiting = pending.get(answer.id);
    if (waiting === undefined) return;
    pending.delete(answer.id);
    if (answer.error) waiting.reject(new Error(JSON.stringify(answer.error)));
    else waiting.resolve(answer.result);
  });
  await new Promise((opened, failed) => {
    socket.addEventListener("open", () => opened(), { once: true });
    socket.addEventListener("error", () => failed(new Error(`cannot connect ${url}`)), {
      once: true,
    });
  });
  const call = (expression) =>
    new Promise((resolveCall, reject) => {
      asked += 1;
      pending.set(asked, { resolve: resolveCall, reject });
      const params = { expression, returnByValue: true, awaitPromise: true };
      socket.send(JSON.stringify({ id: asked, method: "Runtime.evaluate", params }));
    });
  return {
    evaluate: async (expression) => {
      const answer = await call(expression);
      if (answer.exceptionDetails) {
        throw new Error(JSON.stringify(answer.exceptionDetails).slice(0, 800));
      }
      return answer.result.value;
    },
    close: () => socket.close(),
  };
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function scratchFolder() {
  const root = mkdtempSync(join(tmpdir(), "panes-flicker-"));
  const scratch = {
    root,
    workspace: join(root, "panes-flicker"),
    home: join(root, "home"),
    userData: join(root, "user-data"),
    engineLog: join(root, "engine.log"),
  };
  for (const folder of [scratch.workspace, scratch.home, scratch.userData]) mkdirSync(folder);
  for (const known of ["Roaming", "Local"]) {
    mkdirSync(join(scratch.home, "AppData", known), { recursive: true });
  }
  writeFileSync(join(scratch.workspace, "README.md"), fileThatScrolls());
  scratch.launcher = engineLauncher(root);
  return scratch;
}

function fileThatScrolls() {
  return Array.from(
    { length: 400 },
    (_, index) => `line ${index + 1} of a file that scrolls, long enough to ink the pane`,
  ).join("\n");
}

function engineLauncher(root) {
  if (process.platform === "win32") {
    const launcher = join(root, "engine.cmd");
    writeFileSync(launcher, `@echo off\r\nbun "${scriptedEngine}" %*\r\n`);
    return launcher;
  }
  const launcher = join(root, "engine");
  writeFileSync(launcher, `#!/bin/sh\nexec bun "${scriptedEngine}" "$@"\n`);
  chmodSync(launcher, 0o755);
  return launcher;
}

function scratchEnv(scratch) {
  return {
    ...withoutModelKeys(process.env),
    USERPROFILE: scratch.home,
    HOME: scratch.home,
    KEYWORK_REPO: keyworkRepo,
    KEYWORK_BIN: scratch.launcher,
    FIRST_LIGHT_LOG: scratch.engineLog,
  };
}

function withoutModelKeys(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !/_API_KEY$/i.test(name)));
}

function trust(scratch, verb) {
  const ran = spawnSync("bun", [keyworkCli, verb], {
    cwd: scratch.workspace,
    env: scratchEnv(scratch),
    encoding: "utf8",
  });
  if (ran.status !== 0) throw new Error(`keywork ${verb} exited ${ran.status}: ${ran.stderr}`);
}

async function cleanUp(scratch, held) {
  const unfinished = [];
  const attempt = async (what, act) => {
    try {
      await act();
    } catch (error) {
      unfinished.push(`${what}: ${messageOf(error)}`);
    }
  };
  await attempt("close the debugging sessions", () => {
    held.page?.close();
    held.main?.close();
  });
  await attempt("close the console", () => stopProcessTree(held.child?.pid));
  await wait(settleMs);
  await attempt("stop the engine", () => stopEngine(scratch));
  await attempt("untrust the folder", () => trust(scratch, "untrust"));
  await attempt("remove the scratch folder", () =>
    rmSync(scratch.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }),
  );
  return unfinished;
}

function stopEngine(scratch) {
  if (!existsSync(scratch.engineLog)) return;
  const noted = readFileSync(scratch.engineLog, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
  for (const line of noted) stopProcessTree(line.engine);
}

function stopProcessTree(pid) {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
