// First-light smoke: runbook steps 2 to 4 (docs/first-light.md) against the built console, with
// no human and no tokens. The console starts the scripted engine (scripted-engine.mjs: keywork's
// own CLI from the sibling checkout with one scripted provider) on a scratch folder under the OS
// temp dir, trusted from inside before the launch and untrusted after. The engine and the trust
// keep their state in a scratch home beside the folder, so ~/.keywork is never read or written.
// The driver types only what the screen offers a new keeper: the onboarding card's own keys, a
// request in the conversation, `y` on the ask, the chores pane's buttons and the chord it prints.
//
//   bun run --cwd packages/desktop build      (once: the smoke runs packages/desktop/out)
//   bun run smoke:first-light [--keep] [--trail]
//
// Prints one line per step and exits 0 when every step is observed. The first regressed step
// stops the run: its name, the check that failed and a screenshot beside report.json in the
// scratch folder, which is then kept; exit 1. --keep keeps the scratch folder after a pass too.
// --trail runs the yard's trail alone, under the console's own keywork profile: the yard one
// chord from tiles, a session's model sets out a diff, the keeper opens a file from it and a
// test from the file, and the plot folds as one card and restores; every stage is shot into
// artifacts/e2e/trail.
import { spawnSync } from "node:child_process";
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
import {
  changeTitle,
  delivered,
  introduction,
  notePath,
  setOut,
  sumPath,
  sumTestPath,
  trailRequest,
} from "./scripted-engine.mjs";

const desktopRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(desktopRoot, "../..");
const keyworkRepo = resolve(process.env.KEYWORK_REPO ?? join(repoRoot, "..", "keywork"));
const keyworkCli = join(keyworkRepo, "packages", "cli", "src", "main.ts");
const scriptedEngine = join(import.meta.dirname, "scripted-engine.mjs");
const builtMain = join(desktopRoot, "out", "main", "index.js");
const requireFromUi = createRequire(join(repoRoot, "packages", "ui", "package.json"));
const { _electron: electron } = requireFromUi("@playwright/test");
const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
const electronBinary = requireFromDesktop("electron");

const firstLight = [
  { id: "2", name: "the stead first, a creature made and introduced", run: stepTwo },
  { id: "3", name: "one turn writes a file, asks, delivers", run: stepThree },
  { id: "4", name: "a read-only chore completes, a write chore parks", run: stepFour },
];
const trailStep = {
  id: "trail",
  name: "a diff set out, a file and a test opened from it, the plot folds and restores",
  run: stepTrail,
};
const steps = process.argv.includes("--trail") ? [trailStep] : firstLight;
const trailShots = join(repoRoot, "artifacts", "e2e", "trail");

const readOnlyChore = {
  title: "look around",
  instructions: "say in one line what this folder holds",
};
const writeChore = {
  title: "stamp a note",
  instructions: "stamp today's date into notes/stamp.md",
};
const keeperRequest = `write a short note about this folder to ${notePath}`;
const porchLetsGoMs = 5_000;
let openedFolder;

if (!existsSync(builtMain)) {
  console.error(`no built console at ${builtMain}`);
  console.error("build it first: bun run --cwd packages/desktop build");
  process.exit(2);
}
process.exitCode = await smoke(process.argv.includes("--keep"));

async function smoke(keep) {
  const scratch = scratchFolder();
  const started = Date.now();
  const outcomes = [];
  let app;
  let failed = false;
  let unfinished = [];
  try {
    trust(scratch, "trust");
    app = await launch(scratch);
    const world = { scratch, app, page: await consoleWindow(app) };
    for (const step of steps) {
      const at = Date.now();
      try {
        const observed = await step.run(world);
        outcomes.push({ ...step, verdict: "observed", seconds: secondsSince(at), observed });
      } catch (error) {
        failed = true;
        const shot = join(scratch.root, `step-${step.id}.png`);
        await world.page.screenshot({ path: shot }).catch(() => undefined);
        outcomes.push({
          ...step,
          verdict: "regressed",
          seconds: secondsSince(at),
          failure: messageOf(error),
          screenshot: shot,
          screen: await screenText(world.page),
        });
        break;
      }
    }
  } catch (error) {
    failed = true;
    outcomes.push({ id: "-", name: "launch", verdict: "regressed", failure: messageOf(error) });
  } finally {
    unfinished = await cleanUp(scratch, app);
  }
  const report = reportOf(scratch, outcomes, secondsSince(started), unfinished);
  writeFileSync(scratch.report, `${JSON.stringify(report, null, 2)}\n`);
  printTable(report);
  if (failed || keep) console.log(`scratch folder kept: ${scratch.root}`);
  else rmSync(scratch.root, { recursive: true, force: true });
  return failed ? 1 : 0;
}

