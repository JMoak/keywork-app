export function clockWord(ms: number, offsetMinutes: number): string {
  const shifted = new Date(ms + offsetMinutes * 60 * 1000);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
