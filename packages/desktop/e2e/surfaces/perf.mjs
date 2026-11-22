// Panes-outside measuring harness: the built console (packages/desktop/out) launched through
// Playwright as the first-light smoke launches it (scripted engine, scratch folder, scratch home
// and user-data directory, so ~/.keywork and the keeper's profile are never read or written). It
// puts sixteen panes outside the window, one at a time with a pause for the pool to refill, and
// prints what it measured, against a budget where there is one:
//
//   first frame   request to the first painted frame of each pane, p50 and p95, for panes that
//                 came from the warm pool. Budget: p95 at most 50 ms.
//   mover         who moved the panes while all sixteen glide together: JavaScript in the main
//                 process, or the native helper named by KEYWORK_PANES_MOVER. Told apart by how
//                 often the main process placed a pane window itself during the glide. Every
//                 pane must stand on its place afterwards, and a helper that was named must have
//                 been the one moving.
//   glide pacing  position updates a second that each of the sixteen windows really received
//                 during that glide. JavaScript sets a position every 8 ms whatever the display
//                 shows, so its budget is a floor that catches a starved timer: at least 55. The
//                 helper sets one position per refresh of the display by design, so its budget
//                 is nine refreshes in ten (54 at 60 Hz) and a figure above the refresh rate
//                 would mean nothing; it is not to be compared with JavaScript's. The count is
//                 of positions inside each pane's best half second, one more than the gaps
//                 between them, so it reads up to 2 a second over the true rate.
//   glide CPU     CPU time of the main process, and of the helper when it moved, from asking for
//                 that glide to its answer. No budget. Process times advance in steps of about
//                 15.6 ms on Windows, a little over 1% of a core at this glide's length.
//   together      how many of the glide's frames moved all sixteen panes inside one refresh of
//                 the display. Only with KEYWORK_PANES_PROBE naming keywork-rust's bench_probe,
//                 which polls every pane window's rectangle and reads the compositor's
//                 vertical-blank clock; it says when a rectangle changed, not what the display
//                 showed. No budget.
//   idle CPU      renderer and GPU process CPU while sixteen sit idle, beside the same reading
//                 taken before any pane left. Budget: each at most 1% of one core.
//   uncaught      exceptions nobody caught and rejections nobody handled in the main process,
//                 uncaught errors in any page, and renderers that crashed, from launch to quit
//                 (uncaught.mjs). Budget: none at all.
//
//   bun run --cwd packages/desktop build      (once: the harness runs packages/desktop/out)
//   node packages/desktop/e2e/surfaces/perf.mjs [--panes=16] [--idle-ms=5000] [--keep]
//   KEYWORK_PANES_MOVER=<kw-panes-mover.exe>  the same again with the helper moving the panes
//   KEYWORK_PANES_PROBE=<bench_probe.exe>     adds the together line
//
// The harness asks the workspace for its measuring hook by dispatching `hookRequest` on the
// console's window and reads it from window[hookName]; the hook's type and the helper that
// installs it are in packages/ui/src/surfaces/feel/perf-hook.ts. Without the hook it measures
// nothing and says where to install it. Every number printed was observed in this run: the first
// frame is the later of the host showing the window and the renderer painting the pane in it (the
// compositor puts that frame on glass within the next refresh, which nothing here can see), the
// pacing is counted from each window's own move events in the main process, and CPU is the
// processes' own CPU time over the sample.
//
// Exit 0 when every budget holds, 1 when one does not or could not be measured, 2 when there is
// no built console or no engine checkout to launch it with.
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
import { basename, join, resolve } from "node:path";
import { printUncaught, uncaughtWatch } from "./uncaught.mjs";

const hookName = "__keyworkPanesOutsidePerf";
const hookRequest = "keywork:panes-outside-perf";

const budgets = {
  firstFrameP95Ms: 50,
  glideUpdatesPerSecond: 55,
  refreshesWithAPosition: 0.9,
  idleCorePercent: 1,
};

const moverPath = process.env.KEYWORK_PANES_MOVER;
const probePath = process.env.KEYWORK_PANES_PROBE;

const desktopRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(desktopRoot, "../..");
const keyworkRepo = resolve(process.env.KEYWORK_REPO ?? join(repoRoot, "..", "keywork"));
const keyworkCli = join(keyworkRepo, "packages", "cli", "src", "main.ts");
const scriptedEngine = join(import.meta.dirname, "..", "first-light", "scripted-engine.mjs");
const builtMain = join(desktopRoot, "out", "main", "index.js");

