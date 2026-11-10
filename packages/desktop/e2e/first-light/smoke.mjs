// First-light smoke: the built console (packages/desktop/out) driven by Playwright with no human
// and no tokens, one scenario per console launch, each in the product profile its expectations
// are written for. The console starts the scripted engine (scripted-engine.mjs: keywork's own CLI
// from the sibling checkout with one scripted provider) on a scratch folder under the OS temp dir,
// trusted from inside before the launch and untrusted after. The engine and the trust keep their
// state in a scratch home beside the folder, so ~/.keywork is never read or written. The driver
// types only what the screen offers a new keeper: the first-run lessons and the keys overlay they
// point to, the onboarding card's own keys, a request in the conversation, `y` on the ask, the
// chores pane's buttons and the chord it prints.
//
//   bun run --cwd packages/desktop build      (once: the smoke runs packages/desktop/out)
//   bun run smoke:first-light [--keep] [--first-light] [--trail] [--stead] [--creature]
//
// Scenarios, all four unless flags pick some:
//   first-light  keywork profile, runbook steps 1 to 3 as keywork-app's own build shows them: the
//                keywork first frame, a creature made from the keys the console teaches and
//                introduced, a turn that asks and delivers. The stead profile's first frame is
//                proved by Stead's own harness.
//   trail        keywork profile, the yard one chord from tiles: a session's model sets out a diff,
//                the keeper opens a file from it and, pressing the file's text, a test from the
//                file; the plot folds as one card and restores; every stage is shot into
//                artifacts/e2e/trail.
//   stead        stead profile, started exactly as Stead's entry starts it but from this build: a
//                project the engine refuses for want of a model says so in the yard; then step 4
//                at home, where this profile keeps a creature's chores on screen (/chores): a
//                creature made through the card its first frame shows, a read-only chore that
//                completes and a write chore that parks.
//   creature     stead profile, started at home with no project: the creature's model sets out a
//                note with a rung and a size and it opens beside the hub; the keeper dismisses it
//                from the rail by key and the model's next request hears that; the model lists
//                what is out and takes a second setting back; every stage is shot into
//                artifacts/e2e/stead/creature.
//
// Prints one line per step and exits 0 when every step is observed. The first regressed step
// stops its scenario: its name, the check that failed and a screenshot beside report.json in the
// scenario's scratch folder, which is then kept; exit 1. --keep keeps the folders after a pass.
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
import { pathToFileURL } from "node:url";
import {
  changeTitle,
  delivered,
  firstRequest,
  firstTitle,
  introduction,
  notePath,
  secondRequest,
  secondTitle,
  setOut,
  sumPath,
  sumTestPath,
  takeBackRequest,
  trailRequest,
  yardNoteOpening,
} from "./scripted-engine.mjs";

const desktopRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(desktopRoot, "../..");
const keyworkRepo = resolve(process.env.KEYWORK_REPO ?? join(repoRoot, "..", "keywork"));
const keyworkCli = join(keyworkRepo, "packages", "cli", "src", "main.ts");
const scriptedEngine = join(import.meta.dirname, "scripted-engine.mjs");
const builtMain = join(desktopRoot, "out", "main", "index.js");
const builtRuntime = join(desktopRoot, "out", "main", "runtime.js");
const requireFromUi = createRequire(join(repoRoot, "packages", "ui", "package.json"));
const { _electron: electron } = requireFromUi("@playwright/test");
const requireFromDesktop = createRequire(join(desktopRoot, "package.json"));
const electronBinary = requireFromDesktop("electron");

const scenarios = [
  {
    id: "first-light",
    profile: "keywork",
    steps: [
      { id: "1", name: "the keywork first frame, a conversation and its five keys", run: stepOne },
      { id: "2", name: "a creature made from the keys the console teaches", run: stepTwo },
      { id: "3", name: "one turn writes a file, asks, delivers", run: stepThree },
    ],
  },
  {
    id: "trail",
    profile: "keywork",
    steps: [
      {
        id: "trail",
        name: "a diff set out, a file and a test opened from it, the plot folds and restores",
        run: stepTrail,
      },
    ],
  },
  {
    id: "stead",
    profile: "stead",
    keylessFolder: true,
    steps: [
      {
        id: "keyless",
        name: "a project the engine refuses for want of a model says so in the yard",
        run: stepKeyless,
      },
      {
        id: "4",
        name: "at home, a read-only chore completes and a write chore parks",
        run: stepHomeChores,
      },
    ],
  },
  {
    id: "creature",
    profile: "stead",
    atHome: true,
    steps: [
      {
        id: "out",
        name: "the creature's model sets out a note at a size and it opens beside the hub",
        run: stepCreatureSetsOut,
      },
      {
        id: "dismissed",
        name: "the keeper dismisses it by key and the model's next request hears that",
        run: stepKeeperDismisses,
      },
      {
        id: "taken-back",
        name: "the model lists what is out and takes the second setting back",
        run: stepModelTakesBack,
      },
    ],
  },
];
const picked = scenarios.filter((scenario) => process.argv.includes(`--${scenario.id}`));
const chosen = picked.length === 0 ? scenarios : picked;
const trailShots = join(repoRoot, "artifacts", "e2e", "trail");
const steadShots = join(repoRoot, "artifacts", "e2e", "stead");
const creatureShots = join(steadShots, "creature");

