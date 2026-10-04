import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const asset = async (path, mime) =>
  `data:${mime};base64,${(await readFile(new URL(path, root))).toString("base64")}`;
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const logo = await asset("public/ant-blue.svg", "image/svg+xml");
  const screenshot = await asset(
    "public/android/search-results.png",
    "image/png",
  );
  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; } body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0b0e14; color: #f3f6ff; font-family: Arial, sans-serif; }
    .glow { position: absolute; inset: 0; background: radial-gradient(ellipse at 85% 50%, #1d4e804d, transparent 60%); }
    .ring { position: absolute; width: 600px; height: 600px; border: 1px solid #63acff20; border-radius: 50%; top: 30px; left: 680px; }
    .ring.inner { width: 470px; height: 470px; top: 95px; left: 745px; }
    main { position: relative; padding: 55px 64px; }
    .brand { display: flex; align-items: center; gap: 15px; font-size: 32px; font-weight: 700; letter-spacing: -1px; }
    .brand img { width: 35px; height: 43px; } .brand span { color: #9ba6b9; font-size: 20px; font-weight: 400; letter-spacing: 0; margin-left: 10px; }
    h1 { font-size: 76px; letter-spacing: -4px; line-height: 1.05; margin: 53px 0 23px; font-weight: 750; } h1 span { color: #69afff; }
    p { color: #aab6c9; font-size: 24px; line-height: 1.5; margin: 0; }
    .bottom { display: flex; align-items: center; gap: 22px; margin-top: 38px; font-size: 18px; }
    .badge { color: #081323; background: #69afff; padding: 14px 21px; border-radius: 9px; font-weight: 700; }
    .url { color: #aab6c9; }
    .phone { position: absolute; width: 251px; height: 552px; top: 44px; right: 86px; border: 5px solid #343e4d; border-radius: 32px; overflow: hidden; transform: rotate(8deg); box-shadow: 10px 25px 65px #0009; background: #191919; }
    .phone img { display: block; width: 100%; height: auto; }
  </style></head><body><div class="glow"></div><div class="ring"></div><div class="ring inner"></div><main>
    <div class="brand"><img src="${logo}" alt="">ants <span>/ android</span></div>
    <h1>Nostr.<br>In your <span>pocket.</span></h1>
    <p>Search notes. Find your people.<br>Follow your curiosity.</p>
    <div class="bottom"><div class="badge">Get it on Zapstore ↗</div><div class="url">ants.sh/android</div></div>
  </main><div class="phone"><img src="${screenshot}" alt=""></div></body></html>`);
  await page
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  await page.screenshot({
    path: fileURLToPath(new URL("public/android/og.png", root)),
  });
} finally {
  await browser.close();
}
