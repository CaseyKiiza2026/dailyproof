/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  http = require("node:http"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");
const server = http.createServer((req, res) => {
  const name = new URL(req.url, "http://localhost").pathname;
  if (name === "/fonts/manrope.ttf") {
    res.setHeader("Content-Type", "font/ttf");
    res.end(fs.readFileSync(path.join(process.cwd(), "public/fonts/manrope.ttf")));
    return;
  }
  if (
    !["/", "/index.html", "/bundle.js", "/bundle.css", "/styles.css"].includes(
      name,
    )
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  const p = path.join(
    path.join(process.cwd(), "out/mobile-check"),
    name === "/" ? "index.html" : name,
  );
  res.setHeader(
    "Content-Type",
    p.endsWith(".js")
      ? "application/javascript"
      : p.endsWith(".css")
        ? "text/css"
        : "text/html",
  );
  res.end(fs.readFileSync(p));
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  try {
    for (const theme of ["dark", "light"])
    for (const width of [375, 390, 430, 1280])
      for (const route of [
        "dashboard",
        "todos",
        "calendar",
        "notifications",
        "assistant",
      ]) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
        });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(
          "http://127.0.0.1:" + server.address().port + "/?page=" + route,
        );
        await page.waitForTimeout(500);
        await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(
          await page.evaluate(() => document.compatMode),
          "CSS1Compat",
        );
        if (route === "todos") {
          await page
            .getByRole("button", { name: "Add task", exact: true })
            .click();
          await page
            .getByLabel("Title", { exact: true })
            .fill("Browser-created practice task");
          for (const control of await page
            .locator("form input,form select,form button")
            .all())
            assert.ok((await control.boundingBox()).height >= 44);
          await page
            .getByRole("button", { name: "Save task", exact: true })
            .click();
          await page
            .getByRole("heading", {
              name: "Browser-created practice task",
              exact: true,
            })
            .waitFor();
          const card = page
            .locator("article")
            .filter({
              has: page.getByRole("heading", {
                name: "Browser-created practice task",
                exact: true,
              }),
            });
          await card
            .getByRole("button", { name: "Complete", exact: true })
            .click();
          await card
            .getByRole("button", { name: "Reopen", exact: true })
            .waitFor();
          await card
            .getByRole("button", { name: "Attach / view proof", exact: true })
            .click();
          await card
            .getByLabel("Note", { exact: true })
            .fill("Finished my practice.");
          await card
            .getByRole("button", { name: "Save proof", exact: true })
            .click();
          await card
            .getByText("Finished my practice.", { exact: true })
            .waitFor();
          await card.getByLabel("Proof type").selectOption("image");
          await card.getByLabel("Image (up to 5 MB)").waitFor();
        }
        if (route === "calendar") {
          for (const view of ["Month", "Week", "Day"]) {
            await page.getByRole("button", { name: view, exact: true }).click();
            await page.waitForTimeout(150);
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth),
              width,
              "calendar " + view + " overflow",
            );
            for(const event of await page.locator('.proof-calendar .min-h-11:visible').all()){const box=await event.boundingBox();assert.ok(box.height>=44,'calendar event target '+view+' '+JSON.stringify(box));}
          }
          await page
            .getByRole("button", { name: "Add commitment", exact: true })
            .click();
          await page
            .getByLabel("Title", { exact: true })
            .fill("Browser appointment");
          await page
            .getByRole("button", { name: "Save commitment", exact: true })
            .click();
          await page
            .getByRole("heading", { name: "Browser appointment", exact: true })
            .waitFor();
        }
        if (route === "notifications") {
          await page
            .getByRole("button", { name: "Add reminder", exact: true })
            .click();
          await page
            .getByLabel("Title", { exact: true })
            .fill("Study reminder");
          for (const control of await page
            .locator("form input:not([type=checkbox]),form select,form button")
            .all())
            assert.ok((await control.boundingBox()).height >= 44);
        }
        if (route === "assistant") {
          await page.getByLabel("Your request").fill("Plan my week");
          await page
            .getByRole("button", { name: "Ask assistant", exact: true })
            .click();
          await page
            .getByRole("button", {
              name: "Apply reviewed changes",
              exact: true,
            })
            .click();
          await page.getByText("Changes applied.", { exact: true }).waitFor();
        }
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          width,
          route + " overflow",
        );
        assert.deepEqual(errors, [], route + " runtime errors");
        if (width < 640) {
          const nav = page.locator("nav:visible");
          assert.equal(await nav.getByRole("link").count(), 5);
          for (const link of await nav.getByRole("link").all()) {
            const box = await link.boundingBox();
            assert.ok(box.width >= 44 && box.height >= 44);
          }
        }
        await page.screenshot({
          path: path.join(
            path.join(process.cwd(), "out/mobile-check"),
            "integration-" + route + "-" + width + "-" + theme + ".png",
          ),
          fullPage: true,
        });
        await page.close();
      }
    console.log("40 route/viewport/theme checks passed: 375, 390, 430, 1280px, dark and light");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exit(1);
});