const paneCount = numberFlag("panes", 16);
const idleSampleMs = numberFlag("idle-ms", 5_000);
const keepScratch = process.argv.includes("--keep");
// --play asks for the measured glide as one play, the way an arrangement is handed over.
// --grow=<px> also makes every pane that much wider and taller on the way.
const throughPlay = process.argv.includes("--play");
const growPx = process.argv.some((argument) => argument.startsWith("--grow="))
  ? numberFlag("grow", 1)
  : 0;
const hookAnswersWithinMs = 5_000;
const poolRefillMs = 300;
const startupSettleMs = 5_000;
const settleMs = 1_500;
const pacingGlideMs = 1_200;
const pacingTravelPx = 480;
const pacingWindowMs = 500;
const glideTailMs = 100;
const probeWatchesMs = pacingGlideMs + 600;
const javascriptFrameMs = 8;
const processTimeStepMs = 15.6;
const returnGlideMs = 200;
const consoleLinesKept = 15;

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

const requireFromUi = createRequire(join(repoRoot, "packages", "ui", "package.json"));
const { _electron: electron } = requireFromUi("@playwright/test");
const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
const electronBinary = requireFromDesktop("electron");

process.exitCode = await measure();

async function measure() {
  const scratch = scratchFolder();
  const held = { app: undefined };
  const withinBudgets = await measured(scratch, held);
  const { unfinished, clean } = await cleanUp(scratch, held.app);
  for (const left of unfinished) console.error(`cleanup did not finish · ${left}`);
  return withinBudgets && clean ? 0 : 1;
}

async function measured(scratch, held) {
  let said = [];
  try {
    trust(scratch, "trust");
    const app = await launch(scratch);
    held.app = app;
    scratch.watch.capture(app.process());
    said = whatTheConsoleSays(app);
    const page = await consoleWindow(app);
    await page.waitForFunction(() => window.keyworkHost !== undefined, null, { timeout: 60_000 });
    await page.waitForSelector("[aria-label=prompt]", { timeout: 120_000 });
    const missing = await whatIsMissing(page);
    if (missing !== undefined) {
      console.error(missing);
      return false;
    }
    await page.waitForTimeout(startupSettleMs);
    const atRestBefore = await cpuAtRest(app, page);
    const standingBefore = await windowsStandingOutside(app);
    const popped = await popOutside(page, paneCount);
    await page.waitForTimeout(settleMs);
    const standing = (await windowsStandingOutside(app)) - standingBefore;
    expect(
      standing >= paneCount,
      `the hook answered ${paneCount} times but the main process shows ${standing} more windows outside`,
    );
    const glided = await glideTogether(app, page, popped);
    await page.waitForTimeout(settleMs);
    const atRestWith = await cpuAtRest(app, page);
    const verdicts = [
      printFirstFrames(popped),
      printMover(glided),
      printPacing(glided),
      printGlideCpu(glided),
      printTogether(glided),
      printIdle(atRestBefore, atRestWith),
    ];
    return verdicts.every(Boolean);
  } catch (error) {
    console.error(`panes outside · not measured · ${messageOf(error)}`);
    for (const line of said.slice(-consoleLinesKept)) console.error(`  console: ${line}`);
    return false;
  }
}

async function whatIsMissing(page) {
  const found = await page.evaluate(
    async ({ hookName, hookRequest, within }) => {
      window.dispatchEvent(new Event(hookRequest));
      const deadline = performance.now() + within;
      while (window[hookName] === undefined && performance.now() < deadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      }
      return {
        port: typeof window.keyworkHost?.surfaces?.glide === "function",
        hook: typeof window[hookName]?.popOutside === "function",
      };
    },
    { hookName, hookRequest, within: hookAnswersWithinMs },
  );
  if (found.port && found.hook) return undefined;
  return [
    "panes outside · not measured · this build cannot be measured yet:",
    ...(found.port ? [] : [noPortWords()]),
    ...(found.hook ? [] : [noHookWords()]),
  ].join("\n");
}

function noPortWords() {
  return `
  no window.keyworkHost.surfaces: the preload exposes no port for panes outside the window
  (HostPort.surfaces, packages/ui/src/surfaces/port.ts), so no pane can leave it.`;
}

