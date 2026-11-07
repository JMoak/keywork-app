import { describe, expect, it } from "vitest";
import {
  isTailnetAddress,
  isTailnetCandidate,
  parseCandidate,
  sdpCandidates,
  tailnetOnlySdp,
} from "./tailnet.ts";

const host = (address: string, protocol = "udp", type = "host") =>
  `candidate:842163049 1 ${protocol} 2122260223 ${address} 47123 typ ${type} generation 0 network-id 1`;

describe("tailnet addresses", () => {
  it.each([
    ["100.64.0.0", true],
    ["100.101.102.103", true],
    ["100.127.255.255", true],
    ["100.63.255.255", false],
    ["100.128.0.0", false],
    ["10.0.0.7", false],
    ["192.168.1.20", false],
    ["127.0.0.1", false],
    ["100.64.0", false],
    ["100.64.0.256", false],
    ["fd7a:115c:a1e0::1", true],
    ["fd7a:115c:a1e0:ab12:4843:cd96:6258:b240", true],
    ["FD7A:115C:A1E0::53", true],
    ["[fd7a:115c:a1e0::9]", true],
    ["fd7a:115c:a1e0::9%13", true],
    ["fd7a:115c:a1e1::1", false],
    ["fe80::1", false],
    ["::1", false],
    ["fd7a::115c:a1e0", false],
    ["fd7a:115c:a1e0::1::2", false],
    ["8d1e5a3b-0a2c-4c2e-9a35-4d5e.local", false],
  ])("%s is tailnet: %s", (address, expected) => {
    expect(isTailnetAddress(address)).toBe(expected);
  });
});

describe("the candidate filter", () => {
  it("parses the fields libwebrtc writes", () => {
    expect(parseCandidate(`a=${host("100.101.102.103")}`)).toEqual({
      foundation: "842163049",
      component: 1,
      protocol: "udp",
      address: "100.101.102.103",
      port: 47123,
      type: "host",
    });
    expect(parseCandidate("candidate:1 1 udp 1 1.2.3.4 9 not-typ host")).toBeUndefined();
    expect(parseCandidate("garbage")).toBeUndefined();
  });

  it("keeps only udp host candidates on tailnet addresses and never an mDNS name", () => {
    expect(isTailnetCandidate(host("100.101.102.103"))).toBe(true);
    expect(isTailnetCandidate(host("fd7a:115c:a1e0::1a"))).toBe(true);
    expect(isTailnetCandidate(host("3f1e9b0c-7d2a-4c11-9b8e-1f2d3c4b5a69.local"))).toBe(false);
    expect(isTailnetCandidate(host("192.168.1.20"))).toBe(false);
    expect(isTailnetCandidate(host("100.101.102.103", "tcp"))).toBe(false);
    expect(isTailnetCandidate(host("100.101.102.103", "udp", "srflx"))).toBe(false);
    expect(isTailnetCandidate(host("100.101.102.103", "udp", "relay"))).toBe(false);
    expect(isTailnetCandidate("")).toBe(false);
  });

  it("strips every non-tailnet candidate line from a description and keeps the rest", () => {
    const sdp = [
      "v=0",
      "m=video 9 UDP/TLS/RTP/SAVPF 96",
      `a=${host("100.101.102.103")}`,
      `a=${host("192.168.1.20")}`,
      `a=${host("abc.local")}`,
      "a=fingerprint:sha-256 AB:CD",
      "",
    ].join("\r\n");
    const filtered = tailnetOnlySdp(sdp);
    expect(sdpCandidates(filtered)).toEqual([`a=${host("100.101.102.103")}`]);
    expect(filtered).toContain("a=fingerprint:sha-256 AB:CD");
    expect(filtered).toContain("m=video 9 UDP/TLS/RTP/SAVPF 96");
  });
});