async function stepTwo(world) {
  const { page } = world;
  await page.waitForSelector(".kw-stead", { timeout: 120_000 });
  await page.waitForSelector(".kw-onboard[data-phase=step]", { timeout: 90_000 });
  const first = await page.evaluate(firstFrame);
  expect(
    first.focused === "stead",
    `the first frame is ${first.focused ?? "nothing"}, not the stead`,
  );
  expect(!first.composer, "a composer is in the first frame");
  expect(first.onStead, "onboarding is not on the stead");
  const cardLines = [];
  for (const step of ["name", "skin", "workshop", "models"]) {
    await page.waitForSelector(`.kw-onboard[data-phase=step] .kw-onboard-step[data-current]`);
    const current = await page.evaluate(currentOnboardingStep);
    expect(current.step === step, `onboarding is at ${current.step}, not ${step}`);
    cardLines.push(...current.lines);
    await page.keyboard.press(step === "name" ? "1" : "Enter");
    await page.waitForFunction(
      (left) =>
        document.querySelector(".kw-onboard-step[data-current]")?.textContent?.trim() !== left ||
        document.querySelector(".kw-onboard[data-phase=step]") === null,
      current.step,
    );
  }
  await page.waitForSelector(".kw-onboard[data-phase=made]", { timeout: 60_000 });
  const made = await page.evaluate(onboardingLines);
  expect(
    made.some((line) => line.includes("introduces itself through scripted/first-light")),
    `the made card promises no introduction: ${made.join(" | ")}`,
  );
  const creatures = await served(page, "/creatures");
  expect(creatures.creatures?.length === 1, `GET /creatures lists ${creatures.creatures?.length}`);
  const creature = creatures.creatures[0];
  world.creature = creature.slug;
  const detail = await served(page, `/creatures/${creature.slug}`);
  world.conversation = detail.conversation;
  const introduced = await until(page, async () => {
    const session = await served(page, `/sessions/${world.conversation}`);
    return lastAssistantText(session) === introduction ? session : undefined;
  });
  const frame = introduced.reports?.find((report) => report.kind === "frame");
  expect(frame !== undefined, "the introduction has no frame under reports");
  expect(
    !introduced.messages.slice(0, frame.index).some((message) => message.role === "tool"),
    "a tool ran before the creature's first words",
  );
  await page.keyboard.press("Enter");
  await page.waitForSelector(".kw-onboard[data-phase=made]", { state: "detached" });
  return `${creature.name} (${creature.slug}) made through ${cardLines.length} card lines; introduced in ${wordCount(introduction)} words after a frame`;
}

async function stepThree(world) {
  const { page } = world;
  await page.click("[aria-label=prompt]");
  await page.keyboard.type(keeperRequest, { delay: 5 });
  await page.keyboard.press("Enter");
  await page.waitForSelector("fieldset.kw-ask", { timeout: 60_000 });
  const ask = await page.evaluate(askSeen);
  const porch = await porchHolding(page);
  if (!ask.focused) await page.click("fieldset.kw-ask");
  await page.keyboard.press("y");
  await page
    .waitForSelector("fieldset.kw-ask", { state: "detached", timeout: 30_000 })
    .catch(() => {
      throw new Error(`y left the ask unanswered: "${ask.why}" still waits on its card`);
    });
  const letGo = await porchLettingGo(page, "once y answered it in the conversation");
  const written = join(world.scratch.workspace, notePath);
  const session = await until(page, async () => {
    const reading = await served(page, `/sessions/${world.conversation}`);
    return reading.reports?.some((report) => report.text === delivered) ? reading : undefined;
  });
  expect(existsSync(written), `${notePath} is not in the scratch folder`);
  const report = session.reports.find((line) => line.text === delivered);
  expect(
    report.index === session.messages.length,
    `a reply turn follows the delivered line (index ${report.index} of ${session.messages.length})`,
  );
  expect(report.origin?.kind === "creature", "the delivered line carries no creature origin");
  await porchLettingGo(page, "after the turn delivered");
  return `asked ${ask.why}; the porch held "${porch.bubble}" at ${porch.count}; y answered it ${ask.focused ? "with the card focused" : "after a click"}; the porch let go in ${letGo}s and stayed clear; ${notePath} written; delivered "${delivered}" at reports index ${report.index}`;
}

