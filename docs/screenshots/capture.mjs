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
  await page.waitForSelector("text=Muscle Groups"); // AnatomyViewer's region panel
  await page.waitForTimeout(3500); // let the GLB load + zone bake settle
  await page.screenshot({ path: path.join(OUT, "02-explorer.png") });

  // Click the front thigh (quadriceps) to show hover + selection readout + Train button.
  const canvas = await page.$("canvas");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width * 0.477, cy = box.y + box.height * 0.6;
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(300);
  // The very first pointer interaction after the model loads can be a no-op
  // (a one-time React StrictMode dev-mode timing artifact, harmless but real
  // — see AnatomyModel.jsx's zoneFromEvent guard), so click twice.
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(400);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(1200); // settle past the hover-triggered repaint
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
  // HashRouter: the route lives in the hash, not the path.
  await page.goto(`${WEB_URL}/#/explore`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Muscle Groups");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, "04-mobile.png") });
  await page.close();
}

await desktopFlow();
await mobileFlow();
await browser.close();
console.log("Screenshots written to", OUT);
