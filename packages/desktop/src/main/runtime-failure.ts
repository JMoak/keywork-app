export function runtimeFailure(output: string): { message: string; nextAction: string } {
  try {
    const failure = JSON.parse(output) as { message?: unknown; recovery?: unknown };
    if (typeof failure.message === "string") {
      return { message: failure.message, nextAction: recoveryText(failure.recovery) };
    }
  } catch {}
  return {
    message:
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) || "The shared engine did not answer.",
    nextAction: "Try again after checking the shared engine.",
  };
}

function recoveryText(recovery: unknown): string {
  switch (recovery) {
    case "update-products":
      return "Update the app that does not support the shared engine's contract. Incompatible engine changes require the maintenance steps in the upgrade guide.";
    case "update-bootstrap":
      return "Install an updated app release with shared-runtime compatibility support. The installed engine and current work have been left unchanged.";
    case "close-clients":
      return "Close the other app windows, then follow the upgrade guide to stop the shared engine before applying its update.";
    case "finish-work":
      return "Finish current tasks, then follow the upgrade guide to stop the shared engine before applying its update.";
    case "start-runtime":
      return "Enable background work to prepare the shared engine.";
    case "new-client":
      return "Close and reopen this window.";
    default:
      return "Try again after checking the shared engine.";
  }
}