async function porchHolding(page) {
  const held = await page.waitForFunction(porchHolds, null, { timeout: porchLetsGoMs }).then(
    () => true,
    () => false,
  );
  const porch = await page.evaluate(porchSeen);
  expect(held, `the stead never held the waiting ask: ${porchWords(porch)}`);
  return porch;
}

async function porchLettingGo(page, when) {
  const at = Date.now();
  const cleared = await page.waitForFunction(porchClear, null, { timeout: porchLetsGoMs }).then(
    () => true,
    () => false,
  );
  if (!cleared) {
    const porch = await page.evaluate(porchSeen);
    throw new Error(
      `the stead kept the answered ask ${when}: ${porchWords(porch)} ${porchLetsGoMs / 1000} s on`,
    );
  }
  return secondsSince(at);
}

function porchWords(porch) {
  if (!porch.stead) return "the stead is not on screen";
  const bubble = porch.bubble === null ? "no bubble" : `the bubble reads "${porch.bubble}"`;
  const count = porch.count === null ? "the head counts nobody" : `the head counts ${porch.count}`;
  return `${bubble}, ${count}`;
}

async function stepFour(world) {
  const { page } = world;
  await openChores(page);
  const lookAround = await addChore(page, { ...readOnlyChore, tools: "read-only" });
  await runChore(page, readOnlyChore.title);
  const completed = await until(page, async () => {
    const runs = await served(page, `/creatures/${world.creature}/routines/${lookAround}/runs`);
    return runsOf(runs).find((run) => run.process === "completed");
  });
  await backToChores(page);
  const stamp = await addChore(page, { ...writeChore, tools: "write" });
  await runChore(page, writeChore.title);
  const parked = await until(page, async () => {
    const runs = await served(page, `/creatures/${world.creature}/routines/${stamp}/runs`);
    return runsOf(runs).find((run) => run.status === "parked");
  });
  expect(parked.sessionId === null, `the parked run holds session ${parked.sessionId}`);
  const needs = await until(page, async () => {
    const reading = await served(page, "/routines/needs-you");
    const items = needItems(reading);
    return items.length > 0 ? items : undefined;
  });
  expect(needs.length === 1, `${needs.length} needs-you items, not one`);
  await backToChores(page);
  await page.waitForFunction(() => /2 chores · 1 needs you/.test(document.body.innerText));
  return `${readOnlyChore.title}: run ${completed.process}; ${writeChore.title}: ${parked.status}, no session, ${needs.length} needs-you item (${needs[0].kind}), pane reads 2 chores · 1 needs you`;
}

