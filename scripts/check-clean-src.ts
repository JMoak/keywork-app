import { type PathPredicate, reportViolations, walkRepo } from "./lib/repo-files.ts";

export const strayDeclaration: PathPredicate = (path) =>
  /^packages\/[^/]+\/src\/.*\.d\.ts(\.map)?$/.test(path);

if (import.meta.main) {
  const strays = await walkRepo(strayDeclaration);
  process.exitCode = reportViolations(
    {
      check: "check:clean-src",
      heading: "Declaration files under packages/*/src (a build wrote where sources live):",
      scanned: `${strays.length} stray declaration files`,
    },
    strays.map((path) => `${path}: delete it and add the missing tsconfig reference`),
  );
}
