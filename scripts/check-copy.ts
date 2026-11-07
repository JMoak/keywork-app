import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import allowlist from "./copy-allowlist.json" with { type: "json" };
import { type PathPredicate, repoRoot, reportViolations, walkRepo } from "./lib/repo-files.ts";

export type Mention =
  | "cli verb"
  | "engine binary"
  | "engine version"
  | "url scheme"
  | "identifier"
  | "feature"
  | "prose";

export interface SourceText {
  readonly path: string;
  readonly content: string;
}

export interface AllowEntry {
  readonly path: string;
  readonly pattern: string;
  readonly reason: string;
}

export interface CopyHit {
  readonly path: string;
  readonly line: number;
  readonly copy: string;
  readonly sourceLine: string;
  readonly mention: Mention;
  readonly brand: Brand;
  readonly fix: string;
}

export const allowlistFile = "scripts/copy-allowlist.json";

export const keeperFacingPath: PathPredicate = (path) =>
  /^packages\/(?:ui\/src|desktop\/src\/main)\/.+\.tsx?$/.test(path) &&
  !testSupport.test(path) &&
  !path.includes("/e2e/");

export function copyViolations(
  sources: readonly SourceText[],
  entries: readonly AllowEntry[],
): string[] {
  const prose = sources.flatMap(findCopyHits).filter((hit) => hit.mention === "prose");
  const excusers = entries.map((entry) => ({ entry, line: new RegExp(entry.pattern) }));
  const excuses = ({ entry, line }: (typeof excusers)[number], hit: CopyHit) =>
    entry.path === hit.path && line.test(hit.sourceLine);
  const unexcused = prose.filter((hit) => !excusers.some((excuser) => excuses(excuser, hit)));
  const stale = excusers.filter((excuser) => !prose.some((hit) => excuses(excuser, hit)));
  return [...unexcused.map(describeHit), ...stale.map(({ entry }) => describeStale(entry))];
}

