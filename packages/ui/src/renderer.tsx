import { productProfiles } from "@keywork-app/product";
import { mountDesktopRenderer } from "./bootstrap.tsx";
import { hostFromWindow } from "./host/port.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("Desktop renderer root is missing");
const host = hostFromWindow();
const profile = productProfiles[host?.productId ?? "keywork"];
document.title = profile.name;
mountDesktopRenderer(root, { profile, ...(host !== undefined && { host }) });