const readOnlyChore = {
  title: "look around",
  instructions: "say in one line what this folder holds",
};
const writeChore = {
  title: "stamp a note",
  instructions: "stamp today's date into notes/stamp.md",
};
const keeperRequest = `write a short note about this folder to ${notePath}`;
const needsYouLetsGoMs = 5_000;
const consoleLinesKept = 30;
const hostAnswersWithinMs = 45_000;
const presentedConversation = ".kw-stead-presented[data-keywork-pane-kind=conversation]";
const readableFloor = { width: 480, height: 320 };
const railAndItsGaps = 296;
let openedFolder;

if (!existsSync(builtMain) || !existsSync(builtRuntime)) {
  console.error(`no built console at ${builtMain}`);
  console.error("build it first: bun run --cwd packages/desktop build");
  process.exit(2);
}
process.exitCode = await smoke(process.argv.includes("--keep"));

async function smoke(keep) {
  let failed = false;
  for (const scenario of chosen) {
    const report = await runScenario(scenario);
    const regressed = report.steps.some((step) => step.verdict !== "observed");
    failed ||= regressed;
    printTable(scenario, report);
    if (regressed || keep) console.log(`scratch folder kept: ${report.scratch}`);
    else rmSync(report.scratch, { recursive: true, force: true });
  }
  return failed ? 1 : 0;
}