async function stepTrail(world) {
  const { page } = world;
  mkdirSync(trailShots, { recursive: true });
  await page.waitForSelector("[aria-label=prompt]", { timeout: 120_000 });
  await pressLeader(page, "Shift+Y");
  await page.waitForSelector(".kw-yard[data-mode='yard']", { timeout: 15_000 });
  await page.click("[aria-label=prompt]");
  await page.keyboard.type(trailRequest, { delay: 5 });
  await page.keyboard.press("Enter");
  for (const path of [sumPath, sumTestPath]) await approveWrite(page, path);
  const diff = await settingOut(page, (setting) => setting.what.title === changeTitle);
  await page.waitForSelector(panelOf(diff.id), { timeout: 30_000 });
  await until(page, async () => {
    const reading = await served(page, `/sessions/${diff.sessionId}`);
    return lastAssistantText(reading) === setOut ? reading : undefined;
  });
  const keptTyping = await page.evaluate(focusOutsideTheYard);
  expect(keptTyping, "the diff unfolding took the keeper's focus");
  const shots = [await trailShot(page, "1-diff-set-out.png")];

  await page.click(`${panelOf(diff.id)} .kw-diff-file-row:has-text("${sumPath}")`);
  await page
    .waitForSelector(`${panelOf(diff.id)} .kw-diff[aria-label="file diff"]`, { timeout: 10_000 })
    .catch(async () => {
      const seen = await page.evaluate(panelReading, diff.id);
      throw new Error(`the diff panel did not open ${sumPath}: ${seen}`);
    });
  await page.click(`${panelOf(diff.id)} button.kw-diff-show`);
  const file = await settingOut(page, (setting) => setting.what.ref === sumPath);
  expectOpenedFrom(file, diff);
  await page.waitForSelector(panelOf(file.id), { timeout: 15_000 });
  shots.push(await trailShot(page, "2-file-from-the-diff.png"));

  await page.click(`${panelOf(file.id)} .kw-file-facts`);
  const fileHeld = await page.evaluate(panelHoldingFocus);
  expect(fileHeld === file.id, `a press on the file panel left focus in ${fileHeld}`);
  await page.keyboard.press("Control+p");
  await page.keyboard.type(`/open ${sumTestPath}`, { delay: 5 });
  await page.keyboard.press("Enter");
  const test = await settingOut(page, (setting) => setting.what.ref === sumTestPath, 15_000).catch(
    async () => {
      const said = await page.textContent(".kw-status-notice").catch(() => null);
      throw new Error(
        `/open from the file panel set nothing out: the console said "${said}", focus in ${await page.evaluate(panelHoldingFocus)}`,
      );
    },
  );
  expectOpenedFrom(test, file);
  await page.waitForSelector(entryOf(test.id), { timeout: 15_000 });
  await pressLeader(page, "]");
  await page.waitForFunction(landedOn, test.id, { timeout: 5_000 }).catch(() => {
    throw new Error("leader ] did not walk from the file to the test");
  });
  const chain = await page.textContent(".kw-yard-crumb");
  expect(chain?.split(" → ").length === 3, `the hub head reads "${chain}", not a chain of three`);
  shots.push(await trailShot(page, "3-test-from-the-file.png"));

  await pressLeader(page, "y");
  for (let walked = 0; walked < 3 && !(await railCursorOn(page, diff.id)); walked += 1) {
    await page.keyboard.press("[");
  }
  expect(
    await railCursorOn(page, diff.id),
    "[ on the rail never reached the diff the plot grew from",
  );
  await page.keyboard.press("x");
  const plot = await page.waitForSelector(".kw-yard-card[data-plot]", { timeout: 15_000 });
  await page.waitForSelector(entryOf(test.id), { state: "detached", timeout: 15_000 });
  const plotTitle = await plot.$eval(".kw-yard-card-title", (title) => title.textContent);
  expect(plotTitle === chain, `the plot card reads "${plotTitle}", not "${chain}"`);
  shots.push(await trailShot(page, "4-the-plot-folded.png"));

  await pressLeader(page, "y");
  for (let moved = 0; moved < 8 && !(await railCursorOnPlot(page)); moved += 1) {
    await page.keyboard.press("j");
  }
  await page.keyboard.press("Enter");
  await page.waitForSelector(entryOf(test.id), { timeout: 15_000 }).catch(async () => {
    const said = await page.textContent(".kw-status-notice").catch(() => null);
    const rail = await page.evaluate(railReading);
    throw new Error(`Enter on the plot card restored nothing: the console said "${said}"; ${rail}`);
  });
  await page.waitForSelector(entryOf(file.id), { timeout: 15_000 });
  const restored = await page.evaluate(drawnAs, [file.id, test.id]);
  shots.push(await trailShot(page, "5-the-plot-restored.png"));
  return `"${changeTitle}" unfolded without taking focus; ${sumPath} opened from it and ${sumTestPath} from that, each keeper-origin with from; leader ] walked to the test and the hub head read "${chain}"; x on the seed folded the plot into one card of that name; Enter restored it (${restored}); shots ${shots.join(", ")}`;
}