function noHookWords() {
  return `
  no measuring hook: the workspace did not answer the "${hookRequest}" event by setting
  window.${hookName} within ${hookAnswersWithinMs} ms.
  Install it once per workspace, where the workspace owns its panes outside the window (the shell
  that creates the runtime in packages/ui/src/surfaces/runtime):

    import { firstFramePaintedIn, offerSurfacesPerfHook } from "<ui>/surfaces/feel/perf-hook.ts";
    onCleanup(offerSurfacesPerfHook(window, () => ({ popOutside })));

  popOutside(): Promise<PoppedOutside> puts one more pane outside by the path a creature's pane
  takes (shown without focus) and resolves with
    { id, warm, bounds, requestedAt, shownAt, paintedAt }
  where the three times are performance.now() in the console's window: when it was asked, when
  the host's show resolved, and what firstFramePaintedIn(the pane's own window) resolved with,
  called after the pane was moved there and before the host was asked to show it.`;
}

async function popOutside(page, count) {
  const popped = [];
  for (let index = 0; index < count; index += 1) {
    const pane = await page.evaluate((name) => window[name].popOutside(), hookName);
    popped.push(wellFormed(pane, index));
    await page.waitForTimeout(poolRefillMs);
  }
  expect(
    new Set(popped.map((pane) => pane.id)).size === count,
    `the hook named ${new Set(popped.map((pane) => pane.id)).size} panes in ${count} answers`,
  );
  return popped;
}

function wellFormed(pane, index) {
  const said = JSON.stringify(pane);
  const times = [pane?.requestedAt, pane?.shownAt, pane?.paintedAt];
  expect(
    typeof pane?.id === "string" && typeof pane.warm === "boolean" && times.every(Number.isFinite),
    `pop ${index + 1}: the hook answered ${said}, not { id, warm, bounds, requestedAt, shownAt, paintedAt }`,
  );
  expect(
    pane.shownAt >= pane.requestedAt && pane.paintedAt >= pane.requestedAt,
    `pop ${index + 1}: the hook says the pane was shown or painted before it was asked for: ${said}`,
  );
  expect(
    [pane.bounds?.x, pane.bounds?.y, pane.bounds?.width, pane.bounds?.height].every(
      Number.isFinite,
    ),
    `pop ${index + 1}: the hook gave no bounds: ${said}`,
  );
  return { ...pane, firstFrameMs: Math.max(pane.shownAt, pane.paintedAt) - pane.requestedAt };
}

function printFirstFrames(popped) {
  const warm = popped.filter((pane) => pane.warm).map((pane) => pane.firstFrameMs);
  const cold = popped.filter((pane) => !pane.warm).map((pane) => pane.firstFrameMs);
  const budget = `budget p95 at most ${budgets.firstFrameP95Ms} ms`;
  if (cold.length > 0) {
    console.log(
      `panes outside · first frame · ${cold.length} of ${popped.length} did not come from the warm pool · p50 ${ms(percentile(cold, 50))} · p95 ${ms(percentile(cold, 95))} · no budget`,
    );
  }
  if (warm.length === 0) {
    console.log(
      `panes outside · first frame · no pane came from the warm pool · ${budget} · not measured`,
    );
    return false;
  }
  const p95 = percentile(warm, 95);
  const within = p95 <= budgets.firstFrameP95Ms;
  console.log(
    `panes outside · first frame · ${warm.length} of ${popped.length} from the warm pool · p50 ${ms(percentile(warm, 50))} · p95 ${ms(p95)} · slowest ${ms(Math.max(...warm))} · ${budget} · ${verdict(within)}`,
  );
  return within;
}

