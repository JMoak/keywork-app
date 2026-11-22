// What the panes-outside checks do about exceptions nobody caught: every console they launch
// preloads uncaught-guard.cjs, which writes each one to a file instead of letting Electron show it
// as a dialog, and the console's own output goes to a second file instead of nowhere. A check is
// not clean while that first file names an exception or a rejection in the main process, an
// uncaught error in a page, or a renderer that crashed.
//
//   const watch = uncaughtWatch(scratchFolder);
//   launch electron with [...watch.args, ".", ...] and { ...env, ...watch.env }
//   watch.capture(childProcess);
//   const clean = printUncaught("panes outside", watch);     once the console has closed
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const guard = join(import.meta.dirname, "uncaught-guard.cjs");
const stackLinesShown = 8;
const pageErrorsShown = 5;

export function uncaughtWatch(folder) {
  const seenFile = join(folder, "uncaught.jsonl");
  const outputFile = join(folder, "console-output.log");
  return {
    outputFile,
    args: ["-r", guard],
    env: { KEYWORK_E2E_UNCAUGHT: seenFile },
    capture: (child) => {
      for (const stream of [child.stdout, child.stderr]) {
        stream?.on("data", (chunk) => appendFileSync(outputFile, chunk));
      }
    },
    seen: () => linesOf(seenFile).map((line) => JSON.parse(line)),
  };
}

export function printUncaught(label, watch) {
  const seen = watch.seen();
  if (!seen.some((entry) => entry.kind === "watching")) {
    console.log(`${label} · uncaught · the console never loaded the guard · FAILED`);
    return false;
  }
  const failures = seen.filter(fails);
  const logged = seen.filter((entry) => entry.kind === "page-error" && !fails(entry));
  if (failures.length === 0) {
    console.log(`${label} · uncaught · none in the main process or in any page`);
  } else {
    console.log(`${label} · uncaught · ${failures.length} in this run · FAILED`);
    for (const failure of failures) console.log(indented(`${failure.kind}: ${failure.detail}`));
  }
  if (logged.length > 0) {
    console.log(`${label} · page errors logged · ${logged.length} (not counted as uncaught)`);
    for (const entry of logged.slice(0, pageErrorsShown)) console.log(indented(entry.detail));
  }
  return failures.length === 0;
}

function fails(entry) {
  if (entry.kind === "uncaughtException" || entry.kind === "unhandledRejection") return true;
  if (entry.kind === "page-error") return entry.detail.startsWith("Uncaught");
  if (entry.kind === "render-process-gone") return !/^(clean-exit|killed) /.test(entry.detail);
  return false;
}

function indented(text) {
  return text
    .split("\n")
    .slice(0, stackLinesShown)
    .map((line) => `    ${line}`)
    .join("\n");
}

function linesOf(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line !== "");
}
