/* eslint-disable @typescript-eslint/no-require-imports */
// Run ui-build.cjs, then figma-build.cjs first. Real components, synthetic data.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('@playwright/test');
const dir = path.resolve('out/mobile-check');
const sizes = [{width:375,height:812},{width:390,height:844},{width:430,height:932}];
const routes = ['dashboard','todos','calendar','assistant','friends','profile','notifications'];
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  const file = url.pathname === '/fonts/manrope.ttf' ? path.resolve('public/fonts/manrope.ttf')
    : ['/bundle.js','/bundle.css','/styles.css'].includes(url.pathname) ? path.join(dir,url.pathname)
    : path.join(dir,'index.html');
  let content = fs.readFileSync(file);
  if (file.endsWith('.html')) content = content.toString().replace('initial-scale=1','initial-scale=1, viewport-fit=cover');
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.ttf') ? 'font/ttf' : 'text/html');
  res.end(content);
});
async function assertLayout(page, size, name) {
  const metrics = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    visual: window.visualViewport.width,
    scale: window.visualViewport.scale,
    x: window.scrollX,
  }));
  assert.ok(metrics.scroll <= metrics.inner, `${name}: scrollWidth <= innerWidth: ${JSON.stringify(metrics)}`);
  // Mobile browsers can inflate innerWidth in response to overflow. Check it too.
  assert.equal(metrics.inner, size.width, `${name}: layout viewport inflated`);
  assert.equal(Math.round(metrics.visual), size.width, `${name}: visual viewport changed`);
  assert.equal(metrics.scale, 1, `${name}: unexpected automatic zoom`);
  assert.equal(metrics.x, 0, `${name}: page panned horizontally`);
  const nav = page.getByRole('navigation',{name:'Mobile navigation'});
  assert.equal(await nav.evaluate(e=>getComputedStyle(e).display),'grid');
  const links = nav.getByRole('link');
  assert.deepEqual(await links.allTextContents(),['Home','To-Dos','Calendar','Assistant','More']);
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= metrics.visual + .1 && box.y >= 0 && box.y + box.height <= size.height + .1, `${name}: nav item outside viewport`);
    assert.ok(box.width >= 44 && box.height >= 44, `${name}: nav target too small`);
  }
  return nav.boundingBox();
}
async function openDialog(page, route) {
  if (route === 'dashboard') await page.getByRole('button',{name:'Add habit',exact:true}).click();
  else if (route === 'todos') await page.getByRole('button',{name:'Add task',exact:true}).click();
  else if (route === 'calendar') await page.getByRole('button',{name:'Add commitment',exact:true}).click();
  else if (route === 'friends') await page.getByRole('button',{name:'Add',exact:true}).click();
  else return false;
  await page.getByRole('dialog').waitFor();
  return true;
}
(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let passed = 0;
  try {
    for (const [engine,type] of Object.entries(process.argv.includes('--webkit') ? {webkit} : {chromium,webkit})) {
      const browser = await type.launch();
      try {
        for (const theme of ['dark','light']) for (const size of sizes) for (const route of routes) {
          const context = await browser.newContext({viewport:size,isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
          await context.addInitScript(theme=>{document.addEventListener('DOMContentLoaded',()=>document.documentElement.dataset.theme=theme);},theme);
          const page = await context.newPage();
          const errors=[];page.on('pageerror',error=>errors.push(error.message));
          const name = `${engine} ${route} ${size.width}x${size.height} ${theme}`;
          await page.goto(`${origin}/?page=${route}`);
          await page.locator('.app-shell').waitFor();
          await page.evaluate(()=>document.fonts.ready);
          await page.waitForTimeout(200);
          const navBefore = await assertLayout(page,size,name);
          if (route==='dashboard') {
            await page.screenshot({path:path.join(dir,`mobile-home-${size.width}x${size.height}-${theme}-${engine}.png`)});
            await page.screenshot({path:path.join(dir,`mobile-home-${size.width}x${size.height}-${theme}-${engine}-full.png`),fullPage:true});
            const title=page.locator('.focus-task span').first();
            const original=await title.textContent();
            await title.evaluate(e=>e.textContent='https://example.com/'+ 'a'.repeat(180));
            await assertLayout(page,size,`${name} long task title`);
            const box=await title.boundingBox();
            assert.ok(box.x>=0 && box.x+box.width<=size.width,`${name}: title clips`);
            await title.evaluate((e,text)=>e.textContent=text,original);
            await page.getByRole('button',{name:'Filter habits'}).click();
            await assertLayout(page,size,`${name} filter menu`);
            await page.getByRole('button',{name:'Filter habits'}).click();
            await page.getByRole('button',{name:'Attach / view proof'}).first().click();
            await assertLayout(page,size,`${name} proof expanded`);
          }
          // Existing internal habit/calendar scrollers are intentional; page scrolling is not.
          await page.evaluate(()=>window.scrollTo(100,document.documentElement.scrollHeight));
          const navAfter=await assertLayout(page,size,`${name} scrolled`);
          assert.equal(navAfter.y,navBefore.y,`${name}: navigation moved during vertical scroll`);
          const lastBottom=await page.locator('main > div').last().evaluate(e=>e.getBoundingClientRect().bottom);
          assert.ok(lastBottom<=navAfter.y+.1,`${name}: content covered at end of scroll`);
          await page.evaluate(()=>window.scrollTo(0,0));
          if(await openDialog(page,route)) {
            await assertLayout(page,size,`${name} modal`);
            const fields=page.getByRole('dialog').locator('input:not([type=checkbox]):not([type=radio]),select,textarea');
            for(const field of await fields.all()) assert.ok(await field.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16),`${name}: input can trigger iOS zoom`);
            await fields.first().focus();
            // Desktop automation does not open a native phone keyboard. Exercise the reduced viewport.
            const keyboardSize={width:size.width,height:360};
            await page.setViewportSize(keyboardSize);
            await assertLayout(page,keyboardSize,`${name} keyboard-sized viewport`);
            const dialog=page.getByRole('dialog');
            const box=await dialog.boundingBox();
            assert.ok(box.x>=0 && box.x+box.width<=size.width && box.y>=0 && box.y+box.height<=360,`${name}: dialog does not fit`);
            await dialog.getByRole('button',{name:'Close',exact:true}).click();
            await page.setViewportSize(size);
            await assertLayout(page,size,`${name} modal closed`);
          }
          await page.setViewportSize({width:size.height,height:size.width});
          await assertLayout(page,{width:size.height,height:size.width},`${name} landscape`);
          await page.setViewportSize(size);
          await assertLayout(page,size,`${name} restored portrait`);
          await page.goto(`${origin}/?page=${route}&history=next`);
          await page.goBack();
          await page.locator('.app-shell').waitFor();
          await assertLayout(page,size,`${name} browser Back`);
          assert.deepEqual(errors,[],`${name}: runtime errors`);
          await context.close();
          passed++;
        }
      } finally {await browser.close();}
      console.log(`${engine}: mobile route/theme/size checks passed`);
    }
    console.log(`${passed} mobile checks passed, including overflow, all five nav targets, long titles, scrolling, dialogs, reduced viewport, orientation and browser Back.`);
  } finally {server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
