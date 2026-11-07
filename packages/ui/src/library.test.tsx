import { expect, it } from "vitest";
import * as library from "./index.tsx";

it("imports the public UI without mounting or requiring a root element", () => {
  expect(document.getElementById("root")).toBeNull();
  expect(typeof library.App).toBe("function");
  expect(document.body.childElementCount).toBe(0);
});
