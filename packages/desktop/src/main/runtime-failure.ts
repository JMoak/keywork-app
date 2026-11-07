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
      return "Use matching app releases. An incompatible shared-engine upgrade requires the maintenance steps in the upgrade guide.";
    case "close-clients":
      return "Close the other app windows before updating the shared engine.";
    case "finish-work":
      return "Finish current tasks, then follow the upgrade guide to explicitly stop serving the affected workspaces.";
    case "start-runtime":
      return "Enable background work to prepare the shared engine.";
    case "new-client":
      return "Close and reopen this window.";
    default:
      return "Try again after checking the shared engine.";
  }
}