async function runScenario(scenario) {
  const scratch = scratchFolder(scenario);
  const started = Date.now();
  const outcomes = [];
  let app;
  let unfinished = [];
  try {
    if (scenario.profile === "keywork") trust(scratch, "trust");
    app = await launch(scratch, scenario);
    const said = whatTheConsoleSays(app);
    const page = await consoleWindow(app);
    await expectProfile(page, scenario.profile);
    const creatureHome = creatureHomeOf(scratch);
    const world = { scratch, app, page, said, creatureHome };
    for (const step of scenario.steps) {
      const at = Date.now();
      try {
        const observed = await step.run(world);
        outcomes.push({ ...step, verdict: "observed", seconds: secondsSince(at), observed });
      } catch (error) {
        const shot = join(scratch.root, `step-${step.id}.png`);
        await world.page.screenshot({ path: shot }).catch(() => undefined);
        outcomes.push({
          ...step,
          verdict: "regressed",
          seconds: secondsSince(at),
          failure: messageOf(error),
          screenshot: shot,
          screen: await screenText(world.page),
          console: world.said.slice(-consoleLinesKept),
        });
        break;
      }
    }
  } catch (error) {
    outcomes.push({ id: "-", name: "launch", verdict: "regressed", failure: messageOf(error) });
  } finally {
    unfinished = await cleanUp(scratch, app, scenario);
  }
  const report = reportOf(scenario, scratch, outcomes, secondsSince(started), unfinished);
  writeFileSync(scratch.report, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function expectProfile(page, profile) {
  await page.waitForFunction(() => window.keyworkHost !== undefined, null, { timeout: 60_000 });
  const product = await page.evaluate(() => window.keyworkHost.productId ?? "keywork");
  expect(
    product === profile,
    `the console started the ${product} profile; this scenario's steps expect ${profile}`,
  );
}

async function stepOne(world) {
  const { page } = world;
  await page.waitForSelector("[aria-label=prompt]", { timeout: 120_000 });
  await page.waitForSelector(".kw-first-run", { timeout: 30_000 });
  const first = await page.evaluate(keyworkFirstFrame);
  expect(first.mode === "tiles", `the first frame is laid out as ${first.mode}, not tiles`);
  expect(
    first.focused !== null && first.composerInFocus,
    `the focused frame is ${first.focused ?? "nothing"}, with no composer in it`,
  );
  expect(!first.stead, "the stead is in the keywork first frame");
  expect(
    first.frames.includes("sessions"),
    `no sessions pane beside it: ${first.frames.join(", ")}`,
  );
  expect(
    first.lessons.length === 5,
    `the first run teaches ${first.lessons.length} keys, not five: ${lessonWords(first.lessons)}`,
  );
  expect(first.status.startsWith("keywork"), `the status line reads "${first.status}"`);
  world.lessons = first.lessons;
  return `${first.frames.join(" and ")} in tiles, "${first.focused}" focused with its composer; five keys taught (${lessonWords(first.lessons)}); the status line reads "${first.status}"`;
}

async function stepTwo(world) {
  const { page } = world;
  const help = world.lessons.find((lesson) => lesson.does === "shows every key");
  expect(help !== undefined, "no first-run lesson shows every key");
  await pressChord(page, help.chord);
  await page.waitForSelector(".kw-help", { timeout: 10_000 });
  const make = await page.evaluate(helpRowFor, "make a creature");
  expect(make !== null, "the keys overlay names no chord that makes a creature");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".kw-help", { state: "detached" });
  const chord = make.keys.split(" · ")[0];
  await pressChord(page, chord);
  await page.waitForSelector(".kw-stead .kw-onboard[data-phase=step]", { timeout: 90_000 });
  const cardLines = await walkTheOnboardingCard(page);
  await page.waitForSelector(presentedConversation, { timeout: 60_000 }).catch(async () => {
    throw new Error(`the stead never presented the creature's thread: ${await screenText(page)}`);
  });
  const creatures = await served(page, "/creatures", world.creatureHome);
  expect(creatures.creatures?.length === 1, `GET /creatures lists ${creatures.creatures?.length}`);
  const creature = creatures.creatures[0];
  world.creature = creature.slug;
  const detail = await served(page, `/creatures/${creature.slug}`, world.creatureHome);
  world.conversation = detail.conversation;
  const introduced = await until(page, async () => {
    const session = await served(page, `/sessions/${world.conversation}`, world.creatureHome);
    return lastAssistantText(session) === introduction ? session : undefined;
  });
  const frame = introduced.reports?.find((report) => report.kind === "frame");
  expect(frame !== undefined, "the introduction has no frame under reports");
  expect(
    !introduced.messages.slice(0, frame.index).some((message) => message.role === "tool"),
    "a tool ran before the creature's first words",
  );
  await page
    .waitForFunction(presentedSays, introduction.split(".")[0], { timeout: 30_000 })
    .catch(() => {
      throw new Error("the creature's first words never reached the thread the stead presents");
    });
  return `${help.chord} showed every key and ${chord} made a creature on the stead; ${creature.name} (${creature.slug}) made in the creature home through ${cardLines.length} card lines; its thread presented in the stead pane, introduced in ${wordCount(introduction)} words after a frame`;
}

async function stepThree(world) {
  const { page } = world;
  await page.click(`${presentedConversation} [aria-label=prompt]`);
  await page.keyboard.type(keeperRequest, { delay: 5 });
  await page.keyboard.press("Enter");
  await page.waitForSelector("fieldset.kw-ask", { timeout: 60_000 });
  const ask = await page.evaluate(askSeen);
  const held = await needsYouHolding(page, notePath);
  if (!ask.focused) await page.click("fieldset.kw-ask");
  await page.keyboard.press("y");
  await page
    .waitForSelector("fieldset.kw-ask", { state: "detached", timeout: 30_000 })
    .catch(() => {
      throw new Error(`y left the ask unanswered: "${ask.why}" still waits on its card`);
    });
  const letGo = await needsYouLettingGo(page, "once y answered it in the conversation");
  const written = join(world.creatureHome, notePath);
  const session = await until(page, async () => {
    const reading = await served(page, `/sessions/${world.conversation}`, world.creatureHome);
    return reading.reports?.some((report) => report.text === delivered) ? reading : undefined;
  });
  expect(existsSync(written), `${notePath} is not in the creature's home`);
  const report = session.reports.find((line) => line.text === delivered);
  expect(
    report.index === session.messages.length,
    `a reply turn follows the delivered line (index ${report.index} of ${session.messages.length})`,
  );
  expect(report.origin?.kind === "creature", "the delivered line carries no creature origin");
  await needsYouLettingGo(page, "after the turn delivered");
  return `asked ${ask.why}; the needs-you strip held "${held}"; y answered it ${ask.focused ? "with the card focused" : "after a click"}; the strip let go in ${letGo}s and stayed clear; ${notePath} written in the creature's home; delivered "${delivered}" at reports index ${report.index}`;
}

async function needsYouHolding(page, path) {
  const held = await page
    .waitForFunction(needsYouReads, `ask: write ${path}`, { timeout: needsYouLetsGoMs })
    .then(
      () => true,
      () => false,
    );
  const strip = await page.evaluate(needsYouLine);
  expect(held, `the needs-you strip never held the waiting ask: ${strip ?? "no strip"}`);
  return strip;
}

async function needsYouLettingGo(page, when) {
  const at = Date.now();
  const cleared = await page
    .waitForFunction(() => document.querySelector(".kw-needs-you") === null, null, {
      timeout: needsYouLetsGoMs,
    })
    .then(
      () => true,
      () => false,
    );
  if (!cleared) {
    throw new Error(
      `the needs-you strip kept the answered ask ${when}: "${await page.evaluate(needsYouLine)}" ${needsYouLetsGoMs / 1000} s on`,
    );
  }
  return secondsSince(at);
}

async function stepFour(world) {
  const { page } = world;
  await openChores(page);
  const lookAround = await addChore(world, { ...readOnlyChore, tools: "read-only" });
  await runChore(page, readOnlyChore.title);
  const completed = await until(page, async () => {
    const runs = await served(
      page,
      `/creatures/${world.creature}/routines/${lookAround}/runs`,
      world.creatureHome,
    );
    return runsOf(runs).find((run) => run.process === "completed");
  });
  await backToChores(page);
  const stamp = await addChore(world, { ...writeChore, tools: "write" });
  await runChore(page, writeChore.title);
  const parked = await until(page, async () => {
    const runs = await served(
      page,
      `/creatures/${world.creature}/routines/${stamp}/runs`,
      world.creatureHome,
    );
    return runsOf(runs).find((run) => run.status === "parked");
  });
  expect(parked.sessionId === null, `the parked run holds session ${parked.sessionId}`);
  const needs = await until(page, async () => {
    const reading = await served(page, "/routines/needs-you", world.creatureHome);
    const items = needItems(reading);
    return items.length > 0 ? items : undefined;
  });
  expect(needs.length === 1, `${needs.length} needs-you items, not one`);
  await backToChores(page);
  await page.waitForFunction(() => /2 chores · 1 needs you/.test(document.body.innerText));
  return `${readOnlyChore.title}: run ${completed.process}; ${writeChore.title}: ${parked.status}, no session, ${needs.length} needs-you item (${needs[0].kind}), pane reads 2 chores · 1 needs you`;
}

async function stepHomeChores(world) {
  const { page } = world;
  await page.click(".kw-open-failure-card button:has-text('dismiss')");
  await page.waitForSelector(".kw-open-failure-card", { state: "detached", timeout: 10_000 });
  await page.click(".kw-onboard[data-phase=step] input");
  await walkTheOnboardingCard(page);
  await page.waitForSelector(".kw-onboard[data-phase=made]", { timeout: 60_000 });
  const creatures = await served(page, "/creatures", world.creatureHome);
  expect(creatures.creatures?.length === 1, `GET /creatures lists ${creatures.creatures?.length}`);
  world.creature = creatures.creatures[0].slug;
  return stepFour(world);
}

async function walkTheOnboardingCard(page) {
  const cardLines = [];
  for (const step of ["name", "skin", "workshop", "models"]) {
    await page.waitForSelector(`.kw-onboard[data-phase=step] .kw-onboard-step[data-current]`);
    const current = await page.evaluate(currentOnboardingStep);
    expect(current.step === step, `onboarding is at ${current.step}, not ${step}`);
    expect(current.focused, `the onboarding card lost the keyboard at ${step}`);
    cardLines.push(...current.lines);
    await page.keyboard.press(step === "name" ? "1" : "Enter");
    await page.waitForFunction(
      (left) =>
        document.querySelector(".kw-onboard-step[data-current]")?.textContent?.trim() !== left ||
        document.querySelector(".kw-onboard[data-phase=step]") === null,
      current.step,
    );
  }
  return cardLines;
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
  await page.click(`${panelOf(diff.id)} .cm-content`);
  const diffHeld = await page.evaluate(panelHoldingFocus);
  expect(diffHeld === diff.id, `a press on the diff's text left focus in ${diffHeld}`);
  await page.click(`${panelOf(diff.id)} button.kw-diff-show`);
  const file = await settingOut(page, (setting) => setting.what.ref === sumPath);
  expectOpenedFrom(file, diff);
  const fileReached = await panelReached(page, file);
  shots.push(await trailShot(page, "2-file-from-the-diff.png"));

  await page.click(`${panelOf(file.id)} .cm-content`);
  const fileHeld = await page.evaluate(panelHoldingFocus);
  expect(fileHeld === file.id, `a press on the file's text left focus in ${fileHeld}`);
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
  await pressLeader(page, "Shift+]");
  await page.waitForFunction(landedOn, test.id, { timeout: 5_000 }).catch(() => {
    throw new Error("leader shift+] did not walk from the file to the test");
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
  return `"${changeTitle}" unfolded without taking focus and kept the keyboard when its text was pressed; ${sumPath} opened from it, reached as ${fileReached}, and after a press on its text ${sumTestPath} opened from that through the palette, each keeper-origin with from; leader shift+] walked to the test and the hub head read "${chain}"; x on the seed folded the plot into one card of that name; Enter restored it (${restored}); shots ${shots.join(", ")}`;
}

async function stepKeyless(world) {
  const { page, scratch } = world;
  mkdirSync(steadShots, { recursive: true });
  await page.waitForSelector(".kw-yard[data-mode='yard'] .kw-stead", { timeout: 120_000 });
  const card = await page
    .waitForSelector(".kw-workspace .kw-open-failure-card", { timeout: 60_000 })
    .catch(async () => {
      const refused = engineLines(scratch).some((line) => line.keyless !== undefined);
      const answer = await page.evaluate(hostAnswerFor, {
        path: scratch.workspace,
        within: hostAnswersWithinMs,
      });
      throw new Error(
        `the yard never said the project did not open (the engine ${refused ? "refused it" : "was never asked for it"}; asked again, the host ${answer}): ${await screenText(page)}`,
      );
    });
  const seen = await card.evaluate(failureCardReading);
  expect(seen.inYard, "the failure card is not in the yard's workspace");
  expect(seen.head === "keyless did not open", `the card's head reads "${seen.head}"`);
  expect(seen.line === "no model is connected", `the card's reason reads "${seen.line}"`);
  expect(/^connect a model\b/.test(seen.fix), `the card's fix reads "${seen.fix}"`);
  expect(
    seen.actions.includes("connect a model"),
    `the card offers ${seen.actions.join(", ")}, not connect a model`,
  );
  expect(!/inference provider/.test(seen.text), `the card speaks the engine's words: ${seen.text}`);
  const shot = join(steadShots, "keyless-in-the-yard.png");
  await page.screenshot({ path: shot });
  return `the engine refused ${scratch.workspace}; the yard reads "${seen.head} · ${seen.line} · ${seen.fix}" and offers ${seen.actions.join(", ")}; shot ${shot}`;
}

async function stepCreatureSetsOut(world) {
  const { page } = world;
  mkdirSync(creatureShots, { recursive: true });
  await page.waitForSelector(".kw-yard[data-mode='yard'] .kw-stead", { timeout: 120_000 });
  await page.click(".kw-onboard[data-phase=step] input");
  await walkTheOnboardingCard(page);
  await page.waitForSelector(".kw-onboard[data-phase=made]", { timeout: 60_000 });
  await page.keyboard.press("Enter");
  await page.waitForSelector(".kw-onboard", { state: "detached", timeout: 10_000 });
  const creatures = await until(page, async () => {
    const listed = await served(page, "/creatures");
    return listed.creatures?.length === 1 ? listed.creatures : undefined;
  });
  const detail = await served(page, `/creatures/${creatures[0].slug}`);
  world.conversation = detail.conversation;
  await until(page, async () => {
    const session = await served(page, `/sessions/${world.conversation}`);
    return lastAssistantText(session) === introduction ? session : undefined;
  });
  await keeperSays(page, firstRequest);
  const first = await settingOut(page, (setting) => setting.what.title === firstTitle);
  expect(
    first.rung === "unfold" && first.size === "working" && first.origin === "creature",
    `the setting came out ${first.rung}, ${first.size}, from ${first.origin}`,
  );
  await page.waitForSelector(panelOf(first.id), { timeout: 30_000 }).catch(async () => {
    throw new Error(`the note never unfolded: ${await theYardsOwnWords(page)}`);
  });
  const seen = await panelAtRest(page, first.id);
  expect(seen.rung === "unfold", `the panel is drawn at ${seen.rung}`);
  expect(seen.size === "working", `the panel opened ${seen.size}, not working`);
  expect(seen.besideHub, `the panel at ${seen.panelAt} is not beside the hub at ${seen.hubAt}`);
  expect(
    seen.width >= readableFloor.width && seen.height >= readableFloor.height,
    `the panel is only ${seen.width} by ${seen.height}`,
  );
  expect(!seen.tookFocus, "the panel took the keeper's focus when it opened");
  world.first = first;
  const shot = await creatureShot(page, "1-set-out-working.png");
  return `"${firstTitle}" came out rung ${first.rung}, size ${first.size}; drawn working at ${seen.panelAt} beside the hub at ${seen.hubAt}, ${seen.distance} px from it, focus left with the keeper; shot ${shot}`;
}

async function stepKeeperDismisses(world) {
  const { page, scratch, first } = world;
  await pressLeader(page, "y");
  for (let moved = 0; moved < 8 && !(await railCursorOn(page, first.id)); moved += 1) {
    await page.keyboard.press("j");
  }
  expect(await railCursorOn(page, first.id), "the rail cursor never reached the note");
  await page.keyboard.press("x");
  await page
    .waitForSelector(panelOf(first.id), { state: "detached", timeout: 15_000 })
    .catch(async () => {
      throw new Error(`x left the note out: ${await page.evaluate(railReading)}`);
    });
  await settingGone(page, first.id);
  const shots = [await creatureShot(page, "2-dismissed.png")];
  await page.keyboard.press("Escape");
  await keeperSays(page, secondRequest);
  const second = await settingOut(page, (setting) => setting.what.title === secondTitle);
  const heard = await turnLogged(world, "yard-second-show");
  expect(heard.note?.includes(yardNoteOpening), `the next request carried no note: ${heard.note}`);
  expect(
    heard.note?.includes("the keeper dismissed it unread, and it has left the yard."),
    `the note does not say the keeper dismissed it: ${heard.note}`,
  );
  expect(heard.yardSection, "the next request's system prompt has no yard section");
  const opening = engineLines(scratch).find((line) => line.turn === "yard-first-show");
  expect(opening?.note === undefined, "the first request carried a note before anything settled");
  await page.waitForSelector(entryOf(second.id), { timeout: 30_000 }).catch(async () => {
    throw new Error(`the second note never reached the yard: ${await page.evaluate(railReading)}`);
  });
  world.second = second;
  shots.push(await creatureShot(page, "3-second-set-out.png"));
  return `leader y put the rail cursor on the note and x dismissed it; the next request opened "${firstLineOf(heard.note)}" and said the keeper dismissed it unread; its system prompt holds the yard section; shots ${shots.join(", ")}`;
}

async function stepModelTakesBack(world) {
  const { page, second } = world;
  await keeperSays(page, takeBackRequest);
  const listed = await turnLogged(world, "yard-withdraw");
  expect(
    listed.toolOutput?.startsWith("1 setting is out") && listed.toolOutput?.includes(second.id),
    `shown answered: ${listed.toolOutput}`,
  );
  await page
    .waitForSelector(entryOf(second.id), { state: "detached", timeout: 30_000 })
    .catch(async () => {
      throw new Error(`the second note stayed out: ${await page.evaluate(railReading)}`);
    });
  await settingGone(page, second.id);
  const closing = await turnLogged(world, "yard-said", world.second.id);
  expect(
    closing.toolOutput?.startsWith(`Withdrawn: ${second.id} has left the yard`),
    `withdraw answered: ${closing.toolOutput}`,
  );
  const shot = await creatureShot(page, "4-taken-back.png");
  return `shown listed one setting with ${second.id}; withdraw answered "${closing.toolOutput}"; its panel left the yard and GET /show no longer holds it; shot ${shot}`;
}

async function panelAtRest(page, id) {
  let last;
  return until(
    page,
    async () => {
      const seen = await page.evaluate(panelBesideTheHub, { id, reach: railAndItsGaps });
      const rested = seen.panelAt === last?.panelAt && seen.hubAt === last?.hubAt;
      last = seen;
      return rested ? seen : undefined;
    },
    10_000,
  );
}

async function keeperSays(page, words) {
  await page.click("[aria-label=prompt]");
  await page.keyboard.type(words, { delay: 5 });
  const typed = await page.evaluate(composerReading);
  expect(
    typed.text.includes(words),
    `the words never reached the composer: ${JSON.stringify(typed)}`,
  );
  await page.keyboard.press("Enter");
}

async function theYardsOwnWords(page) {
  const rail = await page.evaluate(railReading);
  await page.click(".kw-yard-rail-head");
  const log = await page.locator(".kw-yard-decisions li").allTextContents();
  await page.click(".kw-yard-rail-head");
  return `${rail}; the yard's decisions: ${log.join(" | ")}`;
}

function composerReading() {
  const composers = [...document.querySelectorAll("[aria-label=prompt]")];
  const focus = document.activeElement;
  return {
    count: composers.length,
    text: composers.map((composer) => composer.value ?? composer.textContent ?? "").join(" | "),
    focus: `${focus?.tagName}.${focus?.className}`,
  };
}

async function settingGone(page, id) {
  await until(page, async () => {
    const out = await served(page, "/show");
    return out.settings.some((setting) => setting.id === id) ? undefined : true;
  });
}

async function turnLogged(world, kind, holding) {
  return until(world.page, async () =>
    engineLines(world.scratch)
      .filter((line) => line.turn === kind)
      .findLast((line) => holding === undefined || line.toolOutput?.includes(holding)),
  );
}

async function creatureShot(page, name) {
  const path = join(creatureShots, name);
  await page.screenshot({ path });
  return path;
}

function panelBesideTheHub({ id, reach }) {
  const panel = document.querySelector(`.kw-yard-satellite[data-setting="${id}"]`);
  const hub = document.querySelector(".kw-yard-hub");
  const placed = panel.getBoundingClientRect();
  const beside = hub.getBoundingClientRect();
  const round = (rect) =>
    `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
  const toTheRight = placed.left - beside.right;
  const toTheLeft = beside.left - placed.right;
  const distance = Math.round(Math.max(toTheRight, toTheLeft));
  const overlapsVertically = placed.top < beside.bottom && placed.bottom > beside.top;
  return {
    rung: panel.dataset.rung,
    size: panel.dataset.size,
    width: Math.round(placed.width),
    height: Math.round(placed.height),
    panelAt: round(placed),
    hubAt: round(beside),
    distance,
    besideHub: distance >= 0 && distance <= reach && overlapsVertically,
    tookFocus: panel.contains(document.activeElement),
  };
}

function firstLineOf(text) {
  return text.split("\n")[0];
}

async function hostAnswerFor({ path, within }) {
  const asked = Date.now();
  const silent = new Promise((resolve) => setTimeout(() => resolve(undefined), within));
  const answer = await Promise.race([window.keyworkHost.openWorkspace(path), silent]);
  const waited = `${Date.now() - asked} ms`;
  if (answer === undefined) return `gave no answer in ${waited}`;
  return `answered ${JSON.stringify(answer).slice(0, 300)} in ${waited}`;
}

function failureCardReading(card) {
  const text = (selector) => card.querySelector(selector)?.textContent ?? "";
  return {
    inYard: card.closest(".kw-workspace")?.querySelector(".kw-yard[data-mode='yard']") != null,
    head: text(".kw-open-failure-of"),
    line: text(".kw-open-failure"),
    fix: text(".kw-open-fix"),
    actions: [...card.querySelectorAll("button")].map((button) => button.textContent ?? ""),
    text: card.textContent ?? "",
  };
}

function presentedSays(words) {
  const presented = document.querySelector(
    ".kw-stead-presented[data-keywork-pane-kind=conversation]",
  );
  return presented?.textContent?.includes(words) === true;
}

async function pressChord(page, chord) {
  for (const stroke of chord.split(" ")) await page.keyboard.press(playwrightKeyOf(stroke));
}

function playwrightKeyOf(stroke) {
  const modifiers = { ctrl: "Control", shift: "Shift", alt: "Alt", meta: "Meta" };
  const parts = stroke.split("+");
  const key = parts.pop();
  const held = parts.map((part) => modifiers[part] ?? part);
  return [...held, key.length === 1 ? key : key.toUpperCase()].join("+");
}

function keyworkFirstFrame() {
  const frames = [...document.querySelectorAll(".kw-frame")];
  const focused = frames.find((frame) => frame.hasAttribute("data-focused"));
  return {
    mode: document.querySelector(".kw-yard")?.getAttribute("data-mode") ?? null,
    frames: frames.map((frame) => frame.querySelector(".kw-frame-name")?.textContent ?? ""),
    focused: focused?.querySelector(".kw-frame-name")?.textContent ?? null,
    composerInFocus:
      focused?.closest(".kw-slot")?.querySelector("[aria-label=prompt]") !== null &&
      focused !== undefined,
    stead: document.querySelector(".kw-stead") !== null,
    lessons: [...document.querySelectorAll(".kw-first-run-row")].map((row) => ({
      chord: row.querySelector(".kw-first-run-chord")?.textContent ?? "",
      does: row.querySelector(".kw-first-run-does")?.textContent ?? "",
    })),
    status: document.querySelector(".kw-status")?.innerText?.trim() ?? "",
  };
}

function helpRowFor(does) {
  const texts = [...document.querySelectorAll(".kw-help .kw-help-text")];
  const row = texts.find((text) => text.textContent?.startsWith(does));
  const keys = row?.previousElementSibling?.textContent;
  return row === undefined || keys == null ? null : { keys, help: row.textContent };
}

function lessonWords(lessons) {
  return lessons.map((lesson) => `${lesson.chord} ${lesson.does}`).join(" · ");
}

async function panelReached(page, setting) {
  const unfolded = await page.waitForSelector(panelOf(setting.id), { timeout: 5_000 }).then(
    () => true,
    () => false,
  );
  if (unfolded) return "a panel";
  await page.waitForSelector(entryOf(setting.id), { timeout: 15_000 });
  await pressLeader(page, "y");
  for (let moved = 0; moved < 8 && !(await railCursorOn(page, setting.id)); moved += 1) {
    await page.keyboard.press("j");
  }
  expect(await railCursorOn(page, setting.id), `the rail cursor never reached ${setting.what.ref}`);
  await page.keyboard.press("Enter");
  await page.waitForSelector(panelOf(setting.id), { timeout: 15_000 }).catch(async () => {
    throw new Error(
      `entering ${setting.what.ref} from the rail drew no panel: ${await page.evaluate(railReading)}`,
    );
  });
  return "a card on the rail, entered";
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

async function addChore(world, chore) {
  const { page } = world;
  await page.click("button:has-text('+ new chore')");
  const form = page.locator("form.kw-chores-form");
  await form.getByLabel("title", { exact: true }).fill(chore.title);
  await form.getByLabel("instructions", { exact: true }).fill(chore.instructions);
  await form.getByLabel("by hand", { exact: true }).check();
  await form.getByLabel(chore.tools, { exact: true }).check();
  await form.getByRole("button", { name: "save", exact: true }).click();
  await form.waitFor({ state: "detached", timeout: 15_000 });
  const id = await until(page, async () => {
    const listed = await served(page, `/creatures/${world.creature}/routines`, world.creatureHome);
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

async function served(page, path, workspace = openedFolder) {
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
    { workspace, path },
  );
  if (answer.status !== 200)
    throw new Error(`GET ${path} answered ${answer.status} ${answer.text}`);
  return JSON.parse(answer.text);
}

function currentOnboardingStep() {
  const card = document.querySelector(".kw-onboard");
  return {
    step: card?.querySelector(".kw-onboard-step[data-current]")?.textContent?.trim() ?? null,
    lines: [...(card?.querySelectorAll(".kw-onboard-line, .kw-onboard-ask") ?? [])].map(
      (line) => line.textContent ?? "",
    ),
    focused: card?.contains(document.activeElement) ?? false,
  };
}

function askSeen() {
  const card = document.querySelector("fieldset.kw-ask");
  return {
    why: card?.querySelector(".kw-ask-why")?.textContent ?? "",
    focused: card?.contains(document.activeElement) ?? false,
  };
}

function needsYouReads(words) {
  return document.querySelector(".kw-needs-you")?.textContent?.includes(words) === true;
}

function needsYouLine() {
  const strip = document.querySelector(".kw-needs-you:not([hidden])");
  if (strip === null) return null;
  return [...strip.querySelectorAll(":scope > :not([aria-hidden])")]
    .map((part) => part.textContent ?? "")
    .join(" ");
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

function scratchFolder(scenario) {
  const root = mkdtempSync(join(tmpdir(), `first-light-${scenario.id}-`));
  const scratch = {
    root,
    workspace: join(root, scenario.keylessFolder === true ? "keyless" : "first-light"),
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
  scratch.entry = scenario.profile === "stead" ? steadEntry(root) : ".";
  openedFolder = scenario.atHome === true ? creatureHomeOf(scratch) : scratch.workspace;
  return scratch;
}

function creatureHomeOf(scratch) {
  return join(scratch.home, ".keywork", "home");
}

function steadEntry(root) {
  const app = join(root, "stead-entry");
  mkdirSync(app);
  writeFileSync(
    join(app, "package.json"),
    `${JSON.stringify({ name: "stead-first-light", private: true, main: "main.mjs" })}\n`,
  );
  writeFileSync(
    join(app, "main.mjs"),
    `import { startDesktop, steadProfile } from ${JSON.stringify(pathToFileURL(builtRuntime).href)};\n\nstartDesktop(steadProfile);\n`,
  );
  return app;
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

function scratchEnv(scratch, scenario) {
  const keyless =
    scenario?.keylessFolder === true ? { FIRST_LIGHT_KEYLESS: scratch.workspace } : {};
  return {
    ...withoutModelKeys(process.env),
    USERPROFILE: scratch.home,
    HOME: scratch.home,
    KEYWORK_BIN: scratch.launcher,
    FIRST_LIGHT_LOG: scratch.engineLog,
    ...keyless,
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

async function launch(scratch, scenario) {
  return electron.launch({
    executablePath: electronBinary,
    args: [
      scratch.entry,
      `--user-data-dir=${scratch.userData}`,
      ...(scenario.atHome === true ? [] : [scratch.workspace]),
    ],
    cwd: desktopRoot,
    env: scratchEnv(scratch, scenario),
    timeout: 60_000,
  });
}

function whatTheConsoleSays(app) {
  const said = [];
  for (const stream of [app.process().stdout, app.process().stderr]) {
    stream?.on("data", (chunk) => {
      const stamp = new Date().toISOString().slice(11, 23);
      for (const line of String(chunk).split("\n")) {
        if (line.trim() !== "") said.push(`${stamp} ${line.trim()}`);
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

async function cleanUp(scratch, app, scenario) {
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
  if (scenario.profile === "keywork") {
    await attempt("untrust the folder", () => trust(scratch, "untrust"));
  }
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

function reportOf(scenario, scratch, outcomes, seconds, unfinished) {
  const engine = engineLines(scratch);
  return {
    scenario: scenario.id,
    profile: scenario.profile,
    seconds,
    scratch: scratch.root,
    steps: [
      ...outcomes.map(({ run: _run, ...outcome }) => outcome),
      ...scenario.steps
        .filter((step) => !outcomes.some((outcome) => outcome.id === step.id))
        .map(({ run: _run, ...step }) => ({ ...step, verdict: "not reached" })),
    ],
    unfinished,
    engine: {
      turns: engine.filter((line) => line.turn !== undefined).map((line) => line.turn),
      refusedFetches: engine.filter((line) => line.refusedFetch).map((line) => line.refusedFetch),
      refusedProviders: engine
        .filter((line) => line.refusedProvider)
        .map((line) => line.refusedProvider),
      keyless: engine.filter((line) => line.keyless).map((line) => line.keyless),
    },
  };
}

function printTable(scenario, report) {
  for (const row of report.steps) {
    const time = row.seconds === undefined ? "" : ` ${row.seconds}s`;
    const detail = row.observed ?? row.failure ?? "";
    console.log(
      `${scenario.id} (${scenario.profile}) · step ${row.id} · ${row.name} · ${row.verdict}${time} · ${detail}`,
    );
    if (row.screenshot !== undefined) console.log(`  screenshot ${row.screenshot}`);
  }
  for (const left of report.unfinished) console.log(`cleanup did not finish · ${left}`);
  console.log(
    `${report.engine.turns.length} scripted turns (${report.engine.turns.join(", ")}) · ${report.engine.keyless.length} keyless serves refused by the engine · ${report.engine.refusedFetches.length} fetches refused · ${report.engine.refusedProviders.length} other providers refused · ${report.seconds}s`,
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