async function glideTogether(app, page, popped) {
  const desk = await page.evaluate(() => window.keyworkHost.surfaces.desk());
  const there = popped.map(({ id, bounds }) => ({
    id,
    bounds: grown(shiftedOn(desk.workArea, bounds), growPx),
  }));
  const back = popped.map(({ id, bounds }) => ({ id, bounds }));
  await glide(page, back, 0);
  const stage = await watchPanes(app);
  const helperBefore = helperCpuMs(stage.mainPid);
  const probe = await startProbe(stage.handles);
  await markCpu(app);
  await page.evaluate(
    ({ moves, durationMs, asAPlay }) => {
      const { surfaces } = window.keyworkHost;
      if (!asAPlay) return surfaces.glide({ moves, durationMs });
      return surfaces.play({ parts: moves.map((move) => ({ ...move, atMs: 0, durationMs })) });
    },
    { moves: there, durationMs: pacingGlideMs, asAPlay: throughPlay },
  );
  const main = await cpuSinceMark(app);
  if (throughPlay || growPx > 0) {
    console.log(
      `panes outside · asked · ${throughPlay ? "as one play" : "as a glide"}${growPx > 0 ? `, each pane growing ${growPx} px each way` : ""}`,
    );
  }
  await page.waitForTimeout(glideTailMs);
  const helperAfter = helperCpuMs(stage.mainPid);
  const seen = await stopWatching(app);
  const together = togetherness(await probe?.finished, stage.handles.length);
  await glide(page, back, returnGlideMs);
  const byHelper = moverPath !== undefined && seen.placements <= stage.handles.length;
  return {
    watched: stage.handles.length,
    refreshHz: stage.refreshHz,
    moves: seen.moves.filter((stamps) => stamps.length > 0),
    placements: seen.placements,
    onTheirPlace: there.filter(({ bounds }) => seen.rests.some((rest) => sameRect(rest, bounds)))
      .length,
    byHelper,
    main,
    helperCpuMs: byHelper && helperBefore !== undefined ? helperAfter - helperBefore : undefined,
    together,
  };
}

async function watchPanes(app) {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const panes = BrowserWindow.getAllWindows().filter(
      (held) => held.getParentWindow() !== null && held.isVisible(),
    );
    const home = BrowserWindow.getAllWindows().find((held) =>
      held.webContents.getURL().endsWith("index.html"),
    );
    const watch = { panes, moves: [], placements: 0, undo: [] };
    for (const held of panes) {
      const stamps = [];
      const note = () => stamps.push(performance.now());
      watch.moves.push(stamps);
      held.on("move", note);
      watch.undo.push(() => held.off("move", note));
      for (const place of ["setPosition", "setBounds"]) {
        const placing = held[place];
        held[place] = function counted(...given) {
          watch.placements += 1;
          return placing.apply(this, given);
        };
        watch.undo.push(() => delete held[place]);
      }
    }
    globalThis.panesOutsideWatch = watch;
    return {
      handles: panes.map((held) => held.getNativeWindowHandle().readBigUInt64LE(0).toString(16)),
      mainPid: process.pid,
      refreshHz: screen.getDisplayMatching(home.getBounds()).displayFrequency,
    };
  });
}

async function stopWatching(app) {
  return app.evaluate(() => {
    const { panes, moves, placements, undo } = globalThis.panesOutsideWatch;
    for (const restore of undo) restore();
    delete globalThis.panesOutsideWatch;
    return { moves, placements, rests: panes.map((held) => held.getBounds()) };
  });
}

async function markCpu(app) {
  await app.evaluate(() => {
    globalThis.panesOutsideCpu = { spent: process.cpuUsage(), at: performance.now() };
  });
}

async function cpuSinceMark(app) {
  return app.evaluate(() => {
    const { spent, at } = globalThis.panesOutsideCpu;
    delete globalThis.panesOutsideCpu;
    const since = process.cpuUsage(spent);
    return { cpuMs: (since.user + since.system) / 1000, wallMs: performance.now() - at };
  });
}

