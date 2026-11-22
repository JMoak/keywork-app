export type Role = string;

export interface IndexedTexture {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly indices: Uint8Array;
  readonly roles: readonly Role[];
}

export interface Brush {
  readonly width: number;
  readonly height: number;
  rect(x: number, y: number, width: number, height: number, role: Role): void;
  dot(x: number, y: number, role: Role): void;
  erase(x: number, y: number, width: number, height: number): void;
  wash(x: number, y: number, width: number, height: number, role: Role, alpha: number): void;
}

export const clear = 0;
export const roleLimit = 255;

export function paintTexture(
  width: number,
  height: number,
  paint: (brush: Brush) => void,
): IndexedTexture {
  const indices = new Uint8Array(Math.max(0, width * height));
  const roles: Role[] = [];
  const indexOf = (role: Role): number => {
    const known = roles.indexOf(role);
    if (known >= 0) return known + 1;
    if (roles.length >= roleLimit)
      throw new RangeError(`a texture holds at most ${roleLimit} roles`);
    roles.push(role);
    return roles.length;
  };
  const cover = (x: number, y: number, w: number, h: number, index: number): void => {
    const left = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y));
    const right = Math.min(width, Math.round(x + w));
    const bottom = Math.min(height, Math.round(y + h));
    for (let row = top; row < bottom; row += 1)
      indices.fill(index, row * width + left, row * width + right);
  };
  paint({
    width,
    height,
    rect: (x, y, w, h, role) => {
      if (w > 0 && h > 0) cover(x, y, w, h, indexOf(role));
    },
    dot: (x, y, role) => cover(x, y, 1, 1, indexOf(role)),
    erase: (x, y, w, h) => cover(x, y, w, h, clear),
    wash: (x, y, w, h, role, alpha) => {
      if (w <= 0 || h <= 0) return;
      const washed = new Map<number, number>();
      const left = Math.max(0, Math.round(x));
      const top = Math.max(0, Math.round(y));
      const right = Math.min(width, Math.round(x + w));
      const bottom = Math.min(height, Math.round(y + h));
      for (let row = top; row < bottom; row += 1) {
        for (let column = left; column < right; column += 1) {
          const at = row * width + column;
          const under = indices[at] ?? clear;
          if (under === clear) continue;
          let over = washed.get(under);
          if (over === undefined) {
            over = indexOf(washedRole(roles[under - 1] ?? "", role, alpha));
            washed.set(under, over);
          }
          indices[at] = over;
        }
      }
    },
  });
  return sealTexture(width, height, indices, roles);
}

export function textureFromRows(
  rows: readonly string[],
  legend: Readonly<Record<string, Role>>,
): IndexedTexture {
  const width = Math.max(0, ...rows.map((row) => row.length));
  return paintTexture(width, rows.length, (brush) => {
    rows.forEach((row, y) => {
      [...row].forEach((glyph, x) => {
        if (glyph === transparentGlyph) return;
        const role = legend[glyph];
        if (role === undefined) throw new Error(`"${glyph}" is not in the legend`);
        brush.dot(x, y, role);
      });
    });
  });
}

export function washedRole(under: Role, over: Role, alpha: number): Role {
  return `${under}~${over}@${alpha}`;
}

export function mixedRole(from: Role, toward: Role, share: number): Role {
  return `${from}>${toward}@${share}`;
}

export function sealTexture(
  width: number,
  height: number,
  indices: Uint8Array,
  roles: readonly Role[],
): IndexedTexture {
  return {
    key: `${width}x${height}|${roles.join(",")}|${digest(indices)}`,
    width,
    height,
    indices,
    roles,
  };
}

export function opaqueAt(texture: IndexedTexture, x: number, y: number): boolean {
  const column = Math.floor(x);
  const row = Math.floor(y);
  if (column < 0 || row < 0 || column >= texture.width || row >= texture.height) return false;
  return (texture.indices[row * texture.width + column] ?? clear) !== clear;
}

export function roleAt(texture: IndexedTexture, x: number, y: number): Role | undefined {
  const index = texture.indices[Math.floor(y) * texture.width + Math.floor(x)] ?? clear;
  return index === clear ? undefined : texture.roles[index - 1];
}

export function mirrored(texture: IndexedTexture): IndexedTexture {
  const indices = new Uint8Array(texture.indices.length);
  for (let y = 0; y < texture.height; y += 1) {
    for (let x = 0; x < texture.width; x += 1) {
      indices[y * texture.width + x] =
        texture.indices[y * texture.width + texture.width - 1 - x] ?? clear;
    }
  }
  return sealTexture(texture.width, texture.height, indices, texture.roles);
}

export function textureMemo(
  limit = 1024,
): (key: string, make: () => IndexedTexture) => IndexedTexture {
  const held = new Map<string, IndexedTexture>();
  return (key, make) => {
    const known = held.get(key);
    if (known !== undefined) return known;
    if (held.size >= limit) held.clear();
    const made = make();
    held.set(key, made);
    return made;
  };
}

const transparentGlyph = ".";

function digest(indices: Uint8Array): string {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (const index of indices) {
    first = Math.imul(first ^ index, 0x01000193) >>> 0;
    second = (Math.imul(second, 31) + index + 1) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}