async function approveWrite(page, path) {
  await page.waitForSelector("fieldset.kw-ask", { timeout: 60_000 }).catch(() => {
    throw new Error(`no ask arrived for the write to ${path}`);
  });
  const call = await page.getAttribute("fieldset.kw-ask", "data-call-id");
  await page.keyboard.press("Control+y");
  await page.waitForSelector(`fieldset.kw-ask[data-call-id="${call}"]`, {
    state: "detached",
    timeout: 30_000,
  });
}

async function settingOut(page, matches, timeout) {
  return until(page, async () => (await served(page, "/show")).settings.find(matches), timeout);
}

function expectOpenedFrom(setting, parent) {
  expect(
    setting.origin === "keeper" && setting.from === parent.id,
    `${setting.what.ref} came out ${setting.origin} from ${setting.from}, not keeper from ${parent.id}`,
  );
}

function panelOf(id) {
  return `.kw-yard-satellite[data-setting="${id}"]`;
}

async function pressLeader(page, key) {
  await page.keyboard.press("Control+k");
  await page.keyboard.press(key);
}

async function railCursorOn(page, id) {
  return page.evaluate((wanted) => {
    const rail = document.querySelector(".kw-yard-rail");
    return rail?.getAttribute("aria-activedescendant") === `kw-yard-entry-${wanted}`;
  }, id);
}

async function railCursorOnPlot(page) {
  return page.evaluate(
    () => document.querySelector(".kw-yard-card[data-plot][data-cursor]") !== null,
  );
}

async function trailShot(page, name) {
  const path = join(trailShots, name);
  await page.screenshot({ path });
  return path;
}

function focusOutsideTheYard() {
  return document.activeElement?.closest(".kw-yard-satellite, .kw-yard-rail") == null;
}

function panelReading(id) {
  const panel = document.querySelector(`.kw-yard-satellite[data-setting="${id}"]`);
  const pane = panel?.querySelector(".kw-diff")?.getAttribute("aria-label");
  const focus = document.activeElement;
  return `pane "${pane}", focus on ${focus?.tagName}.${focus?.className} inside the panel: ${panel?.contains(focus)}, size ${panel?.getAttribute("data-size")}`;
}

function railReading() {
  const cards = [...document.querySelectorAll(".kw-yard-card")].map(
    (card) =>
      `${card.querySelector(".kw-yard-card-title")?.textContent}${card.hasAttribute("data-cursor") ? " (cursor)" : ""}`,
  );
  const focus = document.activeElement;
  return `rail cards [${cards.join(" | ")}], focus on ${focus?.tagName}.${focus?.className}`;
}

function panelHoldingFocus() {
  return (
    document.activeElement?.closest(".kw-yard-satellite")?.getAttribute("data-setting") ??
    "nothing in the yard"
  );
}

function entryOf(id) {
  return `[id="kw-yard-entry-${id}"]`;
}

function landedOn(id) {
  const rail = document.querySelector(".kw-yard-rail");
  const onRail =
    document.activeElement === rail &&
    rail?.getAttribute("aria-activedescendant") === `kw-yard-entry-${id}`;
  const panel = document.activeElement?.closest(".kw-yard-satellite")?.getAttribute("data-setting");
  return onRail || panel === id;
}

function drawnAs(ids) {
  return ids
    .map((id) => {
      const entry = document.getElementById(`kw-yard-entry-${id}`);
      const where = entry?.classList.contains("kw-yard-satellite") ? "panel" : "card";
      return `${id} as a ${where}${entry?.getAttribute("data-size") ? ` (${entry.getAttribute("data-size")})` : ""}`;
    })
    .join(", ");
}

async function openChores(page) {
  await page.keyboard.press("Control+p");
  await page.keyboard.type("/chores", { delay: 5 });
  await page.keyboard.press("Enter");
  await page.waitForSelector("button:has-text('+ new chore')", { timeout: 15_000 });
}

