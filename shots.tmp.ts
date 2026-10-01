import { chromium, devices } from "@playwright/test";
(async () => {
  const slug = process.argv[2];
  const out = "/tmp/claude-0/-home-user-bigair-scoring/a12e8c30-7160-5282-95bb-aa0b6f65a7a4/scratchpad";
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH });
  const ctx = await browser.newContext({ ...devices["Pixel 5"] });
  const page = await ctx.newPage();
  for (const [name, path] of [["home", ""], ["live", "/live"], ["results", "/results"], ["ladder", "/ladder"], ["placings", "/placings"], ["rules", "/rules"], ["join", "/join"]] as const) {
    await page.goto(`http://localhost:3000/e/${slug}${path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  }
  const wide = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const p2 = await wide.newPage();
  await p2.goto(`http://localhost:3000/screen/${slug}`, { waitUntil: "networkidle" });
  await p2.screenshot({ path: `${out}/screen.png` });
  await browser.close();
})();
