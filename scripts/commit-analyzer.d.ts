declare module "@semantic-release/commit-analyzer" {
  export function analyzeCommits(
    config: {
      preset: "conventionalcommits";
      releaseRules: readonly {
        breaking?: true;
        revert?: true;
        type?: string;
        release: "major" | "minor" | "patch" | false;
      }[];
    },
    context: {
      cwd: string;
      commits: readonly { hash: string; message: string }[];
      logger: { log(...args: unknown[]): void };
    },
  ): Promise<"major" | "minor" | "patch" | null>;
}
