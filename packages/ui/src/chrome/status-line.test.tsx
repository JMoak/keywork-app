import { emptyProjection } from "@keywork-app/client";
import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { StatusLine, type StatusLineProps, statusItems } from "./status-line.tsx";

afterEach(cleanup);

const quiet: StatusLineProps = {
  serverLabel: "127.0.0.1:4770",
  projection: emptyProjection,
  usage: "",
  preset: "careful",
  trust: undefined,
  leader: undefined,
  notice: undefined,
  gap: undefined,
  lost: undefined,
};

describe("statusItems", () => {
  it.each([keyworkProfile, steadProfile])(
    "renders the $name mark followed by the status grammar",
    (profile) => {
      expect(statusItems(quiet, profile).map((item) => [item.tone, item.text])).toEqual([
        ["mark", profile.name],
        ["where", "127.0.0.1:4770"],
        ["word", "careful"],
      ]);
    },
  );

  it("puts an untrusted workspace beside the server, where the eye lands first", () => {
    const items = statusItems({ ...quiet, trust: "untrusted · ctrl+k u trusts" });
    expect(items[2]).toEqual({ tone: "warn", text: "untrusted · ctrl+k u trusts" });
  });

  it("names the folder and the model, keeping the server's address for the hover", () => {
    const items = statusItems({
      ...quiet,
      folder: "C:\\work\\pricing-site\\",
      model: "anthropic/claude-sonnet",
    });
    expect(items.map((item) => item.text)).toEqual([
      keyworkProfile.name,
      "pricing-site",
      "anthropic/claude-sonnet",
      "careful",
    ]);
    expect(items[1]?.detail).toBe("C:\\work\\pricing-site\\ · served at 127.0.0.1:4770");
  });

  it("says a lost server in the folder's place and keeps the folder for the hover", () => {
    const items = statusItems({
      ...quiet,
      folder: "/srv/pricing-site",
      serverLost: true,
      serverLabel: "server lost · reattaching",
    });
    expect(items[1]).toEqual({
      tone: "warn",
      text: "server lost · reattaching",
      detail: "/srv/pricing-site",
    });
  });
});

describe("StatusLine", () => {
  it("keeps the moment zone a live status region, empty or not", () => {
    render(() => <StatusLine {...quiet} folder="/srv/pricing-site" />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByText("pricing-site").getAttribute("title")).toBe(
      "/srv/pricing-site · served at 127.0.0.1:4770",
    );
  });

  it("shows a manual compatibility notice without an install button", () => {
    const { container } = render(() => (
      <StatusLine
        {...quiet}
        update={{
          waiting: () => ({ version: "0.2.1", reviewRequired: true }),
          accepted: () => false,
          accept: () => undefined,
        }}
      />
    ));
    expect(container.querySelector(".kw-status-update")?.textContent).toBe(
      "update 0.2.1 available · manual compatibility review required",
    );
    expect(container.querySelector(".kw-status-update button")).toBeNull();
  });
});
