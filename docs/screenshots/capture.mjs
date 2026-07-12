// Regenerates the screenshots embedded in README.md.
// Usage: start both dev servers (see README "Running locally"), then:
//   node docs/screenshots/capture.mjs
//
// Requires a local Chromium build. If PLAYWRIGHT_CHROMIUM_PATH isn't set,
// falls back to letting playwright-core find a system Chrome/Chromium.
import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.dirname(fileURLToPath(import.meta.url));
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox"],
});

async function desktopFlow() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(WEB_URL, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Welcome to GuideTrain");
  await page.screenshot({ path: path.join(OUT, "01-onboarding.png") });

  await page.fill('input[placeholder="e.g. iron_ada"]', "iron_ada");
  await page.click('button:has-text("Female")');
  await page.click('button:has-text("18 - 29")');
  await page.click('button:has-text("Continue to body explorer")');
  await page.waitForURL("**/explore");
  await page.waitForSelector("text=rotate the model");
  await page.waitForTimeout(3500); // let STL loads + camera fit settle
  await page.screenshot({ path: path.join(OUT, "02-explorer.png") });

  // Rotate to a 3/4 front angle, then click the torso to select a muscle group.
  const canvas = await page.$("canvas");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.mouse.click(cx - 40, cy - 40);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "03-muscle-selected.png") });
  await page.close();
}

async function mobileFlow() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(WEB_URL, { waitUntil: "networkidle" });
  await page.evaluate(() =>
    localStorage.setItem(
      "guidetrain.profile",
      JSON.stringify({ username: "iron_ada", gender: "female", ageGroup: "18-29" })
    )
  );
  await page.goto(`${WEB_URL}/explore`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, "04-mobile.png") });
  await page.close();
}

await desktopFlow();
await mobileFlow();
await browser.close();
console.log("Screenshots written to", OUT);