function helperCpuMs(mainPid) {
  if (moverPath === undefined || process.platform !== "win32") return undefined;
  const helper = `ParentProcessId=${mainPid} AND Name='${basename(moverPath)}'`;
  const asked = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Get-CimInstance Win32_Process -Filter "${helper}" | ForEach-Object { ($_.KernelModeTime + $_.UserModeTime) / 10000 }`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  const answered = (asked.stdout ?? "").trim();
  return answered === "" || !Number.isFinite(Number(answered)) ? undefined : Number(answered);
}

async function startProbe(handles) {
  if (probePath === undefined) return undefined;
  const child = spawn(probePath, ["watch", String(probeWatchesMs), "-", ...handles], {
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  let said = "";
  child.stdout.setEncoding("utf8");
  const finished = new Promise((resolveWait) => {
    child.once("error", () => resolveWait(""));
    child.once("close", () => resolveWait(said));
  });
  const watching = new Promise((resolveWait) => {
    child.stdout.on("data", (chunk) => {
      said += chunk;
      if (said.includes("\n")) resolveWait();
    });
  });
  await Promise.race([watching, finished]);
  return { finished };
}

function togetherness(probeSaid, panes) {
  if (probeSaid === undefined) return undefined;
  const probe = readProbe(probeSaid);
  if (probe.vblanks.length < 2 || probe.moves.length === 0) return { whole: 0 };
  const refreshOf = refreshClock(probe);
  const whole = framesOf(probe).filter((frame) => frame.length === panes);
  const spreadsMs = whole
    .map((frame) => ((Math.max(...frame) - Math.min(...frame)) / probe.ticksPerSecond) * 1000)
    .sort((a, b) => a - b);
  return {
    whole: whole.length,
    inOneRefresh: whole.filter((frame) => new Set(frame.map(refreshOf)).size === 1).length,
    medianSpreadMs: percentile(spreadsMs, 50),
    worstSpreadMs: spreadsMs.at(-1),
    longestPollGapMs: (probe.longestGap / probe.ticksPerSecond) * 1000,
  };
}

function readProbe(said) {
  const probe = { ticksPerSecond: 0, vblanks: [], origins: [], moves: [], longestGap: 0 };
  for (const line of said.split(/\r?\n/)) {
    const [kind, ...fields] = line.trim().split(" ");
    const [first, second, third, fourth] = fields.map(Number);
    if (kind === "clock") probe.ticksPerSecond = first;
    if (kind === "vblank") probe.vblanks.push({ refresh: first, at: second, period: third });
    if (kind === "origin") probe.origins[first] = { x: second, y: third };
    if (kind === "move") probe.moves.push({ at: first, pane: second, x: third, y: fourth });
    if (kind === "polls") probe.longestGap = second;
  }
  return probe;
}

function refreshClock({ vblanks: [before, after] }) {
  const refreshes = after.refresh - before.refresh;
  const measured = refreshes > 0 ? (after.at - before.at) / refreshes : before.period;
  const period =
    Math.abs(measured - before.period) < before.period * 0.01 ? measured : before.period;
  return (at) => Math.floor((at - before.at) / period);
}

// Every pane travels as far and is eased alike, so one frame of the glide puts each of them the
// same distance from where it started, some to the left and some to the right.
function framesOf(probe) {
  const frames = new Map();
  for (const move of probe.moves) {
    const origin = probe.origins[move.pane];
    const step = `${Math.abs(move.x - origin.x)},${Math.abs(move.y - origin.y)}`;
    const frame = frames.get(step) ?? new Map();
    frames.set(step, frame);
    if (!frame.has(move.pane)) frame.set(move.pane, move.at);
  }
  return [...frames.values()].map((frame) => [...frame.values()]);
}

async function glide(page, moves, durationMs) {
  await page.evaluate(
    async ({ moves, durationMs }) => {
      const landed = new Promise((resolveWait) => setTimeout(resolveWait, durationMs + 100));
      await Promise.all([window.keyworkHost.surfaces.glide({ moves, durationMs }), landed]);
    },
    { moves, durationMs },
  );
}

function grown(bounds, by) {
  return { ...bounds, width: bounds.width + by, height: bounds.height + by };
}

function shiftedOn(area, bounds) {
  const roomRight = area.x + area.width - (bounds.x + bounds.width);
  return {
    ...bounds,
    x: bounds.x + (roomRight >= pacingTravelPx ? pacingTravelPx : -pacingTravelPx),
  };
}

function sameRect(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function printMover({ placements, onTheirPlace, byHelper, watched }) {
  const landed = `${onTheirPlace} of ${paneCount} panes on their place afterwards`;
  const within = onTheirPlace === paneCount && (moverPath === undefined || byHelper);
  const who = byHelper
    ? `the helper ${basename(moverPath)} · the main process placed a pane window itself ${placements} times during the glide`
    : `JavaScript in the main process · ${placements} placements of ${watched} pane windows during the glide`;
  const unused =
    moverPath === undefined || byHelper
      ? ""
      : ` · KEYWORK_PANES_MOVER names ${moverPath}, which was not the one moving`;
  console.log(`panes outside · mover · ${who}${unused} · ${landed} · ${verdict(within)}`);
  return within;
}

function printPacing({ watched, moves, refreshHz, byHelper }) {
  const floor = pacingFloor(refreshHz, byHelper);
  const moved = moves.length;
  if (moved < paneCount) {
    console.log(
      `panes outside · glide pacing · ${moved} of ${paneCount} panes moved when all were asked to glide (${watched} windows watched) · ${floor.words} · not measured`,
    );
    return false;
  }
  const briefest = Math.min(...moves.map((seen) => seen.at(-1) - seen[0]));
  if (briefest < pacingWindowMs) {
    console.log(
      `panes outside · glide pacing · a pane moved for only ${ms(briefest)} of the ${pacingGlideMs} ms asked; pacing is read over ${pacingWindowMs} ms of motion · ${floor.words} · not measured`,
    );
    return false;
  }
  const rates = moves.map(steadiestRate).sort((a, b) => a - b);
  const slowest = rates[0];
  const within = slowest >= floor.atLeast;
  console.log(
    `panes outside · glide pacing · ${moved} panes gliding together for ${pacingGlideMs} ms · slowest pane ${perSecond(slowest)} · median pane ${perSecond(percentile(rates, 50))} · over each pane's best ${pacingWindowMs} ms · ${floor.words} · ${verdict(within)}`,
  );
  return within;
}

