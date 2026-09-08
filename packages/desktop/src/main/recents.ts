import { z } from "zod";

export const recentWorkspaceSchema = z
  .object({
    path: z.string().min(1).describe("The workspace folder as it was opened."),
    openedAt: z.string().describe("ISO time of the last open, so the list can order newest first."),
  })
  .strict();

export const recentsFileSchema = z
  .object({
    version: z.literal(1),
    workspaces: z.array(recentWorkspaceSchema).max(20),
  })
  .strict()
  .describe(
    "The recently opened workspaces, capped at twenty; exists so the front door can offer a return path without a settings surface.",
  );

export type RecentWorkspace = z.infer<typeof recentWorkspaceSchema>;

export interface FileSeams {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, text: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export interface RecentStore {
  list(): Promise<readonly RecentWorkspace[]>;
  touch(path: string, now?: () => Date): Promise<readonly RecentWorkspace[]>;
  forget(path: string): Promise<readonly RecentWorkspace[]>;
}

export const recentLimit = 20;

export function recentStore(file: string, fs: FileSeams): RecentStore {
  const load = async (): Promise<RecentWorkspace[]> => {
    const text = await fs.readText(file);
    if (text === undefined) return [];
    const parsed = recentsFileSchema.safeParse(tryJson(text));
    return parsed.success ? parsed.data.workspaces : [];
  };
  const save = async (workspaces: RecentWorkspace[]): Promise<readonly RecentWorkspace[]> => {
    const text = `${JSON.stringify({ version: 1, workspaces }, null, 2)}\n`;
    const staging = `${file}.tmp`;
    await fs.writeText(staging, text);
    await fs.rename(staging, file);
    return workspaces;
  };
  return {
    list: load,
    touch: async (path, now = () => new Date()) => {
      const rest = (await load()).filter((entry) => entry.path !== path);
      return save([{ path, openedAt: now().toISOString() }, ...rest].slice(0, recentLimit));
    },
    forget: async (path) => save((await load()).filter((entry) => entry.path !== path)),
  };
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
