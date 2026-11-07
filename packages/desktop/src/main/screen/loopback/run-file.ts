import { isAbsolute, join } from "node:path";

export const loopbackRunsDir = "artifacts/screen/runs";

export const loopbackRunFileEnv = "KEYWORK_SCREEN_RUN_FILE";

export function loopbackRunFile(
  root: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  at: Date = new Date(),
): string {
  const named = env[loopbackRunFileEnv];
  if (named !== undefined && named !== "") return isAbsolute(named) ? named : join(root, named);
  return join(root, loopbackRunsDir, `loopback-${stampOf(at)}.json`);
}

function stampOf(at: Date): string {
  return at.toISOString().replace(/[:.]/g, "-");
}