function pacingFloor(refreshHz, byHelper) {
  const display = refreshHz > 0 ? `this ${refreshHz} Hz display` : "the display";
  if (!byHelper || !(refreshHz > 0)) {
    return {
      atLeast: budgets.glideUpdatesPerSecond,
      words: `budget at least ${budgets.glideUpdatesPerSecond} updates/s: JavaScript sets a position every ${javascriptFrameMs} ms, more often than ${display} shows one, and the floor catches a starved timer`,
    };
  }
  const atLeast = Math.floor(refreshHz * budgets.refreshesWithAPosition);
  return {
    atLeast,
    words: `budget at least ${atLeast} updates/s: the helper sets one position per refresh of ${display} by design, the floor is nine refreshes in ten, and the figure is not to be compared with JavaScript's`,
  };
}

function printGlideCpu({ main, helperCpuMs: helperMs, byHelper }) {
  const share = (cpuMs) => `${percent((cpuMs / main.wallMs) * 100)} of one core`;
  const helper = !byHelper
    ? ""
    : helperMs === undefined
      ? " · helper not read: no such process under the main process"
      : ` · helper ${share(helperMs)} (${helperMs.toFixed(0)} ms)`;
  console.log(
    `panes outside · glide CPU · main process ${share(main.cpuMs)} (${main.cpuMs.toFixed(0)} ms of CPU in the ${main.wallMs.toFixed(0)} ms from asking for the glide to its answer)${helper} · no budget · process times advance in steps of about ${processTimeStepMs} ms`,
  );
  return true;
}

function printTogether({ together }) {
  if (together === undefined) {
    console.log(
      "panes outside · together · not measured: name keywork-rust's bench_probe with KEYWORK_PANES_PROBE to count the frames that moved every pane inside one refresh",
    );
  } else if (together.whole === 0) {
    console.log(
      "panes outside · together · not measured: the probe saw no frame that moved every pane",
    );
  } else {
    console.log(
      `panes outside · together · ${together.inOneRefresh} of ${together.whole} frames moved all ${paneCount} panes inside one refresh (${percent((together.inOneRefresh / together.whole) * 100)}) · first pane to last ${ms(together.medianSpreadMs)} in the median frame, ${ms(together.worstSpreadMs)} in the worst · when each window's rectangle changed, by a probe that looked at least every ${ms(together.longestPollGapMs)}, on the compositor's vertical-blank clock; not what the display showed · no budget`,
    );
  }
  return true;
}

function steadiestRate(stamps) {
  let most = 0;
  let from = 0;
  for (let to = 0; to < stamps.length; to += 1) {
    while (stamps[to] - stamps[from] >= pacingWindowMs) from += 1;
    most = Math.max(most, to - from + 1);
  }
  return (most * 1000) / pacingWindowMs;
}

async function cpuAtRest(app, page) {
  const before = await cpuSpent(app);
  await page.waitForTimeout(idleSampleMs);
  const after = await cpuSpent(app);
  const seconds = (after.at - before.at) / 1000;
  const share = (role) => {
    const spent = after.spent[role] - before.spent[role];
    expect(Number.isFinite(spent), `the ${role} process reports no CPU time on this platform`);
    return (spent / seconds) * 100;
  };
  return { renderer: share("renderer"), gpu: share("gpu"), main: share("main") };
}