export function findCopyHits(source: SourceText): CopyHit[] {
  const file = ts.createSourceFile(
    source.path,
    source.content,
    ts.ScriptTarget.Latest,
    true,
    source.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines = source.content.split("\n");
  return copiesIn(file).flatMap((copy) =>
    brandMentions(copy).map(({ at, brand }) => {
      const line = file.getLineAndCharacterOfPosition(copy.start + at).line;
      return {
        path: source.path,
        line: line + 1,
        copy: copy.text.replace(/\s+/g, " ").trim(),
        sourceLine: lines[line] ?? "",
        mention: mentionAt(copy.text, at, brand),
        brand,
        fix: fixFor(copy.text, at, brand),
      };
    }),
  );
}

export function mentionAt(copy: string, at: number, brand: Brand = "keywork"): Mention {
  const before = copy.slice(0, at);
  const after = copy.slice(at + brand.length);
  if (after.startsWith("://")) return "url scheme";
  if (joinedBefore.test(before) || joinedAfter.test(after)) return "identifier";
  if (brand === "stead") return isFeatureMention(before, after) ? "feature" : "prose";
  if (before.endsWith("`")) return /^\\?`/.test(after) ? "engine binary" : "cli verb";
  if (versionAfter.test(after)) return "engine version";
  if (binaryAfter.test(after)) return "engine binary";
  return "prose";
}

export async function scanCopy(
  root = repoRoot,
  entries: readonly AllowEntry[] = allowlist,
): Promise<{ scanned: number; violations: string[] }> {
  const paths = await walkRepo(keeperFacingPath, root);
  const sources = await Promise.all(
    paths.map(async (path) => ({ path, content: await readFile(join(root, path), "utf8") })),
  );
  return { scanned: paths.length, violations: copyViolations(sources, entries) };
}

interface Copy {
  readonly text: string;
  readonly start: number;
  readonly holes: readonly (readonly [number, number])[];
}

type Brand = "keywork" | "stead";

const testSupport = /(?:\.test|(?:^|[/-])(?:testing|fixtures|fakes))\.tsx?$/;

const joinedBefore = /[\w$@.\\/~-]$/;
const joinedAfter = /^(?:[\w$]|[.:/\\-][\w$.{\\/-])/;
const versionAfter = /^ (?:v?\d+(?:\.\d+)*\b|\$\{[^}]*version[^}]*\}|version\b)/i;
const binaryAfter = /^ binary\b/i;

const cliCommands = new Set([
  "attach",
  "bot",
  "chat",
  "connect",
  "creatures",
  "doctor",
  "extensions",
  "init",
  "link",
  "mcp",
  "memory",
  "models",
  "node",
  "panes",
  "permissions",
  "run",
  "serve",
  "sessions",
  "setup",
  "skills",
  "trust",
  "untrust",
  "workspace",
]);

const equalityOperators = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

function copiesIn(file: ts.SourceFile): Copy[] {
  const found: Copy[] = [];
  const visit = (node: ts.Node): void => {
    const copy = copyOf(node, file);
    if (copy !== undefined) found.push(copy);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function copyOf(node: ts.Node, file: ts.SourceFile): Copy | undefined {
  if (ts.isJsxText(node)) {
    return node.containsOnlyTriviaWhiteSpaces
      ? undefined
      : { text: node.getText(file), start: node.getStart(file), holes: [] };
  }
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) {
    return ts.isTemplateExpression(node) && !neverShown(node)
      ? templateCopy(node, file)
      : undefined;
  }
  return neverShown(node) ? undefined : quotedCopy(node, file, []);
}

function templateCopy(node: ts.TemplateExpression, file: ts.SourceFile): Copy {
  const holes = node.templateSpans.map(
    ({ expression }) => [expression.getStart(file), expression.getEnd()] as const,
  );
  return quotedCopy(node, file, holes);
}

function quotedCopy(
  node: ts.Node,
  file: ts.SourceFile,
  holes: readonly (readonly [number, number])[],
): Copy {
  const start = node.getStart(file) + 1;
  return {
    text: node.getText(file).slice(1, -1),
    start,
    holes: holes.map(([from, to]) => [from - start, to - start] as const),
  };
}

function neverShown(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ts.isLiteralTypeNode(parent) ||
    ts.isCaseClause(parent) ||
    (ts.isBinaryExpression(parent) && equalityOperators.has(parent.operatorToken.kind))
  );
}

function brandMentions(copy: Copy): { at: number; brand: Brand }[] {
  return [...copy.text.matchAll(/keywork|stead/gi)].flatMap((match) => {
    const at = match.index;
    if (copy.holes.some(([from, to]) => at >= from && at < to)) return [];
    return [{ at, brand: match[0].toLowerCase() === "keywork" ? "keywork" : "stead" }];
  });
}

function isFeatureMention(before: string, after: string): boolean {
  return (
    /\bthe $/i.test(before) &&
    !/^ (?:app|application|console|desktop|installer|product|release|update)\b/i.test(after)
  );
}

function fixFor(copy: string, at: number, brand: Brand): string {
  const word = /^ ([a-z]+)/.exec(copy.slice(at + brand.length))?.[1];
  return brand === "keywork" && word !== undefined && cliCommands.has(word)
    ? `quote the command as \`keywork ${word}\`, or say "the server" where it names the running engine`
    : `use the product profile's name from @keywork-app/product, or name the engine in plain words ("the engine", "the server")`;
}

function describeHit(hit: CopyHit): string {
  return `${hit.path}:${hit.line}: "${hit.copy}" | fix: ${hit.fix}`;
}

function describeStale(entry: AllowEntry): string {
  return `${allowlistFile}: ${entry.path} /${entry.pattern}/ excuses nothing | fix: delete the entry; the string it excused is gone or reads under the rule now`;
}

if (import.meta.main) {
  const { scanned, violations } = await scanCopy();
  process.exitCode = reportViolations(
    {
      check: "check:copy",
      heading:
        "a product name is hard-coded in shared desktop copy (use the selected profile for product names; the Stead feature and technical engine names retain their meaning):",
      scanned: `${scanned} keeper-facing files, ${allowlist.length} allowlist entries in ${allowlistFile}`,
    },
    violations,
  );
}
