import { describe, expect, it } from "vitest";
import { hostLimitation, installStep } from "./copy.ts";
import { noWorkshops, sbxWorkshops, workshopsUnserved } from "./fixtures.ts";
import { workshopChoiceOf, workshopChoices, workshopSupportOf } from "./workshop.ts";

describe("what this machine supports", () => {
  it("chooses a bare host with the limitation and the install step when only host is here", () => {
    const support = workshopSupportOf(noWorkshops);
    expect(support).toEqual({ served: true, substrates: ["host"], detail: undefined });
    expect(workshopChoiceOf(support)).toEqual({
      substrate: "host",
      limitation: hostLimitation,
      installStep,
    });
    expect(workshopChoices(support)).toEqual(["host"]);
  });

  it("chooses a sealed microVM when an sbx workshop already stands on this node", () => {
    const support = workshopSupportOf(sbxWorkshops);
    expect(support.substrates).toEqual(["sbx", "host"]);
    expect(workshopChoiceOf(support)).toEqual({
      substrate: "sbx",
      limitation: undefined,
      installStep: undefined,
    });
    expect(workshopChoices(support)).toEqual(["sbx", "host"]);
  });

  it("reads a substrates field when the route grows one", () => {
    const support = workshopSupportOf({
      status: 200,
      body: { workshops: [], substrates: ["sbx", "host"] },
    });
    expect(support.substrates).toEqual(["sbx", "host"]);
  });

  it("says the node serves no workshops when the route is 503, and still chooses host", () => {
    const support = workshopSupportOf(workshopsUnserved);
    expect(support).toEqual({
      served: false,
      substrates: [],
      detail: "this host serves no workshops",
    });
    expect(workshopChoiceOf(support)).toEqual({
      substrate: "host",
      limitation:
        "no sandbox is available here yet (this host serves no workshops) · its commands run directly on this computer",
      installStep,
    });
    expect(workshopChoices(support)).toEqual(["host"]);
  });

  it("treats an unreadable listing as not served rather than guessing", () => {
    expect(workshopSupportOf({ status: 200, body: { nope: true } })).toEqual({
      served: false,
      substrates: [],
      detail: "unreadable listing",
    });
  });
});