async function cpuSpent(app) {
  return app.evaluate(({ app: electronApp, BrowserWindow }) => {
    const home = BrowserWindow.getAllWindows().find((held) =>
      held.webContents.getURL().endsWith("index.html"),
    );
    const rendererPid = home?.webContents.getOSProcessId();
    const metrics = electronApp.getAppMetrics();
    const seconds = (pick) => metrics.find(pick)?.cpu.cumulativeCPUUsage;
    return {
      at: performance.now(),
      spent: {
        renderer: seconds((metric) => metric.pid === rendererPid),
        gpu: seconds((metric) => metric.type === "GPU"),
        main: seconds((metric) => metric.type === "Browser"),
      },
    };
  });
}

function printIdle(before, withPanes) {
  const reading = (role) =>
    `${role} ${percent(withPanes[role])} of one core (${percent(before[role])} before any pane left)`;
  const within = ["renderer", "gpu"].every((role) => withPanes[role] <= budgets.idleCorePercent);
  console.log(
    `panes outside · idle CPU · ${paneCount} panes idle for ${idleSampleMs} ms · ${reading("renderer")} · ${reading("gpu")} · ${reading("main")} · budget: renderer and gpu each at most ${budgets.idleCorePercent}% of one core · ${verdict(within)}`,
  );
  return within;
}

async function windowsStandingOutside(app) {
  return app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter(
        (held) => held.getParentWindow() !== null && held.isVisible(),
      ).length,
  );
}

function percentile(values, rank) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1)];
}

function ms(value) {
  return `${value.toFixed(1)} ms`;
}

function perSecond(value) {
  return `${value.toFixed(0)} updates/s`;
}

function percent(value) {
  return `${value.toFixed(2)}%`;
}

function verdict(within) {
  return within ? "within budget" : "OVER BUDGET";
}

function numberFlag(name, fallback) {
  const given = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  const value = given === undefined ? fallback : Number(given.slice(name.length + 3));
  if (Number.isInteger(value) && value > 0) return value;
  console.error(`--${name} wants a whole number above zero`);
  process.exit(2);
}

function expect(holds, failure) {
  if (!holds) throw new Error(failure);
}

function scratchFolder() {
  const root = mkdtempSync(join(tmpdir(), "panes-outside-perf-"));
  const scratch = {
    root,
    workspace: join(root, "panes-outside"),
    home: join(root, "home"),
    userData: join(root, "user-data"),
    engineLog: join(root, "engine.log"),
  };
  for (const folder of [scratch.workspace, scratch.home, scratch.userData]) mkdirSync(folder);
  for (const known of ["Roaming", "Local"]) {
    mkdirSync(join(scratch.home, "AppData", known), { recursive: true });
  }
  scratch.launcher = engineLauncher(root);
  scratch.watch = uncaughtWatch(root);
  return scratch;
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

async function launch(scratch) {
  return electron.launch({
    executablePath: electronBinary,
    args: [...scratch.watch.args, ".", `--user-data-dir=${scratch.userData}`, scratch.workspace],
    cwd: desktopRoot,
    env: { ...scratchEnv(scratch), ...scratch.watch.env },
    timeout: 60_000,
  });
}

function whatTheConsoleSays(app) {
  const said = [];
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream?.on("data", (chunk) => {
      for (const line of String(chunk).split("\n")) {
        if (line.trim() !== "") said.push(line.trim());
      }
    });
  }
  return said;
}

async function consoleWindow(app) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const found = app.windows().find((candidate) => candidate.url().endsWith("index.html"));
    if (found !== undefined) return found;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  return app.firstWindow();
}

async function cleanUp(scratch, app) {
  const unfinished = [];
  const attempt = async (what, act) => {
    try {
      await act();
    } catch (error) {
      unfinished.push(`${what}: ${messageOf(error)}`);
    }
  };
  await attempt("close the console", () => app?.close());
  await attempt("stop the engine", () => stopEngine(scratch));
  await attempt("untrust the folder", () => trust(scratch, "untrust"));
  const clean = printUncaught("panes outside", scratch.watch);
  if (keepScratch || !clean) {
    console.log(`scratch folder kept, with the console's output: ${scratch.watch.outputFile}`);
  } else await attempt("remove the scratch folder", () => removeScratch(scratch));
  return { unfinished, clean };
}

function removeScratch(scratch) {
  rmSync(scratch.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function stopEngine(scratch) {
  for (const line of engineLines(scratch)) {
    if (line.engine === undefined) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(line.engine), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(line.engine, "SIGTERM");
      } catch {}
    }
  }
}

function engineLines(scratch) {
  if (!existsSync(scratch.engineLog)) return [];
  return readFileSync(scratch.engineLog, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
