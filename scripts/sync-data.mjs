// Refreshes ./data from the sibling dyscalculia-data checkout when there is one.
// Standalone clones keep the committed snapshot, so `npm run build` works without it.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
const FILES = ["statistics.json", "references.json", "screening-test.json"];
if (FILES.every((f) => existsSync(new URL(`../../data/${f}`, import.meta.url)))) {
  mkdirSync(new URL("../data", import.meta.url), { recursive: true });
  for (const f of FILES) copyFileSync(new URL(`../../data/${f}`, import.meta.url), new URL(`../data/${f}`, import.meta.url));
}
