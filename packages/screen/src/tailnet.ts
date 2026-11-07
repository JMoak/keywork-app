export const tailnetRanges = { ipv4: "100.64.0.0/10", ipv6: "fd7a:115c:a1e0::/48" } as const;

export type CandidateType = "host" | "srflx" | "prflx" | "relay";

export interface IceCandidateFields {
  readonly foundation: string;
  readonly component: number;
  readonly protocol: string;
  readonly address: string;
  readonly port: number;
  readonly type: CandidateType;
}

export function isTailnetAddress(address: string): boolean {
  return address.includes(":") ? isTailnetIpv6(address) : isTailnetIpv4(address);
}

export function parseCandidate(line: string): IceCandidateFields | undefined {
  const fields = line
    .trim()
    .replace(/^a=/, "")
    .replace(/^candidate:/, "")
    .split(/\s+/);
  const [foundation, component, protocol, , address, port, typ, type] = fields;
  if (typ !== "typ" || !isCandidateType(type) || address === undefined) return undefined;
  if (foundation === undefined || protocol === undefined) return undefined;
  const componentNumber = Number(component);
  const portNumber = Number(port);
  if (!Number.isInteger(componentNumber) || !Number.isInteger(portNumber)) return undefined;
  return {
    foundation,
    component: componentNumber,
    protocol: protocol.toLowerCase(),
    address,
    port: portNumber,
    type,
  };
}

export function isTailnetCandidate(line: string): boolean {
  const fields = parseCandidate(line);
  return (
    fields !== undefined &&
    fields.type === "host" &&
    fields.protocol === "udp" &&
    !fields.address.endsWith(".local") &&
    isTailnetAddress(fields.address)
  );
}

export function tailnetOnlySdp(sdp: string): string {
  return sdp
    .split(/\r\n|\n/)
    .filter((line) => !line.startsWith("a=candidate:") || isTailnetCandidate(line))
    .join("\r\n");
}

export function sdpCandidates(sdp: string): string[] {
  return sdp.split(/\r\n|\n/).filter((line) => line.startsWith("a=candidate:"));
}

function isTailnetIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !isByte(octet))) return false;
  const [first, second] = octets as [number, number, number, number];
  return first === 100 && second >= 64 && second <= 127;
}

function isTailnetIpv6(address: string): boolean {
  const hextets = expandIpv6(address.replace(/^\[|\]$/g, "").replace(/%.*$/, ""));
  return (
    hextets !== undefined && hextets[0] === 0xfd7a && hextets[1] === 0x115c && hextets[2] === 0xa1e0
  );
}

function expandIpv6(address: string): number[] | undefined {
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return undefined;
  const head = splitHextets(halves[0] ?? "");
  const tail = halves.length === 2 ? splitHextets(halves[1] ?? "") : [];
  if (head === undefined || tail === undefined) return undefined;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;
  return [...head, ...Array<number>(Math.max(missing, 0)).fill(0), ...tail];
}

function splitHextets(part: string): number[] | undefined {
  if (part === "") return [];
  const hextets = part.split(":");
  if (hextets.some((hextet) => !/^[0-9a-f]{1,4}$/.test(hextet))) return undefined;
  return hextets.map((hextet) => Number.parseInt(hextet, 16));
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

function isCandidateType(value: string | undefined): value is CandidateType {
  return value === "host" || value === "srflx" || value === "prflx" || value === "relay";
}
