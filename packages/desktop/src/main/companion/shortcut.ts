export type ShortcutVerdict = { ok: true; accelerator: string } | { ok: false; reason: string };

export const reservedChords: readonly string[] = [
  "Control+Space",
  "Alt+Space",
  "Command+Space",
  "Super+Space",
  "Control+Shift+Space",
  "Alt+Shift+Space",
  "Control+Alt+Space",
  "Command+Shift+Space",
  "Control+D",
  "Command+D",
  "Alt+Tab",
  "Command+Tab",
  "Super+Tab",
  "Alt+F4",
  "Control+Alt+Delete",
  "Alt+Shift",
  "Control+Shift",
  "Super+Alt+P",
  "Super+L",
  "Super+D",
  "Super+E",
  "Super+R",
  "Super+S",
  "Super+V",
  "Super+X",
  "Super+I",
  "Super+A",
  "Super+H",
  "Super+K",
  "Super+P",
  "Super+G",
  "Super+W",
  "Super+Q",
  "Super+C",
  "Super+N",
  "Super+M",
  "Super+T",
  "Super+U",
  "Super+B",
  "Super+Z",
  "Super+Period",
  "Super+Semicolon",
  "Super+Shift+S",
  "Command+Q",
  "Command+W",
  "Command+H",
  "Command+M",
];

const modifiers = ["Control", "Alt", "Shift", "Super", "Command", "CommandOrControl"] as const;

type Modifier = (typeof modifiers)[number];

const spellings: Readonly<Record<string, Modifier>> = {
  ctrl: "Control",
  control: "Control",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  super: "Super",
  win: "Super",
  meta: "Super",
  cmd: "Command",
  command: "Command",
  cmdorctrl: "CommandOrControl",
  commandorcontrol: "CommandOrControl",
};

export function shortcutVerdict(chord: string): ShortcutVerdict {
  const parts = chord
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length < 2) return refused("a shortcut needs at least one modifier and a key");
  const key = parts.at(-1) ?? "";
  const held = parts.slice(0, -1).map((part) => spellings[part.toLowerCase()]);
  if (held.some((modifier) => modifier === undefined) || spellings[key.toLowerCase()]) {
    return refused("modifiers come first, then exactly one key");
  }
  const accelerator = [...new Set(held as Modifier[]), canonicalKey(key)].join("+");
  if (reservedChords.some((reserved) => sameChord(reserved, accelerator))) {
    return refused(`${accelerator} belongs to the OS or a launcher`);
  }
  if (onlyModifier(held as Modifier[], "Super") || onlyModifier(held as Modifier[], "Command")) {
    return refused(`${accelerator}: Win and Command chords with one key belong to the OS`);
  }
  return { ok: true, accelerator };
}

export interface ShortcutPort {
  register(accelerator: string, handler: () => void): boolean;
  unregister(accelerator: string): void;
}

export interface ShortcutStanding {
  accelerator: string | undefined;
  registered: boolean;
  reason: string | undefined;
}

export interface ShortcutKeeper {
  apply(chord: string | null, handler: () => void): ShortcutStanding;
  standing(): ShortcutStanding;
  release(): void;
}

export const noShortcut: ShortcutStanding = {
  accelerator: undefined,
  registered: false,
  reason: undefined,
};

export function shortcutKeeper(port: ShortcutPort): ShortcutKeeper {
  let standing = noShortcut;
  const release = (): void => {
    if (standing.registered && standing.accelerator !== undefined) {
      port.unregister(standing.accelerator);
    }
    standing = noShortcut;
  };
  return {
    apply: (chord, handler) => {
      if (chord === null) {
        release();
        return standing;
      }
      const verdict = shortcutVerdict(chord);
      if (!verdict.ok) {
        release();
        standing = { accelerator: undefined, registered: false, reason: verdict.reason };
        return standing;
      }
      if (standing.registered && standing.accelerator === verdict.accelerator) return standing;
      release();
      const registered = port.register(verdict.accelerator, handler);
      standing = {
        accelerator: verdict.accelerator,
        registered,
        reason: registered ? undefined : `${verdict.accelerator} is held by another app`,
      };
      return standing;
    },
    standing: () => standing,
    release,
  };
}

function canonicalKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function sameChord(a: string, b: string): boolean {
  return normalized(a) === normalized(b);
}

function normalized(chord: string): string {
  const parts = chord.split("+");
  const key = parts.at(-1) ?? "";
  const held = parts
    .slice(0, -1)
    .map((part) => spellings[part.toLowerCase()] ?? part)
    .sort();
  return [...held, key.toLowerCase()].join("+");
}

function onlyModifier(held: readonly Modifier[], modifier: Modifier): boolean {
  return held.length === 1 && held[0] === modifier;
}

function refused(reason: string): ShortcutVerdict {
  return { ok: false, reason };
}
