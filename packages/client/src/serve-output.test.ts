import { describe, expect, it } from "vitest";
import { parseServeLine, serveTicket } from "./serve-output.ts";

describe("keywork serve stdout", () => {
  it("parses the three announced lines", () => {
    expect(parseServeLine("listening on http://127.0.0.1:4770")).toEqual({
      kind: "listening",
      url: "http://127.0.0.1:4770",
    });
    expect(parseServeLine("token abc_DEF-123")).toEqual({ kind: "token", token: "abc_DEF-123" });
    expect(parseServeLine("ticket C:\\Users\\me\\.keywork\\server.json")).toEqual({
      kind: "ticket",
      path: "C:\\Users\\me\\.keywork\\server.json",
    });
  });

  it("never throws on anything else", () => {
    expect(parseServeLine("")).toEqual({ kind: "other", text: "" });
    expect(parseServeLine("listening on")).toEqual({ kind: "other", text: "listening on" });
  });

  it("assembles a ticket once both the url and the token have arrived", () => {
    const partial = [parseServeLine("listening on http://127.0.0.1:4770")];
    expect(serveTicket(partial)).toBeUndefined();
    expect(serveTicket([...partial, parseServeLine("token t")])).toEqual({
      url: "http://127.0.0.1:4770",
      token: "t",
    });
  });
});