async function addChore(page, chore) {
  await page.click("button:has-text('+ new chore')");
  const form = page.locator("form.kw-chores-form");
  await form.getByLabel("title", { exact: true }).fill(chore.title);
  await form.getByLabel("instructions", { exact: true }).fill(chore.instructions);
  await form.getByLabel("by hand", { exact: true }).check();
  await form.getByLabel(chore.tools, { exact: true }).check();
  await form.getByRole("button", { name: "save", exact: true }).click();
  await form.waitFor({ state: "detached", timeout: 15_000 });
  const id = await until(page, async () => {
    const listed = await served(page, `/creatures/${await creatureSlug(page)}/routines`);
    return routinesOf(listed).find((row) => titleOfRow(row) === chore.title)?.id;
  });
  return id;
}

async function runChore(page, title) {
  await page.getByText(title, { exact: true }).first().click();
  await page.keyboard.press("Enter");
  const offered = await page
    .waitForFunction(() => /run it now with (\S+)/.exec(document.body.innerText)?.[1], null, {
      timeout: 15_000,
    })
    .catch(() => undefined);
  const chord = await offered?.jsonValue();
  expect(chord !== undefined, `the chores pane offers no run chord for ${title}`);
  await page.keyboard.press(chord);
}

async function backToChores(page) {
  await page.locator(".kw-ov-head button.kw-ov-new").first().click();
  await page.waitForSelector("button:has-text('+ new chore')", { timeout: 15_000 });
}

function titleOfRow(row) {
  return row.routine?.title ?? row.file?.title ?? row.title;
}

async function creatureSlug(page) {
  const creatures = await served(page, "/creatures");
  return creatures.creatures[0].slug;
}

function runsOf(reading) {
  return Array.isArray(reading) ? reading : (reading.runs ?? []);
}

function routinesOf(reading) {
  return Array.isArray(reading) ? reading : (reading.routines ?? []);
}

function needItems(reading) {
  if (Array.isArray(reading)) return reading;
  return reading.items ?? reading.needs ?? [];
}

async function until(page, probe, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const seen = await probe();
      if (seen !== undefined) return seen;
    } catch (error) {
      last = error;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`waited ${timeout} ms${last === undefined ? "" : `: ${messageOf(last)}`}`);
}

async function served(page, path) {
  const answer = await page.evaluate(
    async ({ workspace, path }) => {
      const head = await window.keyworkHost.serverFetch(workspace, path, {
        method: "GET",
        headers: {},
      });
      let text = "";
      for (let chunk = await head.read(); chunk !== undefined; chunk = await head.read()) {
        text += new TextDecoder().decode(chunk);
      }
      return { status: head.status, text };
    },
    { workspace: openedFolder, path },
  );
  if (answer.status !== 200)
    throw new Error(`GET ${path} answered ${answer.status} ${answer.text}`);
  return JSON.parse(answer.text);
}

function firstFrame() {
  const frames = [...document.querySelectorAll(".kw-frame")];
  const focused = frames.find((frame) => frame.hasAttribute("data-focused"));
  const stead = document.querySelector(".kw-stead");
  return {
    focused: focused?.querySelector(".kw-frame-name")?.textContent ?? null,
    composer: document.querySelector("[aria-label=prompt]") !== null,
    onStead: stead?.querySelector(".kw-onboard") !== null && stead !== null,
  };
}

function currentOnboardingStep() {
  const card = document.querySelector(".kw-onboard");
  return {
    step: card?.querySelector(".kw-onboard-step[data-current]")?.textContent?.trim() ?? null,
    lines: [...(card?.querySelectorAll(".kw-onboard-line, .kw-onboard-ask") ?? [])].map(
      (line) => line.textContent ?? "",
    ),
  };
}

function onboardingLines() {
  const card = document.querySelector(".kw-onboard");
  return [...(card?.querySelectorAll(".kw-onboard-line, .kw-onboard-ask") ?? [])].map(
    (line) => line.textContent ?? "",
  );
}

function askSeen() {
  const card = document.querySelector("fieldset.kw-ask");
  return {
    why: card?.querySelector(".kw-ask-why")?.textContent ?? "",
    focused: card?.contains(document.activeElement) ?? false,
  };
}

