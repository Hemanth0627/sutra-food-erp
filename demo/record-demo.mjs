/**
 * Records the demo video segments with Playwright against a running Sutra ERP server.
 *
 *   BASE=http://localhost:3000 AUDIO_DIR=<dir with NN-id.wav> OUT_DIR=<dir> node demo/record-demo.mjs [segment-id ...]
 *
 * Each segment is one browser recording whose length matches its narration clip; actions are
 * scheduled as fractions of that length. A small cursor dot is injected because headless
 * recordings do not show the pointer. Segment 06 posts a goods receipt against the demo purchase
 * order and segment 03/04 places and approves a Mixture order, so run `npm run benchmark:reset`
 * afterwards to restore the documented benchmark state.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

// playwright-core is resolved from PLAYWRIGHT_CORE (a path) or normal module resolution.
const load = createRequire(import.meta.url);
const PW = process.env.PLAYWRIGHT_CORE || "playwright-core";
const { chromium } = load(PW);
const BASE = process.env.BASE || "http://localhost:3000";
const AUDIO_DIR = process.env.AUDIO_DIR;
const OUT_DIR = process.env.OUT_DIR;
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const CHROME = process.env.CHROME;
const PASSWORD = process.env.DEMO_PASSWORD || "Demo@1234";
const TAIL = 1.0; // seconds of video after the narration ends

const CURSOR = `(() => {
  if (window.__cursor) return; window.__cursor = 1;
  const add = () => {
    const d = document.createElement("div");
    d.id = "__demo_cursor";
    d.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(245,158,11,.85);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);pointer-events:none;left:-40px;top:-40px;transition:transform .12s";
    document.documentElement.appendChild(d);
    addEventListener("mousemove", (e) => { d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (d.style.transform = "scale(.7)"), true);
    addEventListener("mouseup", () => (d.style.transform = "scale(1)"), true);
  };
  if (document.documentElement) add(); else addEventListener("DOMContentLoaded", add);
})()`;

const EMAIL = {
  owner: "owner@sutra-erp.test",
  admin: "admin@sutra-erp.test",
  salesmanA: "salesman.a@sutra-erp.test",
  production: "production@sutra-erp.test",
  accountant: "accounts@sutra-erp.test",
};

function durationOf(wav) {
  let out = "";
  try {
    execFileSync(FFMPEG, ["-hide_banner", "-i", wav], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    out = String(e.stderr);
  }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  if (!m) throw new Error("No duration for " + wav);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

/** Segment scripts. `t(f)` waits until fraction f of the narration has elapsed. */
const SEGMENTS = {
  "01-intro": { role: null, path: "/", warm: 3500, run: async ({ t, scrollTo, clickLabel }) => {
    await t(0.3); await scrollTo("#how-it-works");
    await t(0.55); await scrollTo("#factory-tour");
    await t(0.72); await clickLabel("Cooking & frying");
  } },
  "02-roles": { role: null, path: "/login", warm: 1500, run: async ({ t, page, click, scrollBy }) => {
    await t(0.08); await click(page.getByRole("button", { name: /Owner/ }).first());
    await t(0.16); await click(page.getByRole("button", { name: "Sign in", exact: true }));
    await page.waitForURL(/dashboard/, { timeout: 60000 });
    await t(0.55); await scrollBy(520);
    await t(0.8); await scrollBy(520);
  } },
  "03-mobile-order": { role: "salesmanA", path: "/orders/new", mobile: true, warm: 2500, run: async ({ t, page, click }) => {
    await t(0.12); await click(page.getByRole("button", { name: /Retailer A/ }).first());
    await t(0.3); await click(page.getByRole("button", { name: "Add 10 Mixture 200 g" }));
    await t(0.38); await click(page.getByRole("button", { name: "Add 10 Mixture 200 g" }));
    await t(0.62); await click(page.getByRole("button", { name: /Place order/ }));
  } },
  "04-admin-approval": { role: "admin", path: "/orders", warm: 2000, run: async ({ t, page, click }) => {
    await t(0.1); await click(page.getByText("SO/2026-27/0003").first());
    await page.waitForURL(/orders\//);
    await t(0.42); await click(page.getByRole("button", { name: "Edit lines" }));
    await t(0.66); await click(page.getByRole("button", { name: "Cancel" }));
    await t(0.8); await click(page.getByRole("button", { name: "Approve" }));
  } },
  "05-gst-invoice": { role: "admin", path: "/invoices", warm: 2000, run: async ({ t, page, click, scrollBy }) => {
    await t(0.06); await click(page.getByText("INV/2026-27/0001").first());
    await page.waitForURL(/invoices\//);
    await t(0.45); await scrollBy(380);
    await t(0.78); await scrollBy(-380);
  } },
  "06-purchase": { role: "admin", path: "/purchases", warm: 2000, run: async ({ t, page, click, type }) => {
    await t(0.05); await click(page.getByText("PUR/2026-27/0001").first());
    await page.waitForURL(/purchases\/[^n]/);
    await t(0.48); await page.goto(BASE + "/purchase-orders", { waitUntil: "domcontentloaded" });
    await t(0.55); await click(page.getByText("PO/2026-27/0001").first());
    await page.waitForURL(/purchase-orders\//);
    await t(0.68); await click(page.getByRole("link", { name: /Receive goods/ }));
    await page.waitForURL(/purchases\/new/);
    await t(0.78); await type(page.locator("#inv"), "PW/26-27/0098");
    await t(0.9); await click(page.getByRole("button", { name: "Post purchase" }));
  } },
  "07-production": { role: "production", path: "/bom", warm: 2000, run: async ({ t, page, click, scrollBy }) => {
    await t(0.05); await click(page.getByText(/Murukku/).first());
    await page.waitForURL(/bom\//);
    await t(0.45); await page.goto(BASE + "/production", { waitUntil: "domcontentloaded" });
    await t(0.52); await click(page.getByText("PR/2026-27/0001").first());
    await page.waitForURL(/production\/c|production\/[a-z0-9]{20,}/);
    await t(0.78); await scrollBy(420);
  } },
  "08-planned-actual": { role: "production", path: "/reports/planned-vs-actual", warm: 2500, run: async ({ t, scrollBy }) => {
    await t(0.55); await scrollBy(200);
  } },
  "09-yield": { role: "production", path: "/reports/yield-wastage", warm: 2500, run: async ({ t, scrollBy }) => {
    await t(0.6); await scrollBy(200);
  } },
  "10-stock-ledger": { role: "accountant", path: "/reports/stock-ledger", warm: 2500, run: async ({ t, scrollBy }) => {
    await t(0.3); await scrollBy(300);
    await t(0.6); await scrollBy(300);
  } },
  "11-costing": { role: "owner", path: "/costing", warm: 2500, run: async ({ t, scrollBy }) => {
    await t(0.35); await scrollBy(260);
    await t(0.75); await scrollBy(260);
  } },
  "12-payment": { role: "admin", path: "/customers", warm: 2000, run: async ({ t, page, click, scrollBy }) => {
    await t(0.08); await click(page.getByText("Retailer A").first());
    await page.waitForURL(/customers\//);
    await t(0.6); await scrollBy(300);
  } },
  "13-shortage": { role: "admin", path: "/orders", warm: 2000, run: async ({ t, page, click }) => {
    await t(0.08); await click(page.getByText("SO/2026-27/0002").first());
    await page.waitForURL(/orders\//);
  } },
  "14-reports": { role: "accountant", path: "/reports", warm: 2000, run: async ({ t, page, click, scrollBy }) => {
    await t(0.45); await click(page.getByText("Consolidated monthly audit report").first());
    await page.waitForURL(/reports\//);
    await t(0.75); await scrollBy(400);
  } },
  "15-digital-twin": { role: "owner", path: "/factory", warm: 9000, run: async ({ t, page, clickLabel, click }) => {
    // Departments are picked from the 3D labels and, once the camera has moved, from the side list.
    const panel = page.locator('aside[aria-label="Department information"]');
    const fromList = async (name) => {
      await click(panel.getByRole("button", { name: "All departments" }));
      await page.waitForTimeout(400);
      await click(panel.getByRole("button", { name: new RegExp(name) }).first());
    };
    await t(0.2); await clickLabel("Finished-goods warehouse");
    await t(0.4); await fromList("Cooking & frying");
    await t(0.55); await fromList("Packaging-material store");
    await t(0.72); await click(page.getByRole("button", { name: "Reset camera" }));
    await t(0.84); await click(page.getByRole("button", { name: "Guided tour" }));
  } },
  "16-summary": { role: "owner", path: "/benchmark", warm: 2500, run: async ({ t, scrollBy }) => {
    await t(0.3); await scrollBy(320);
    await t(0.6); await scrollBy(320);
  } },
};

async function login(context, role) {
  const r = await context.request.post(BASE + "/api/auth/login", { data: { email: EMAIL[role], password: PASSWORD }, headers: { origin: BASE } });
  if (!r.ok()) throw new Error(`login ${role} failed: ${r.status()}`);
  const token = /sutra_session=([^;]+)/.exec(r.headers()["set-cookie"] || "")?.[1];
  if (token) await context.addCookies([{ name: "sutra_session", value: token, url: BASE }]);
}

(async () => {
  if (!AUDIO_DIR || !OUT_DIR) throw new Error("Set AUDIO_DIR and OUT_DIR");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const only = process.argv.slice(2);
  const ids = Object.keys(SEGMENTS).filter((id) => !only.length || only.includes(id));
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--unsafely-treat-insecure-origin-as-secure=${BASE}`, "--hide-scrollbars"],
  });
  const timings = {};
  for (const id of ids) {
    const seg = SEGMENTS[id];
    const dur = durationOf(path.join(AUDIO_DIR, `${id}.wav`));
    const size = seg.mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 };
    const vdir = path.join(OUT_DIR, "raw", id);
    fs.rmSync(vdir, { recursive: true, force: true });
    // Warm-up page (not recorded) so the recorded page loads from a warm server.
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, isMobile: !!seg.mobile, hasTouch: !!seg.mobile, recordVideo: { dir: vdir, size } });
    await context.addInitScript(CURSOR);
    if (seg.role) await login(context, seg.role);
    const t0 = Date.now();
    const page = await context.newPage();
    await page.goto(BASE + seg.path, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(seg.warm ?? 2000);
    await page.mouse.move(size.width / 2, size.height / 2);
    const ready = Date.now();
    const t = async (f) => {
      const wait = ready + f * dur * 1000 - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
    };
    const click = async (locator) => {
      await locator.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => {});
      const b = await locator.boundingBox({ timeout: 4000 }).catch(() => null);
      if (b) {
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
        await page.waitForTimeout(220);
      }
      // Software-rendered WebGL makes animation frames slow while recording, which can stall
      // Playwright's stability check; fall back to a forced click on the same element.
      await locator.click({ timeout: 4000 }).catch(() => locator.click({ force: true, timeout: 8000 }));
    };
    const ctx = {
      page,
      t,
      click,
      type: async (locator, text) => {
        await click(locator);
        await locator.pressSequentially(text, { delay: 60 });
      },
      scrollTo: (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 56, behavior: "smooth" }); }, sel),
      scrollBy: (dy) => page.evaluate((d) => { const m = document.querySelector("main"); window.scrollBy({ top: d, behavior: "smooth" }); if (m && m.scrollHeight > m.clientHeight) m.scrollBy({ top: d, behavior: "smooth" }); }, dy),
      clickLabel: async (title) => click(page.locator(`.twin-label[title="${title}"]`).first()),
    };
    try {
      await seg.run(ctx);
    } catch (e) {
      console.log(`  ! ${id}: ${e.message.split("\n")[0]}`);
    }
    await t(1 + TAIL / dur);
    const video = page.video();
    await page.close();
    await context.close();
    const file = await video.path();
    timings[id] = { file, trimStart: (ready - t0) / 1000, duration: dur + TAIL, mobile: !!seg.mobile };
    console.log(`recorded ${id}: ${dur.toFixed(2)}s narration, trim ${timings[id].trimStart.toFixed(2)}s`);
  }
  await browser.close();
  const prev = fs.existsSync(path.join(OUT_DIR, "timings.json")) ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, "timings.json"), "utf8")) : {};
  fs.writeFileSync(path.join(OUT_DIR, "timings.json"), JSON.stringify({ ...prev, ...timings }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
