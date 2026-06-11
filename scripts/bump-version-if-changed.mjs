import { bumpVersionIfChanged } from "./versioning.mjs";

const result = await bumpVersionIfChanged();

if (result.status === "bumped") {
  console.log(`Version bumped ${result.previousVersion} -> ${result.version}`);
} else if (result.status === "initialized") {
  console.log(`Version tracking initialized at ${result.version}`);
} else {
  console.log(`Version unchanged at ${result.version}`);
}