function porchSeen() {
  const stead = document.querySelector(".kw-stead");
  const head = stead?.querySelector(".kw-ov-head-lead")?.textContent ?? "";
  return {
    stead: stead !== null,
    bubble: stead?.querySelector(".kw-stead-bubble-line")?.textContent ?? null,
    count: /\d+ needs? you/.exec(head)?.[0] ?? null,
  };
}

function porchHolds() {
  const stead = document.querySelector(".kw-stead");
  const head = stead?.querySelector(".kw-ov-head-lead")?.textContent ?? "";
  return (
    stead !== null &&
    stead.querySelector(".kw-stead-bubble") !== null &&
    /\d+ needs? you/.test(head)
  );
}

function porchClear() {
  const stead = document.querySelector(".kw-stead");
  const head = stead?.querySelector(".kw-ov-head-lead")?.textContent ?? "";
  return (
    stead !== null &&
    stead.querySelector(".kw-stead-bubble") === null &&
    !/\d+ needs? you/.test(head)
  );
}

function lastAssistantText(session) {
  const reply = [...(session.messages ?? [])]
    .reverse()
    .find((message) => message.role === "assistant");
  return reply?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function expect(holds, failure) {
  if (!holds) throw new Error(failure);
}

function scratchFolder() {
  const root = mkdtempSync(join(tmpdir(), "stead-first-light-"));
  const scratch = {
    root,
    workspace: join(root, "first-light"),
    home: join(root, "home"),
    userData: join(root, "user-data"),
    engineLog: join(root, "engine.log"),
    report: join(root, "report.json"),
  };
  for (const folder of [scratch.workspace, scratch.home, scratch.userData]) mkdirSync(folder);
  for (const known of ["Roaming", "Local"]) {
    mkdirSync(join(scratch.home, "AppData", known), { recursive: true });
  }
  scratch.launcher = engineLauncher(root);
  openedFolder = scratch.workspace;
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
    ...process.env,
    USERPROFILE: scratch.home,
    HOME: scratch.home,
    KEYWORK_BIN: scratch.launcher,
    FIRST_LIGHT_LOG: scratch.engineLog,
  };
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
    args: [".", `--user-data-dir=${scratch.userData}`, scratch.workspace],
    cwd: desktopRoot,
    env: scratchEnv(scratch),
    timeout: 60_000,
  });
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
  return unfinished;
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

function reportOf(scratch, outcomes, seconds, unfinished) {
  const engine = engineLines(scratch);
  return {
    seconds,
    scratch: scratch.root,
    steps: outcomes.map(({ run: _run, ...outcome }) => outcome),
    unfinished,
    engine: {
      turns: engine.filter((line) => line.turn !== undefined).map((line) => line.turn),
      refusedFetches: engine.filter((line) => line.refusedFetch).map((line) => line.refusedFetch),
      refusedProviders: engine
        .filter((line) => line.refusedProvider)
        .map((line) => line.refusedProvider),
    },
  };
}

function printTable(report) {
  const seen = new Set(report.steps.map((step) => step.id));
  const rows = [
    ...report.steps,
    ...steps
      .filter((step) => !seen.has(step.id))
      .map((step) => ({ ...step, verdict: "not reached" })),
  ];
  for (const row of rows) {
    const time = row.seconds === undefined ? "" : ` ${row.seconds}s`;
    const detail = row.observed ?? row.failure ?? "";
    console.log(`step ${row.id} · ${row.name} · ${row.verdict}${time} · ${detail}`);
    if (row.screenshot !== undefined) console.log(`  screenshot ${row.screenshot}`);
  }
  for (const left of report.unfinished) console.log(`cleanup did not finish · ${left}`);
  console.log(
    `${report.engine.turns.length} scripted turns (${report.engine.turns.join(", ")}) · ${report.engine.refusedFetches.length} fetches refused · ${report.engine.refusedProviders.length} other providers refused · ${report.seconds}s`,
  );
  console.log(`report ${join(report.scratch, "report.json")}`);
}

async function screenText(page) {
  return page.evaluate(() => document.body.innerText.slice(0, 2_000)).catch(() => "");
}

function secondsSince(at) {
  return Math.round((Date.now() - at) / 100) / 10;
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
