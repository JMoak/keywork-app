import { writeFile } from "node:fs/promises";
import { keyworkNight } from "../src/flavor/flavors.ts";
import { flavorStylesheet } from "../src/flavor/variables.ts";

const target = new URL("../src/flavor/keywork-night.css", import.meta.url);
await writeFile(target, flavorStylesheet(keyworkNight));
console.log(`wrote ${target.pathname}`);
