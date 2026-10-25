export function readingMs(text: string): number {
  return Math.min(Math.max(shortestMs + text.length * msPerCharacter, shortestMs), longestMs);
}

const shortestMs = 2400;
const msPerCharacter = 45;
const longestMs = 9000;
