// Preloaded into the console's main process by the panes-outside checks (electron -r <this file>),
// before any of the console's own code runs. Electron shows an exception nobody caught in the main
// process as a dialog on the desktop and carries on; here each one is written with its stack to the
// file named by KEYWORK_E2E_UNCAUGHT instead, one JSON line apiece, beside every rejection nobody
// handled, every renderer or child process that went away, and every error a page logged. The
// check that launched the console reads the file and fails on what it finds (uncaught.mjs).
"use strict";

const { appendFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { app } = require("electron");

const seenFile = process.env.KEYWORK_E2E_UNCAUGHT;

if (seenFile !== undefined) watch();

function watch() {
  forgetOwnArguments();
  note("watching", `main process ${process.pid}`);
  process.on("uncaughtException", (error) => note("uncaughtException", stackOf(error)));
  process.on("unhandledRejection", (reason) => note("unhandledRejection", stackOf(reason)));
  app.on("render-process-gone", (_event, contents, details) =>
    note("render-process-gone", `${details.reason} (exit ${details.exitCode}) ${urlOf(contents)}`),
  );
  app.on("child-process-gone", (_event, details) =>
    note("child-process-gone", `${details.type} ${details.reason} (exit ${details.exitCode})`),
  );
  app.on("web-contents-created", (_event, contents) => {
    contents.on("console-message", (event) => {
      if (event.level !== "error") return;
      note("page-error", `${event.message}\n    at ${event.sourceId}:${event.lineNumber}`);
    });
  });
}

// The console reads its own command line, which must look as it does without this file.
function forgetOwnArguments() {
  const own = process.argv.findIndex(
    (argument, index) => argument === "-r" && isThisFile(process.argv[index + 1]),
  );
  if (own !== -1) process.argv.splice(own, 2);
}

function isThisFile(argument) {
  return argument !== undefined && resolve(argument).toLowerCase() === __filename.toLowerCase();
}

function note(kind, detail) {
  try {
    appendFileSync(seenFile, `${JSON.stringify({ at: Date.now(), kind, detail })}\n`);
  } catch {}
}

function stackOf(thrown) {
  return thrown instanceof Error ? (thrown.stack ?? thrown.message) : String(thrown);
}

function urlOf(contents) {
  try {
    return contents.getURL();
  } catch {
    return "a page already gone";
  }
}
