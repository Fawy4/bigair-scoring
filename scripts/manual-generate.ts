// Writes the generated parts of the manual from the code, so they cannot drift: the settings tables (docs/manual/settings.md), the errors appendix
// (docs/manual/errors.md) and the sentence index of the troubleshooting page (docs/manual/troubleshooting.md). Each lives between
// "<!-- generated:<name>:start -->" and "<!-- generated:<name>:end -->"; everything outside the markers is written by hand and kept.
//   npm run manual:generate          rewrite the generated parts
//   npm run manual:generate -- --check   fail (exit 1) when a generated part is out of date (the unit tests run this check too)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildGenerated } from "./manual/generated";

const DIR = path.join(process.cwd(), "docs", "manual");
const check = process.argv.includes("--check");

let stale = 0;
for (const [file, blocks] of Object.entries(buildGenerated())) {
  const full = path.join(DIR, file);
  const before = readFileSync(full, "utf8");
  let after = before;
  for (const [name, body] of Object.entries(blocks)) {
    const start = `<!-- generated:${name}:start -->`;
    const end = `<!-- generated:${name}:end -->`;
    const a = after.indexOf(start);
    const b = after.indexOf(end);
    if (a < 0 || b < a) throw new Error(`${file}: markers for "${name}" are missing`);
    after = `${after.slice(0, a + start.length)}\n${body.trim()}\n${after.slice(b)}`;
  }
  if (after !== before) {
    stale++;
    if (check) console.log(`out of date: docs/manual/${file}`);
    else {
      writeFileSync(full, after);
      console.log(`written: docs/manual/${file}`);
    }
  } else console.log(`up to date: docs/manual/${file}`);
}
if (check && stale) process.exit(1);
