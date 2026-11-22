export function raised<Key>(stack: readonly Key[], key: Key): Key[] {
  return [...without(stack, key), key];
}

export function lowered<Key>(stack: readonly Key[], key: Key): Key[] {
  return [key, ...without(stack, key)];
}

export function slippedUnder<Key>(stack: readonly Key[], key: Key, top: Key | undefined): Key[] {
  const rest = without(stack, key);
  const under = top === undefined ? -1 : rest.indexOf(top);
  return under < 0 ? [...rest, key] : [...rest.slice(0, under), key, ...rest.slice(under)];
}

export function leastRecentFirst<Key>(keys: readonly Key[], recent: readonly Key[]): Key[] {
  const recency = (key: Key): number => {
    const at = recent.indexOf(key);
    return at < 0 ? recent.length : at;
  };
  return keys.toSorted((one, other) => recency(other) - recency(one));
}

function without<Key>(stack: readonly Key[], key: Key): Key[] {
  return stack.filter((held) => held !== key);
}
