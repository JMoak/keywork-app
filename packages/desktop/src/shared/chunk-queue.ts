export interface ChunkQueue {
  push(bytes: Uint8Array): void;
  end(error?: string): void;
  read(): Promise<Uint8Array | undefined>;
}

export function chunkQueue(): ChunkQueue {
  const chunks: Uint8Array[] = [];
  let finished: { error: string | undefined } | undefined;
  let waiting:
    | { resolve: (bytes: Uint8Array | undefined) => void; reject: (e: Error) => void }
    | undefined;
  const settle = (): void => {
    if (waiting === undefined) return;
    const next = chunks.shift();
    if (next !== undefined) {
      const { resolve } = waiting;
      waiting = undefined;
      resolve(next);
      return;
    }
    if (finished === undefined) return;
    const { resolve, reject } = waiting;
    waiting = undefined;
    if (finished.error === undefined) resolve(undefined);
    else reject(new Error(finished.error));
  };
  return {
    push: (bytes) => {
      if (finished !== undefined) return;
      chunks.push(bytes);
      settle();
    },
    end: (error) => {
      if (finished !== undefined) return;
      finished = { error };
      settle();
    },
    read: () =>
      new Promise((resolve, reject) => {
        waiting = { resolve, reject };
        settle();
      }),
  };
}
